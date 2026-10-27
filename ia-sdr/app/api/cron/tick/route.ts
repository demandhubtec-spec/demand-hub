/**
 * Roda a cada 10 minutos (Vercel Cron ou pg_cron do Supabase).
 * Também vigia a conexão do WhatsApp e reconecta sozinho se cair.
 * Autenticação: header "Authorization: Bearer CRON_SECRET".
 */
import { env } from "@/src/lib/env.ts";
import { runFollowUps, runMeetingReminders } from "@/src/lib/jobs.ts";
import { ensureWhatsAppConnected } from "@/src/lib/whatsapp-health.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handler(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  // Primeiro garante que o WhatsApp está conectado; depois manda lembretes e follow-ups.
  const whatsapp = await ensureWhatsAppConnected().catch((e) => ({ ok: false, error: String(e) }));
  const [reminders, followups] = await Promise.all([runMeetingReminders(), runFollowUps()]);
  return Response.json({ ok: true, whatsapp, reminders, followups });
}

export const GET = handler;
export const POST = handler;
