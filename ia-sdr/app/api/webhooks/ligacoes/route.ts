/**
 * Webhook das ligações (empresa parceira) → funil "Ligações · Lista" do portal.
 *
 *   POST /api/webhooks/ligacoes
 *   Header: x-webhook-secret: <LIGACOES_WEBHOOK_SECRET>   (ou ?secret=... na URL, para sistemas que não mandam header)
 *   Corpo: um contato { id, empresa|nome, telefone, status|etapa, atendida, tentativas, valor, observacoes }
 *          ou uma lista [ {...}, {...} ] ou { contatos: [...] }
 *
 * Se o telefone já é de um lead do funil (prospecção da Gabi e da Marina), o resultado da ligação vira
 * comentário no card dele (com o resumo da IA de ligação) e a etapa avança quando a ligação marcou
 * interesse, reunião ou recusa (21/11/2026). Nada de card duplicado.
 * Senão, o contato é gravado pelo id da empresa parceira: se já existe, atualiza a etapa e as tentativas.
 * Nada é enviado para o lead daqui: só registra para o funil e os indicadores.
 */
import { db } from "@/src/lib/db.ts";
import { lerLigacao, type LigacaoRecebida } from "@/src/lib/ligacoes.ts";
import { ehCallface, tratarCallface } from "@/src/lib/callface.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

const json = (b: unknown, status = 200) => Response.json(b, { status });

export async function POST(req: Request) {
  const segredo = process.env.LIGACOES_WEBHOOK_SECRET || "";
  if (!segredo) return json({ error: "webhook de ligações ainda não configurado (falta LIGACOES_WEBHOOK_SECRET na Vercel)" }, 503);
  const url = new URL(req.url);
  // Callface manda o valor fixo no header X-Callface-Signature (23/11)
  const recebido = req.headers.get("x-webhook-secret") ?? req.headers.get("x-callface-signature") ?? url.searchParams.get("secret") ?? "";
  if (recebido !== segredo) return json({ error: "unauthorized" }, 401);

  const corpo = (await req.json().catch(() => null)) as unknown;
  // Ligações da Gabi pelo Callface: lê a ligação, marca a reunião e confirma no WhatsApp
  if (ehCallface(corpo)) {
    try {
      return json(await tratarCallface(corpo));
    } catch (e) {
      console.error("Callface", e);
      return json({ ok: false, erro: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
    }
  }
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

const ROTULO: Record<string, string> = {
  na_lista: "na lista",
  contato: "não atendeu",
  atendida: "atendeu",
  conversa: "conversou",
  qualificacao: "demonstrou interesse",
  reuniao: "reunião agendada",
  reuniao_realizada: "reunião realizada",
  proposta: "negociação",
  ganho: "venda",
  perdido: "sem interesse",
};
const ORDEM = ["respondeu", "qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"];

/** Lead do funil com esse telefone: comentário no card e etapa. true = tratado aqui. */
async function noFunil(l: LigacaoRecebida, bruto: Record<string, unknown>): Promise<boolean> {
  const fim = (l.whatsapp ?? "").replace(/\D/g, "").slice(-8);
  if (fim.length < 8) return false;
  const { data: o } = await db()
    .from("outreach_leads")
    .select("place_id, status_comercial")
    .like("whatsapp", `%${fim}`)
    .not("place_id", "like", "%_comercial")
    .limit(1)
    .maybeSingle();
  if (!o) return false;
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const gravacao = typeof bruto.gravacao_url === "string" ? bruto.gravacao_url : typeof bruto.recording_url === "string" ? bruto.recording_url : null;
  const texto = [`📞 Ligação ${quando}: ${ROTULO[l.etapa] ?? l.etapa}`, l.observacoes, gravacao ? `Gravação: ${gravacao}` : null].filter(Boolean).join("\n");
  await db().from("comercial_card_notas").insert({ card: `g:${o.place_id}`, texto: texto.slice(0, 4000) });
  // Etapa: avança com interesse, reunião ou venda; recusa vai para perdido
  const atual = (o as { status_comercial: string | null }).status_comercial;
  const alvo = l.etapa === "perdido" ? "perdido" : ["qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"].includes(l.etapa) ? l.etapa : null;
  if (alvo === "perdido" && !["reuniao", "reuniao_realizada", "proposta", "ganho"].includes(atual ?? "")) {
    await db().from("outreach_leads").update({ status_comercial: "perdido", cadencia: "parada", proximo_toque_em: null, proximo_canal: null }).eq("place_id", (o as { place_id: string }).place_id);
  } else if (alvo && ORDEM.indexOf(alvo) > ORDEM.indexOf(atual ?? "")) {
    await db().from("outreach_leads").update({ status_comercial: alvo }).eq("place_id", (o as { place_id: string }).place_id);
  }
  return true;
}

async function gravar(l: LigacaoRecebida, bruto: Record<string, unknown>): Promise<string | null> {
  if (await noFunil(l, bruto).catch(() => false)) return null;
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
