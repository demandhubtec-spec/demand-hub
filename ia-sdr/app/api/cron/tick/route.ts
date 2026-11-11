/**
 * Roda a cada 10 minutos (Vercel Cron ou pg_cron do Supabase).
 * Também vigia a conexão do WhatsApp e reconecta sozinho se cair.
 * Autenticação: header "Authorization: Bearer CRON_SECRET".
 */
import { env } from "@/src/lib/env.ts";
import { runFollowUps, runMeetingReminders } from "@/src/lib/jobs.ts";
import { ensureWhatsAppConnected } from "@/src/lib/whatsapp-health.ts";
import { lembrarPedidos } from "@/src/lib/canal.ts";
import { runRetomadas } from "@/src/lib/retomadas.ts";
import { runDemoAcompanhamento } from "@/src/lib/demo-jobs.ts";
import { rodarLeoComVez } from "@/src/lib/leo.ts";
import { runRitaEDuda } from "@/src/lib/rita.ts";
import { db } from "@/src/lib/db.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handler(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  // Cada etapa tem limite de tempo e erro próprio: uma etapa travada ou com erro não derruba as outras
  // (antes, um erro nos lembretes parava o relógio inteiro e o Léo nunca rodava).
  const etapa = <T,>(fn: () => Promise<T>, ms: number) =>
    Promise.race([fn(), new Promise<never>((_, nao) => setTimeout(() => nao(new Error(`passou de ${ms / 1000} s`)), ms))]).catch((e) => ({
      error: String((e as Error)?.message ?? e).slice(0, 200),
    }));
  // Léo (ficha das empresas) e Rita/Duda (diagnósticos) começam já, em paralelo com o resto
  const fichas = Promise.all([etapa(rodarLeoComVez, 200_000), etapa(runRitaEDuda, 200_000)]);
  // Garante que o WhatsApp está conectado; depois manda lembretes e follow-ups.
  const whatsapp = await etapa(ensureWhatsAppConnected, 40_000);
  // Follow-ups ligados? O Kelvin desliga tudo colocando 0 em "Follow-ups de WhatsApp por dia" (Prospecção > Controles)
  const { data: cfg } = await db().from("outreach_config").select("followup_daily_cap").eq("id", 1).maybeSingle();
  const followupsLigados = ((cfg as { followup_daily_cap?: number } | null)?.followup_daily_cap ?? 40) > 0;
  const desligado = { skipped: "follow-ups desligados pelo Kelvin" };
  const [reminders, followups, pedidos] = await Promise.all([
    etapa(runMeetingReminders, 60_000),
    followupsLigados ? etapa(runFollowUps, 120_000) : desligado,
    etapa(lembrarPedidos, 30_000), // orientação que a Ana pediu e ainda não teve resposta
  ]);
  // Conversas da prospecção que pararam: a Ana propõe a retomada e espera o ok
  const retomadas = followupsLigados ? await etapa(runRetomadas, 60_000) : desligado;
  // Quem pediu a demo da recepcionista e parou: cutucada (15 min) e retomada da Ana (2 h), no mesmo dia
  const demo = followupsLigados ? await etapa(runDemoAcompanhamento, 60_000) : desligado;
  const [leo, rita] = await fichas;
  // O Estúdio (Time de Marketing IA) tem relógio próprio, a cada minuto: /api/cron/estudio
  return Response.json({ ok: true, whatsapp, reminders, followups, pedidos, retomadas, demo, leo, rita });
}

export const GET = handler;
export const POST = handler;
