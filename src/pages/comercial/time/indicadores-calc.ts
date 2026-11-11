/**
 * Contas dos Indicadores do Time Comercial IA (funções puras).
 * Cada lead ganha um "nível": a etapa mais longe a que já chegou no funil do seu canal.
 * O funil conta, para cada etapa, quantos leads chegaram até ela (quem virou perdido conta até onde foi).
 */
import type { OutreachLead } from "@/hooks/useProspeccao";
import type { Contato } from "@/hooks/useCrm";
import type { CanalFunil, EtapaLista, ListaLead, Metas } from "@/hooks/useComercial";
import { etapaInbound, etapaOutbound } from "./funis";

export interface EtapaFunil {
  key: EtapaLista;
  label: string;
}

const LISTA: EtapaFunil[] = [
  { key: "na_lista", label: "Na lista" },
  { key: "contato", label: "Mensagem ou ligação" },
  { key: "conversa", label: "Conversa iniciada" },
  { key: "qualificacao", label: "Qualificação" },
  { key: "reuniao", label: "Reunião agendada" },
  { key: "reuniao_realizada", label: "Reunião realizada" },
  { key: "proposta", label: "Negociação" },
  { key: "ganho", label: "Venda" },
];

export const ETAPAS_FUNIL: Record<CanalFunil, EtapaFunil[]> = {
  google: LISTA,
  instagram: LISTA,
  linkedin: LISTA,
  ligacoes: [
    { key: "na_lista", label: "Na lista" },
    { key: "contato", label: "Ligações feitas" },
    { key: "atendida", label: "Atendidas" },
    { key: "conversa", label: "Conversa" },
    { key: "qualificacao", label: "Qualificação" },
    { key: "reuniao", label: "Reunião agendada" },
    { key: "reuniao_realizada", label: "Reunião realizada" },
    { key: "proposta", label: "Negociação" },
    { key: "ganho", label: "Venda" },
  ],
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
  if (e !== "perdido") return ORDEM_GOOGLE.indexOf(e);
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
  // Instagram e LinkedIn não têm a etapa "atendida"
  return ordem >= 3 ? ordem - 1 : Math.min(ordem, 1);
}

/** Quantos leads chegaram em cada etapa (o primeiro número é o topo). */
export function contarFunil(niveis: number[], etapas: number): number[] {
  return Array.from({ length: etapas }, (_, i) => niveis.filter((n) => n >= i).length);
}

export type EstadoEtapa = "ok" | "abaixo" | "gargalo" | "sem_base";

export interface LinhaFunil {
  key: EtapaLista;
  label: string;
  valor: number;
  conversao: number | null; // % da etapa anterior
  meta: number | null;
  estado: EstadoEtapa;
}

/** Monta as linhas do funil com a conversão de cada etapa, a meta e o gargalo (etapa mais longe da meta). */
export function linhasFunil(canal: CanalFunil, contagem: number[], metas: Metas | undefined, baseMinima = 3): LinhaFunil[] {
  const etapas = ETAPAS_FUNIL[canal];
  const m = metas?.etapas?.[canal] ?? {};
  const linhas: LinhaFunil[] = etapas.map((e, i) => {
    const ant = i > 0 ? contagem[i - 1] : null;
    const conv = ant ? Math.round((contagem[i] / ant) * 1000) / 10 : null;
    const meta = i > 0 ? (m[e.key] ?? null) : null;
    const estado: EstadoEtapa = i === 0 || conv == null || (ant ?? 0) < baseMinima ? "sem_base" : meta != null && conv < meta ? "abaixo" : "ok";
    return { key: e.key, label: e.label, valor: contagem[i] ?? 0, conversao: conv, meta, estado };
  });
  let pior = -1;
  let dist = 0;
  linhas.forEach((l, i) => {
    if (l.estado !== "abaixo" || l.meta == null || l.conversao == null) return;
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
