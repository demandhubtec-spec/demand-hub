/**
 * Lista do Instagram → fluxo do time (Rita, Duda, Bia e Rui, Gabi). Só perfil "dono" do portal.
 *   POST { ids: string[] }  (ids da comercial_lista_leads)
 *   → { ok, enviados, sem_whatsapp, ja_estavam, nomes }
 */
import { db } from "@/src/lib/db.ts";
import { mandarParaOTime } from "@/src/lib/lista-instagram.ts";

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

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  if (!ids.length) return json({ error: "escolha pelo menos um lead" }, 400);
  try {
    return json({ ok: true, ...(await mandarParaOTime(ids)) });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500);
  }
}
