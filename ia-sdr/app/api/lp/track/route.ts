/**
 * Recebe os eventos anônimos do rastreador da landing page (/diagnostico) e grava
 * em lp_eventos. É o nosso "Clarity" próprio: cliques, rolagem, seções vistas e
 * etapas do formulário. Nunca recebe o que a pessoa digitou.
 */
import { db } from "@/src/lib/db.ts";

export const runtime = "nodejs";

const TIPOS = new Set(["view", "click", "section", "form_start", "form_step", "form_submit", "leave"]);
const DISPOSITIVOS = new Set(["mobile", "tablet", "desktop"]);
const ID = /^[a-z0-9]{8,32}$/;
const ROBO = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp/i;
const MAX_BYTES = 32_000;
const MAX_EVENTOS = 60;

const txt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null;
const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;

function mesmaOrigem(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // sendBeacon de alguns navegadores não manda Origin
  try {
    return new URL(origin).host === new URL(req.url).host || /(^|\.)demandhub\.com\.br$/.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return new Response(null, { status: 403 });
  if (ROBO.test(req.headers.get("user-agent") || "")) return new Response(null, { status: 204 });

  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BYTES) return new Response(null, { status: 413 });

  let body: { v?: unknown; s?: unknown; p?: unknown; e?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const visitante = typeof body.v === "string" && ID.test(body.v) ? body.v : null;
  const sessao = typeof body.s === "string" && ID.test(body.s) ? body.s : null;
  if (!visitante || !sessao || !Array.isArray(body.e)) return new Response(null, { status: 400 });
  const pagina = txt(body.p, 40) || "diagnostico";

  const linhas = (body.e as Record<string, unknown>[])
    .slice(0, MAX_EVENTOS)
    .filter((ev) => ev && typeof ev === "object" && TIPOS.has(String(ev.t)))
    .map((ev) => ({
      pagina,
      visitante,
      sessao,
      tipo: String(ev.t),
      dispositivo: DISPOSITIVOS.has(String(ev.d)) ? String(ev.d) : null,
      largura: int(ev.w, 0, 10000),
      altura_pagina: int(ev.h, 0, 100000),
      x_pct: num(ev.xp, 0, 100),
      x_centro: int(ev.xc, -5000, 5000),
      y_px: int(ev.y, 0, 100000),
      alvo: txt(ev.a, 60),
      rage: ev.r === true,
      secao: txt(ev.sc, 40),
      etapa: int(ev.et, 0, 99),
      profundidade: int(ev.pf, 0, 100),
      duracao_ms: int(ev.ms, 0, 86_400_000),
      origem: txt(ev.o, 80),
      utm_source: txt(ev.us, 120),
      utm_medium: txt(ev.um, 120),
      utm_campaign: txt(ev.uc, 160),
      utm_content: txt(ev.ux, 160),
      referrer: txt(ev.rf, 200),
    }));

  if (linhas.length) {
    const { error } = await db().from("lp_eventos").insert(linhas);
    if (error) return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
