/**
 * Canal "Você e a Ana" · o Kelvin manda uma orientação pelo portal (só perfil "dono").
 *   POST { lead_id?, texto?, midia?: { tipo: "audio" | "imagem", base64, mimetype } } → { ok }
 * Áudio vira texto (transcrição) e imagem vira descrição; a Ana aplica e responde no próprio canal.
 */
import { waitUntil } from "@vercel/functions";
import { db } from "@/src/lib/db.ts";
import { interpretarMidia, type MidiaRecebida } from "@/src/lib/midia.ts";
import { processarOrientacao, registrar } from "@/src/lib/canal.ts";

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

  const body = (await req.json().catch(() => ({}))) as {
    lead_id?: string | null;
    texto?: string;
    midia?: { tipo?: string; base64?: string; mimetype?: string };
  };
  let conteudo = (body.texto ?? "").trim();
  let tipo: "texto" | "audio" | "imagem" = "texto";
  if (body.midia?.base64 && (body.midia.tipo === "audio" || body.midia.tipo === "imagem")) {
    tipo = body.midia.tipo;
    const m: MidiaRecebida = { tipo, base64: body.midia.base64, mimetype: body.midia.mimetype || (tipo === "audio" ? "audio/webm" : "image/jpeg"), legenda: conteudo || null };
    const lido = await interpretarMidia(m);
    if (!lido) return json({ error: tipo === "audio" ? "não consegui entender o áudio, tenta de novo" : "não consegui ler a imagem" }, 422);
    conteudo = tipo === "imagem" && conteudo ? `${conteudo}\n${lido}` : lido;
  }
  if (!conteudo) return json({ error: "escreva ou grave a orientação" }, 400);

  const leadId = body.lead_id || null;
  await registrar({ lead_id: leadId, autor: "kelvin", tipo, conteudo, origem: "portal" });
  waitUntil(processarOrientacao({ leadId, conteudo, origem: "portal" }).catch((e) => console.error("orientação falhou", e)));
  return json({ ok: true, conteudo });
}
