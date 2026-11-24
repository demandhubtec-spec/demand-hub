/**
 * Contas dos Indicadores do Time Comercial IA (funções puras).
 * Cada lead ganha um "nível": a etapa mais longe a que já chegou no funil do seu canal.
 * O funil conta, para cada etapa, quantos leads chegaram até ela (quem virou perdido conta até onde foi).
 */
import type { OutreachLead } from "@/hooks/useProspeccao";
import type { Contato } from "@/hooks/useCrm";
import type { CanalFunil, EtapaLista, ListaLead, Metas } from "@/hooks/useComercial";
import { type EtapaUnica, ORDEM_UNICA, etapaInbound, etapaOutbound } from "./funis";

export interface EtapaFunil {
  key: EtapaLista;
  label: string;
  /** O que a etapa conta (texto do "?" ao lado do nome). */
  ajuda?: string;
}

// 21/11 (Kelvin): os funis dos Indicadores seguem exatamente as colunas do Kanban (Funil e contatos)
const FUNIL_KANBAN: EtapaFunil[] = [
  { key: "na_lista", label: "Entrada", ajuda: "Todos os leads do canal: os que ainda vão receber o 1º contato e os que já receberam." },
  { key: "contato", label: "Mensagem ou ligação", ajuda: "Receberam mensagem ou ligação. Abaixo de 100% é o que ainda está na fila." },
  { key: "conversa", label: "Conversa iniciada", ajuda: "Uma pessoa de verdade respondeu e conversou (robô e resposta automática não contam)." },
  { key: "qualificacao", label: "Demonstrou interesse", ajuda: "Na conversa, mostrou interesse: quis saber como funciona, pediu o diagnóstico, topou conversar." },
  { key: "reuniao", label: "Reunião agendada", ajuda: "Marcou reunião com o Kelvin." },
  { key: "reuniao_realizada", label: "Reunião realizada", ajuda: "A reunião aconteceu." },
  { key: "proposta", label: "Negociação", ajuda: "Recebeu proposta ou está negociando." },
  { key: "ganho", label: "Venda", ajuda: "Fechou." },
];

// 23/11 (Kelvin): as ligações da Gabi (Callface) têm funil próprio: ligou, atendeu, conversou com o responsável, interesse, reunião
const FUNIL_LIGACOES: EtapaFunil[] = [
  { key: "na_lista", label: "Na lista", ajuda: "Empresas na lista de ligações." },
  { key: "contato", label: "Ligações feitas", ajuda: "A Gabi ligou (atendendo ou não)." },
  { key: "atendida", label: "Atendeu", ajuda: "Alguém atendeu a ligação (recepção ou responsável)." },
  { key: "conversa", label: "Conversou com o responsável", ajuda: "A Gabi conversou de fato com o dono ou responsável." },
  { key: "qualificacao", label: "Demonstrou interesse", ajuda: "Topou a conversa com o Kelvin ou pediu retorno com interesse." },
  { key: "reuniao", label: "Reunião agendada", ajuda: "A reunião foi marcada na agenda do Kelvin." },
  { key: "reuniao_realizada", label: "Reunião realizada", ajuda: "A reunião aconteceu." },
  { key: "proposta", label: "Negociação", ajuda: "Recebeu proposta ou está negociando." },
  { key: "ganho", label: "Venda", ajuda: "Fechou." },
];

export const ETAPAS_FUNIL: Record<CanalFunil, EtapaFunil[]> = {
  google: FUNIL_KANBAN,
  instagram: FUNIL_KANBAN,
  linkedin: FUNIL_KANBAN,
  ligacoes: FUNIL_LIGACOES,
  relacionamento: FUNIL_KANBAN,
  inbound: [
    { key: "na_lista", label: "Leads do anúncio" },
    { key: "conversa", label: "Conversa iniciada" },
    { key: "qualificacao", label: "Qualificação" },
    { key: "reuniao", label: "Reunião agendada" },
    { key: "reuniao_realizada", label: "Reunião realizada" },
    { key: "proposta", label: "Negociação" },
    { key: "ganho", label: "Venda" },
  ],
};

const ORDEM_GOOGLE = ["disparar", "enviado", "conversa", "qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"];
const ORDEM_INBOUND = ["recebido", "atendimento", "qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"];

/** Nível de um lead do Google (null: ainda não está no funil, está na Aprovação). */
export function nivelGoogle(l: OutreachLead): number | null {
  const e = etapaOutbound(l);
  if (e === null) return null;
  if (e !== "perdido") {
    const i = ORDEM_GOOGLE.indexOf(e);
    return i >= 3 ? i - 1 : i; // sem Qualificação: qualificado = conversa (2), reunião passa a ser 3
  }
  if (l.respondeu_no_toque != null || ["respondeu", "optout"].includes(l.wa_status) || l.email_status === "respondeu") return 2;
  if ((l.toque_atual ?? 0) > 0 || l.wa_sent_at) return 1;
  return 0;
}

/** Nível de um contato inbound. */
export function nivelInbound(c: Pick<Contato, "funil_etapa" | "status" | "last_outbound_at">): number {
  const e = etapaInbound(c);
  if (e !== "perdido") return ORDEM_INBOUND.indexOf(e);
  return c.last_outbound_at ? 1 : 0;
}

/** Ordem global gravada no banco (comercial_etapa_ordem): na_lista 0, contato 1, atendida 2, conversa 3 ... ganho 8. */
const ORDEM_GLOBAL: Record<string, number> = {
  na_lista: 0,
  contato: 1,
  atendida: 2,
  conversa: 3,
  qualificacao: 4,
  reuniao: 5,
  reuniao_realizada: 6,
  proposta: 7,
  ganho: 8,
};

