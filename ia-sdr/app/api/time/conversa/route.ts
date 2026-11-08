/**
 * Falar com um agente do Time Comercial IA (só perfil "dono").
 *   POST { agente, texto?, midia?: { tipo: "audio", base64, mimetype } } → { ok, pedido, resposta, estrutura }
 * Áudio vira texto (transcrição). O agente analisa o pedido e o contexto e responde com solução e hipóteses.
 */
import { db } from "@/src/lib/db.ts";
import { interpretarMidia } from "@/src/lib/midia.ts";
import { AGENTES, type Agente, responderAgente } from "@/src/lib/conversa-time.ts";

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

export async function POST(req: Request) {
  const h = cors(req);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db().auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
  if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as { agente?: string; texto?: string; midia?: { tipo?: string; base64?: string; mimetype?: string } };
  const agente = (body.agente ?? "").toLowerCase() as Agente;
  if (!AGENTES.includes(agente)) return json({ error: "agente desconhecido" }, 400);

  let pedido = (body.texto ?? "").trim();
  let tipo: "texto" | "audio" = "texto";
  if (body.midia?.base64 && body.midia.tipo === "audio") {
    tipo = "audio";
    const lido = await interpretarMidia({ tipo: "audio", base64: body.midia.base64, mimetype: body.midia.mimetype || "audio/webm" });
    if (!lido) return json({ error: "não consegui entender o áudio, tenta de novo" }, 422);
    pedido = lido;
  }
  if (!pedido) return json({ error: "escreva ou grave o que você quer" }, 400);

  await db().from("time_conversas").insert({ agente, autor: "kelvin", tipo, conteudo: pedido });
  try {
    const { texto, estrutura } = await responderAgente(agente, pedido);
    await db().from("time_conversas").insert({ agente, autor: "agente", conteudo: texto, estrutura });
    return json({ ok: true, pedido, resposta: texto, estrutura });
  } catch (e) {
    console.error("conversa com agente falhou", e);
    return json({ error: "o agente não conseguiu responder agora, tenta de novo em instantes" }, 502);
  }
}
