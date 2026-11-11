/**
 * Webhook das ligações (empresa parceira) → funil "Ligações · Lista" do portal.
 *
 *   POST /api/webhooks/ligacoes
 *   Header: x-webhook-secret: <LIGACOES_WEBHOOK_SECRET>   (ou ?secret=... na URL, para sistemas que não mandam header)
 *   Corpo: um contato { id, empresa|nome, telefone, status|etapa, atendida, tentativas, valor, observacoes }
 *          ou uma lista [ {...}, {...} ] ou { contatos: [...] }
 *
 * Cada contato é gravado pelo id da empresa parceira: se já existe, atualiza a etapa e as tentativas.
 * Nada é enviado para o lead daqui: só registra para o funil e os indicadores.
 */
import { db } from "@/src/lib/db.ts";
import { lerLigacao, type LigacaoRecebida } from "@/src/lib/ligacoes.ts";

export const runtime = "nodejs";

const json = (b: unknown, status = 200) => Response.json(b, { status });

export async function POST(req: Request) {
  const segredo = process.env.LIGACOES_WEBHOOK_SECRET || "";
  if (!segredo) return json({ error: "webhook de ligações ainda não configurado (falta LIGACOES_WEBHOOK_SECRET na Vercel)" }, 503);
  const url = new URL(req.url);
  const recebido = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
  if (recebido !== segredo) return json({ error: "unauthorized" }, 401);

  const corpo = (await req.json().catch(() => null)) as unknown;
  const itens: Record<string, unknown>[] = Array.isArray(corpo)
    ? corpo
    : corpo && typeof corpo === "object" && Array.isArray((corpo as { contatos?: unknown }).contatos)
      ? (corpo as { contatos: Record<string, unknown>[] }).contatos
      : corpo && typeof corpo === "object"
        ? [corpo as Record<string, unknown>]
        : [];
  if (!itens.length) return json({ error: "corpo vazio ou fora do formato" }, 400);

  let gravados = 0;
  const erros: string[] = [];
  for (const item of itens.slice(0, 500)) {
    const l = lerLigacao(item);
    if ("erro" in l) {
      erros.push(l.erro);
      continue;
    }
    const r = await gravar(l, item);
    if (r) erros.push(r);
    else gravados++;
  }
  return json({ ok: true, gravados, erros });
}

async function gravar(l: LigacaoRecebida, bruto: Record<string, unknown>): Promise<string | null> {
  const { data: atual } = await db()
    .from("comercial_lista_leads")
    .select("id,tentativas")
    .eq("lista", "ligacoes")
    .eq("externo_id", l.externo_id)
    .maybeSingle();
  const campos = {
    empresa: l.empresa,
    whatsapp: l.whatsapp,
    email: l.email,
    nicho: l.nicho,
    cidade: l.cidade,
    etapa: l.etapa,
    valor: l.valor,
    observacoes: l.observacoes,
    canal: "ligação",
    payload: bruto,
  };
  if (atual) {
    const tentativas = Math.max((atual as { tentativas: number }).tentativas ?? 0, l.tentativas);
    const { error } = await db().from("comercial_lista_leads").update({ ...campos, tentativas }).eq("id", (atual as { id: string }).id);
    return error ? error.message : null;
  }
  const { error } = await db()
    .from("comercial_lista_leads")
    .insert({ ...campos, lista: "ligacoes", externo_id: l.externo_id, tentativas: l.tentativas, rodada: "Ligações" });
  return error ? error.message : null;
}

export async function GET() {
  return json({ ok: true, como_usar: "POST com o header x-webhook-secret e o contato no corpo (JSON)" });
}
