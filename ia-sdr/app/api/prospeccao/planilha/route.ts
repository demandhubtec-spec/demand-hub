/**
 * Lista do Léo no Google Sheets (só perfil "dono").
 *   POST {}  → { url } com a planilha atualizada, ou { conectar } com o link para autorizar o Google uma vez.
 */
import { db } from "@/src/lib/db.ts";
import { authUrl, oauthState } from "@/src/lib/google.ts";
import { publicarPlanilhaDoLeo } from "@/src/lib/leo-planilha.ts";

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

  const { data: conexao } = await db().from("sdr_integrations").select("value").eq("key", "planilhas").maybeSingle();
  if (!(conexao?.value as { refresh_token?: string } | undefined)?.refresh_token) {
    return json({ conectar: authUrl(oauthState("planilhas"), "planilhas") });
  }
  try {
    return json({ url: await publicarPlanilhaDoLeo() });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
}
