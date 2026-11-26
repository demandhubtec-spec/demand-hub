/**
 * Listas de ligação montadas no banco (tabela export_ligacoes) para subir no Callface.
 * GET ?k=<chave aleatória> → o CSV daquela lista. Vale 2 dias. Só o Callface (e o portal) podem ler pelo navegador.
 */
import { db } from "@/src/lib/db.ts";

export const runtime = "nodejs";

const ORIGENS = ["https://app.callface.ai", "https://portal.demandhub.com.br"];
function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return { "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0], Vary: "Origin" };
}

export async function GET(req: Request) {
  const h = cors(req);
  const k = new URL(req.url).searchParams.get("k") ?? "";
  if (k.length < 20) return new Response("not found", { status: 404, headers: h });
  const desde = new Date(Date.now() - 2 * 864e5).toISOString();
  const { data } = await db().from("export_ligacoes").select("conteudo").eq("k", k).gte("criado_em", desde).maybeSingle();
  const c = (data as { conteudo?: string } | null)?.conteudo;
  if (!c) return new Response("not found", { status: 404, headers: h });
  return new Response(c, { status: 200, headers: { ...h, "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
}
