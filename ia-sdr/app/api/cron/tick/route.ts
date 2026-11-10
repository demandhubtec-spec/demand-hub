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
import { runLeo } from "@/src/lib/leo.ts";
import { runRitaEDuda } from "@/src/lib/rita.ts";
import { db } from "@/src/lib/db.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handler(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  // Primeiro garante que o WhatsApp está conectado; depois manda lembretes e follow-ups.
  const whatsapp = await ensureWhatsAppConnected().catch((e) => ({ ok: false, error: String(e) }));
  // Follow-ups ligados? O Kelvin desliga tudo colocando 0 em "Follow-ups de WhatsApp por dia" (Prospecção > Controles)
  const { data: cfg } = await db().from("outreach_config").select("followup_daily_cap").eq("id", 1).maybeSingle();
  const followupsLigados = ((cfg as { followup_daily_cap?: number } | null)?.followup_daily_cap ?? 40) > 0;
  const desligado = { skipped: "follow-ups desligados pelo Kelvin" };
  const [reminders, followups, pedidos] = await Promise.all([
    runMeetingReminders(),
    followupsLigados ? runFollowUps() : desligado,
    lembrarPedidos().catch(() => 0), // orientação que a Ana pediu e ainda não teve resposta
  ]);
  // Conversas da prospecção que pararam: a Ana propõe a retomada e espera o ok
  const retomadas = followupsLigados ? await runRetomadas().catch((e) => ({ error: String(e) })) : desligado;
  // Quem pediu a demo da recepcionista e parou: cutucada (15 min) e retomada da Ana (2 h), no mesmo dia
  const demo = followupsLigados ? await runDemoAcompanhamento().catch((e) => ({ error: String(e) })) : desligado;
  // Léo completa a ficha das empresas da lista (site de verdade, CNPJ, sócios e dono)
  const leo = await runLeo().catch((e) => ({ error: String(e) }));
  // Rita (diagnósticos) e Duda (relatório e site) para quem o Kelvin aprovou
  const rita = await runRitaEDuda().catch((e) => ({ error: String(e) }));
  // O Estúdio (Time de Marketing IA) tem relógio próprio, a cada minuto: /api/cron/estudio
  return Response.json({ ok: true, whatsapp, reminders, followups, pedidos, retomadas, demo, leo, rita });
}

export const GET = handler;
export const POST = handler;
