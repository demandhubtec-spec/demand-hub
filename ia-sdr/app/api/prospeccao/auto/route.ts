/**
 * Prospecção automática. Chamado de hora em hora pelo pg_cron (Authorization: Bearer CRON_SECRET)
 * e pelo botão "Rodar agora" do portal (perfil "dono", com { forcar: true }).
 */
import { db } from "@/src/lib/db.ts";
import { env } from "@/src/lib/env.ts";
import { rodarAuto } from "@/src/lib/auto.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  const auth = req.headers.get("authorization") ?? "";
  const porCron = auth === `Bearer ${env.cronSecret}`;
  if (!porCron) {
    const { data: u } = await db().auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
    if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);
  }
  const body = (await req.json().catch(() => ({}))) as { forcar?: boolean };
  try {
    return json({ ok: true, ...(await rodarAuto({ forcar: !porCron && !!body.forcar })) });
  } catch (e) {
    await db().from("outreach_log").insert({ channel: "auto", event: "error", detail: { msg: String((e as Error).message ?? e).slice(0, 300) } });
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500);
  }
}
