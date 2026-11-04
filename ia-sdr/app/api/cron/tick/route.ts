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
import { estudioTick } from "@/src/lib/estudio/agentes.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handler(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  // Primeiro garante que o WhatsApp está conectado; depois manda lembretes e follow-ups.
  const whatsapp = await ensureWhatsAppConnected().catch((e) => ({ ok: false, error: String(e) }));
  const [reminders, followups, pedidos] = await Promise.all([
    runMeetingReminders(),
    runFollowUps(),
    lembrarPedidos().catch(() => 0), // orientação que a Ana pediu e ainda não teve resposta
  ]);
  // Conversas da prospecção que pararam: a Ana propõe a retomada e espera o ok
  const retomadas = await runRetomadas().catch((e) => ({ error: String(e) }));
  // Estúdio: pesquisa, pautas, copy, arte e publicação no Instagram (cada agente pega pouco por vez)
  const estudio = await estudioTick().catch((e) => ({ error: String(e) }));
  return Response.json({ ok: true, whatsapp, reminders, followups, pedidos, retomadas, estudio });
}

export const GET = handler;
export const POST = handler;
