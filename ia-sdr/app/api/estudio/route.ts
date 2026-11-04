/**
 * Estúdio · ações pedidas pelo portal (só perfil "dono").
 *   POST { acao: "verificar", username }  → confere o @ na Meta e salva como fonte do Radar
 *   POST { acao: "rodar", etapa }         → roda um agente agora (radar | pauteiro | redator | diretor | publicador)
 */
import { db } from "@/src/lib/db.ts";
import { lerConfig, rodarDiretor, rodarPauteiro, rodarPublicador, rodarRadar, rodarRedator, verificarConta } from "@/src/lib/estudio/agentes.ts";

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

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db().auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
  if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as { acao?: string; username?: string; etapa?: string };
  try {
    if (body.acao === "verificar") {
      if (!body.username?.trim()) return json({ error: "informe o @" }, 400);
      return json(await verificarConta(body.username));
    }
    if (body.acao === "rodar") {
      const c = await lerConfig();
      switch (body.etapa) {
        case "radar":
          return json({ ok: true, resultado: await rodarRadar() });
        case "pauteiro":
          return json({ ok: true, resultado: await rodarPauteiro(c, new Date(), 7) });
        case "redator":
          return json({ ok: true, resultado: await rodarRedator(new Date(), 3) });
        case "diretor":
          return json({ ok: true, resultado: await rodarDiretor(3) });
        case "publicador":
          return json({ ok: true, resultado: await rodarPublicador() });
        default:
          return json({ error: "etapa inválida" }, 400);
      }
    }
    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message).slice(0, 400) }, 500);
  }
}
