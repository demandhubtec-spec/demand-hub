/**
 * Roda a cada 10 minutos (Vercel Cron ou pg_cron do Supabase).
 * Autenticação: header "Authorization: Bearer CRON_SECRET".
 */
import { env } from "@/src/lib/env.ts";
import { runFollowUps, runMeetingReminders } from "@/src/lib/jobs.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handler(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const [reminders, followups] = await Promise.all([runMeetingReminders(), runFollowUps()]);
  return Response.json({ ok: true, reminders, followups });
}

export const GET = handler;
export const POST = handler;
