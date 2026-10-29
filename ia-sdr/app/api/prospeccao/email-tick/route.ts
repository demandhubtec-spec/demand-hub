/**
 * Prospecção ativa · e-mail. Chamado a cada minuto pelo pg_cron do Supabase
 * (job "outreach-email-tick"). Autenticação: header "Authorization: Bearer CRON_SECRET".
 */
import { env } from "@/src/lib/env.ts";
import { runEmailTick } from "@/src/lib/outreach-email.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handler(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const result = await runEmailTick().catch((e) => ({ error: String(e) }));
  return Response.json(result);
}

export const GET = handler;
export const POST = handler;
