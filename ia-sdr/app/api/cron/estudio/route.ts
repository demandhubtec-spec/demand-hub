/**
 * Relógio do Time de Marketing IA: roda a cada minuto (pg_cron do Supabase, job "estudio-tick").
 * Só uma rodada trabalha por vez: quem chega enquanto outra ainda está rodando sai sem fazer nada.
 * Autenticação: header "Authorization: Bearer CRON_SECRET".
 */
import { env } from "@/src/lib/env.ts";
import { db } from "@/src/lib/db.ts";
import { estudioTick } from "@/src/lib/estudio/agentes.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handler(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const { data: vez, error } = await db().rpc("estudio_pegar_vez", { segundos: 290 });
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });
  if (!vez) return Response.json({ ok: true, ocupado: true });
  try {
    const estudio = await estudioTick();
    return Response.json({ ok: true, estudio });
  } catch (e) {
    return Response.json({ ok: false, erro: String((e as Error).message) }, { status: 500 });
  } finally {
    await db().rpc("estudio_soltar_vez");
  }
}

export const GET = handler;
export const POST = handler;
