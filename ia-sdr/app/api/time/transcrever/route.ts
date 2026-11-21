/**
 * Transcreve um áudio do Kelvin (só perfil "dono") para virar comentário no card do funil (21/11/2026).
 *   POST { base64, mimetype } → { ok, texto }
 */
import { db } from "@/src/lib/db.ts";
import { interpretarMidia } from "@/src/lib/midia.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

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

export async function POST(req: Request) {
  const h = cors(req);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db().auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
  if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as { base64?: string; mimetype?: string };
  if (!body.base64) return json({ error: "áudio vazio" }, 400);
  const lido = await interpretarMidia({ tipo: "audio", base64: body.base64, mimetype: body.mimetype || "audio/webm" });
  if (!lido) return json({ error: "não consegui entender o áudio, tenta de novo" }, 422);
  return json({ ok: true, texto: lido.replace(/^\[áudio transcrito\]\s*/, "").trim() });
}
