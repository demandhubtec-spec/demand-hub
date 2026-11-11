/**
 * Insights da Gabi · autoanálise das conversas.
 * Roda todo dia às 6h (pg_cron do Supabase, com CRON_SECRET) e pelo botão "Analisar agora" do portal (login do dono).
 * Só sugere: a correção no manual da Gabi ou da Marina só vale depois que o Kelvin aprova no portal.
 */
import { db } from "@/src/lib/db.ts";
import { env } from "@/src/lib/env.ts";
import { rodarInsights } from "@/src/lib/insights.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

const ORIGENS = ["https://portal.demandhub.com.br", "https://demand-hub-tau.vercel.app", "http://localhost:5173"];
function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

async function handler(req: Request) {
  const h = cors(req);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (token !== env.cronSecret) {
    const { data: u } = await db().auth.getUser(token);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
    if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);
  }
  try {
    const r = await rodarInsights();
    return json({ ok: true, ...r });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
}

export const GET = handler;
export const POST = handler;
export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}
