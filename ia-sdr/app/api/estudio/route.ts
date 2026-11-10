/**
 * Estúdio · ações pedidas pelo portal (só perfil "dono").
 *   POST { acao: "verificar", username }  → confere o @ na Meta e salva como fonte do Radar
 *   POST { acao: "rodar", etapa }         → roda um agente agora (radar | perfil | pauteiro | redator | diretor | publicador)
 *   POST { acao: "conversar", para, texto } → o Kelvin fala com o time ("time") ou com um agente; devolve as respostas
 *   POST { acao: "kairogen", passo }       → conexão com o Kairogen: status | conectar | verificar | sincronizar | modelo | desconectar
 */
import { db } from "@/src/lib/db.ts";
import { conversar, lerConfig, rodarDiretor, rodarPauteiro, rodarPerfil, rodarPublicador, rodarRadar, rodarRedator, verificarConta } from "@/src/lib/estudio/agentes.ts";
import { AGENTES_DO_TIME } from "@/src/lib/estudio/ia.ts";
import { desconectar, escolherModelo, iniciarConexao, infoKairogen, sincronizar, verificarConexao } from "@/src/lib/kairogen.ts";

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

  const body = (await req.json().catch(() => ({}))) as { acao?: string; username?: string; etapa?: string; para?: string; texto?: string; passo?: string; modelo?: string };
  try {
    if (body.acao === "verificar") {
      if (!body.username?.trim()) return json({ error: "informe o @" }, 400);
      return json(await verificarConta(body.username));
    }
    if (body.acao === "conversar") {
      const para = body.para === "time" || (body.para && body.para in AGENTES_DO_TIME) ? body.para : null;
      const texto = (body.texto ?? "").trim();
      if (!para || !texto) return json({ error: "informe para (time ou um agente) e texto" }, 400);
      return json({ ok: true, ...(await conversar(para, texto)) });
    }
    if (body.acao === "kairogen") {
      switch (body.passo) {
        case "status":
          return json({ ok: true, info: await infoKairogen() });
        case "conectar":
          return json({ ok: true, ...(await iniciarConexao()) });
        case "verificar":
          return json({ ok: true, ...(await verificarConexao()) });
        case "sincronizar":
          return json({ ok: true, info: await sincronizar() });
        case "modelo":
          return json({ ok: true, info: await escolherModelo(body.modelo ?? "") });
        case "desconectar":
          await desconectar();
          return json({ ok: true, info: await infoKairogen() });
        default:
          return json({ error: "passo inválido" }, 400);
      }
    }
    if (body.acao === "rodar") {
      const c = await lerConfig();
      switch (body.etapa) {
        case "perfil":
          return json({ ok: true, resultado: await rodarPerfil() });
        case "radar":
          return json({ ok: true, resultado: await rodarRadar() });
        case "pauteiro":
          return json({ ok: true, resultado: await rodarPauteiro(c, new Date(), 7) });
        case "redator":
          return json({ ok: true, resultado: await rodarRedator(new Date(), 3, c) });
        case "diretor":
          return json({ ok: true, resultado: await rodarDiretor(2, c) });
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
