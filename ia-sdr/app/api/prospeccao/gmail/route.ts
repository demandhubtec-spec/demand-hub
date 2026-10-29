/**
 * Prospecção ativa · conexão do Gmail pelo portal (sem precisar do ADMIN_SECRET).
 * Só o perfil "dono" do portal.
 *
 *   POST { acao: "status" }   → { conectado, email }
 *   POST { acao: "conectar" } → { url }  (o portal abre essa URL do Google para autorizar)
 */
import { db } from "@/src/lib/db.ts";
import { authUrl, oauthState } from "@/src/lib/google.ts";

export const runtime = "nodejs";

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

  const body = (await req.json().catch(() => ({}))) as { acao?: string };
  if (body.acao === "conectar") return json({ url: authUrl(oauthState("gmail"), "gmail") });

  const { data } = await db().from("sdr_integrations").select("value").eq("key", "gmail").maybeSingle();
  const v = (data?.value ?? null) as { refresh_token?: string; email?: string } | null;
  return json({ conectado: !!v?.refresh_token, email: v?.email ?? null });
}
