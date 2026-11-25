/**
 * Prospecção · confere quais números têm WhatsApp, SEM mandar mensagem nenhuma.
 * Serve para listas de fora do Brasil (ex.: piloto EUA), que o Léo não confere (ele só aceita número +55).
 *
 *   POST { numeros: ["+1 508-590-9193", ...] }  (até 100, com o código do país)
 *   → { ok, resultado: [{ numero, whatsapp: true | false | null }] }   (null = o WhatsApp não respondeu)
 *
 * Só o portal logado chama (token do Supabase). Usa a instância da Gabi.
 */
import { db } from "@/src/lib/db.ts";
import { env } from "@/src/lib/env.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

const ORIGENS = ["https://portal.demandhub.com.br", "https://demand-hub-tau.vercel.app", "http://localhost:5173"];
function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

/** Só dígitos, com o código do país (8 a 15 dígitos). */
function soDigitos(n: unknown): string | null {
  const d = String(n ?? "").replace(/\D/g, "").replace(/^00/, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
}

async function checarLote(nums: string[]): Promise<Map<string, boolean> | null> {
  try {
    const r = await fetch(`${env.evolutionUrl}/user/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.evolutionInstanceToken },
      body: JSON.stringify({ number: nums }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { Users?: { Query?: string; IsInWhatsapp?: boolean }[] } };
    const users = j.data?.Users ?? [];
    const out = new Map<string, boolean>();
    nums.forEach((n, i) => {
      const u = users.find((x) => (x.Query ?? "").replace(/\D/g, "") === n) ?? (users.length === nums.length ? users[i] : undefined);
      if (u) out.set(n, !!u.IsInWhatsapp);
    });
    return out;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const h = cors(req);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db().auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as { numeros?: unknown[] };
  const entrada = Array.isArray(body.numeros) ? body.numeros.slice(0, 100) : [];
  if (!entrada.length) return json({ error: "mande numeros: [...]" }, 400);

  const validos = [...new Set(entrada.map(soDigitos).filter((x): x is string => !!x))];
  const achados = new Map<string, boolean>();
  for (let i = 0; i < validos.length; i += 10) {
    const lote = validos.slice(i, i + 10);
    const r = await checarLote(lote);
    r?.forEach((v, k) => achados.set(k, v));
    if (i + 10 < validos.length) await new Promise((res) => setTimeout(res, 800));
  }

  const resultado = entrada.map((n) => {
    const d = soDigitos(n);
    return { numero: String(n), whatsapp: d && achados.has(d) ? achados.get(d)! : null };
  });
  return json({ ok: true, resultado });
}
