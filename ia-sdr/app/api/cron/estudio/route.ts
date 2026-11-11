/**
 * Relógio do Time de Marketing IA: roda a cada minuto (pg_cron do Supabase, job "estudio-tick").
 * Só uma rodada trabalha por vez: quem chega enquanto outra ainda está rodando sai sem fazer nada.
 * Aproveita o mesmo relógio para o Léo rodar a cada minuto (pedido do Kelvin, 11/11), com vez própria.
 * Autenticação: header "Authorization: Bearer CRON_SECRET".
 */
import { env } from "@/src/lib/env.ts";
import { db } from "@/src/lib/db.ts";
import { estudioTick } from "@/src/lib/estudio/agentes.ts";
import { rodarLeoComVez } from "@/src/lib/leo.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handler(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  // Léo a cada minuto, em paralelo com o Estúdio (cada um com a sua vez)
  const leo = rodarLeoComVez().catch((e) => ({ error: String((e as Error)?.message ?? e).slice(0, 200) }));
  const { data: vez, error } = await db().rpc("estudio_pegar_vez", { segundos: 290 });
  if (error) return Response.json({ ok: false, erro: error.message, leo: await leo }, { status: 500 });
  if (!vez) return Response.json({ ok: true, ocupado: true, leo: await leo });
  try {
    const estudio = await estudioTick();
    return Response.json({ ok: true, estudio, leo: await leo });
  } catch (e) {
    return Response.json({ ok: false, erro: String((e as Error).message) }, { status: 500 });
  } finally {
    await db().rpc("estudio_soltar_vez");
  }
}

export const GET = handler;
export const POST = handler;