/** Nível de um lead das listas Instagram, LinkedIn ou Ligações. */
export function nivelLista(l: Pick<ListaLead, "lista" | "etapa" | "etapa_max">): number {
  const ordem = l.etapa === "perdido" ? l.etapa_max ?? 0 : Math.max(ORDEM_GLOBAL[l.etapa] ?? 0, l.etapa_max ?? 0);
  if (l.lista === "ligacoes") return ordem;
  // Instagram (18/11): sem "atendida" e sem "qualificacao" (qualificado conta como conversa)
  if (l.lista === "instagram") return ordem >= 4 ? ordem - 2 : ordem >= 3 ? 2 : Math.min(ordem, 1);
  // Instagram e LinkedIn não têm a etapa "atendida"
  return ordem >= 3 ? ordem - 1 : Math.min(ordem, 1);
}

/**
 * Nível no funil do Kanban (21/11): o índice da coluna em que o card está. Perdido conta até onde chegou
 * (alcancou: 0 entrada, 1 mensagem ou ligação, 2 conversa...).
 */
export function nivelKanban(e: EtapaUnica, alcancou = 0): number {
  return e === "perdido" ? alcancou : Math.max(0, ORDEM_UNICA.indexOf(e));
}

/** Até onde um lead perdido da lista chegou, na ordem do Kanban (etapa_max está na ordem global do banco). */
export function alcanceLista(etapaMax: number | null | undefined): number {
  const m = [0, 1, 2, 2, 3, 4, 5, 6, 7];
  return m[Math.max(0, Math.min(8, etapaMax ?? 0))];
}

/** Até onde um lead perdido do Google chegou. */
export function alcanceGoogle(l: OutreachLead, conversou: boolean): number {
  if (conversou || l.respondeu_no_toque != null || l.email_status === "respondeu") return 2;
  if ((l.toque_atual ?? 0) > 0 || l.wa_sent_at) return 1;
  return 0;
}

/** Quantos leads chegaram em cada etapa (o primeiro número é o topo). */
export function contarFunil(niveis: number[], etapas: number): number[] {
  return Array.from({ length: etapas }, (_, i) => niveis.filter((n) => n >= i).length);
}

export type EstadoEtapa = "ok" | "abaixo" | "gargalo" | "sem_base";

export interface LinhaFunil {
  key: EtapaLista;
  label: string;
  ajuda?: string;
  /** Quantos estavam na etapa anterior (base da conversão). */
  anterior: number | null;
  /** Rótulo da etapa anterior. */
  labelAnterior: string | null;
  valor: number;
  conversao: number | null; // % da etapa anterior
  meta: number | null;
  /** Meta em número (21/11): a meta % sobre o realizado da etapa anterior. */
  metaNumero: number | null;
  estado: EstadoEtapa;
}

/** Monta as linhas do funil com a conversão de cada etapa, a meta e o gargalo (etapa mais longe da meta). */
export function linhasFunil(canal: CanalFunil, contagem: number[], metas: Metas | undefined, baseMinima = 3): LinhaFunil[] {
  const etapas = ETAPAS_FUNIL[canal];
  const m = metas?.etapas?.[canal] ?? {};
  // Meta em número (21/11): a meta % aplicada sobre o REALIZADO da etapa anterior
  // (ex.: 300 mensagens e meta de 50% para conversa = meta de 150 conversas)
  const metasNumero: (number | null)[] = etapas.map((e, i) => {
    if (i === 0) return null;
    const pct = m[e.key];
    return pct != null ? Math.round(((contagem[i - 1] ?? 0) * pct) / 100) : null;
  });
  const linhas: LinhaFunil[] = etapas.map((e, i) => {
    const ant = i > 0 ? contagem[i - 1] : null;
    const conv = ant ? Math.round((contagem[i] / ant) * 1000) / 10 : null;
    const meta = i > 0 ? (m[e.key] ?? null) : null;
    const estado: EstadoEtapa =
      i === 0 || conv == null || (ant ?? 0) < baseMinima ? "sem_base" : e.key !== "contato" && meta != null && conv < meta ? "abaixo" : "ok";
    return { key: e.key, label: e.label, ajuda: e.ajuda, anterior: ant, labelAnterior: i > 0 ? etapas[i - 1].label : null, valor: contagem[i] ?? 0, conversao: conv, meta, metaNumero: i > 0 ? metasNumero[i] : null, estado };
  });
  let pior = -1;
  let dist = 0;
  linhas.forEach((l, i) => {
    // O disparo abaixo de 100% é só fila (sai nos próximos dias): não é gargalo
    if (l.key === "contato" || l.estado !== "abaixo" || l.meta == null || l.conversao == null) return;
    const d = (l.meta - l.conversao) / l.meta;
    if (d > dist) {
      dist = d;
      pior = i;
    }
  });
  if (pior >= 0) linhas[pior] = { ...linhas[pior], estado: "gargalo" };
  return linhas;
}

/** Período: leads que entraram na lista a partir da data. */
export function desdeDias(dias: number | null, agora = Date.now()): string | null {
  return dias == null ? null : new Date(agora - dias * 86400_000).toISOString();
}

export const fmtPct = (v: number | null | undefined, casas = 0) =>
  v == null ? "-" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas === 0 ? 0 : casas })}%`;
