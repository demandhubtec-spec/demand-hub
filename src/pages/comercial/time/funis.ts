/**
 * Funis do Time Comercial IA, com as etapas definidas pelo Kelvin (08/11/2026; nomes revistos em 11/11/2026).
 * Google Meu Negócio · Lista e Inbound · Anúncios ficam aqui; Instagram, LinkedIn e Ligações · Lista também (COLUNAS_LISTA e COLUNAS_LIGACOES).
 *  - Outbound (prospecção ativa): disparar (lista aprovada) → mensagem ou ligação feita → conversa iniciada → qualificação →
 *    reunião agendada → reunião realizada → negociação → fechamento.
 *  - Inbound [anúncios]: mensagem recebida ou cadastro → em atendimento → qualificação →
 *    reunião agendada → reunião realizada → negociação → fechamento.
 * Funções puras: decidem a coluna de cada card e o que gravar quando o card muda de coluna.
 */
import type { OutreachLead } from "@/hooks/useProspeccao";
import type { Contato, EtapaOportunidade } from "@/hooks/useCrm";
import type { EtapaLista } from "@/hooks/useComercial";

export interface Coluna<K extends string> {
  key: K;
  label: string;
  dica: string;
  fim?: boolean;
}

export const COLUNAS_OUTBOUND = [
  { key: "disparar", label: "Na lista", dica: "Lista aprovada, pronta para o primeiro contato" },
  { key: "enviado", label: "Mensagem ou ligação", dica: "Já abordado, ainda sem conversa" },
  { key: "conversa", label: "Conversa iniciada", dica: "Respondeu ou atendeu a ligação" },
  { key: "qualificacao", label: "Qualificação", dica: "Decisor, faturamento, dor e momento" },
  { key: "reuniao", label: "Reunião agendada", dica: "Está na sua agenda" },
  { key: "reuniao_realizada", label: "Reunião realizada", dica: "Conversou com você" },
  { key: "proposta", label: "Negociação", dica: "Proposta enviada" },
  { key: "ganho", label: "Venda", dica: "Venda feita" },
  { key: "perdido", label: "Perdido", dica: "Pediu para sair, sem perfil ou desistiu", fim: true },
] as const satisfies readonly Coluna<string>[];
export type EtapaOutbound = (typeof COLUNAS_OUTBOUND)[number]["key"];

export const COLUNAS_INBOUND = [
  { key: "recebido", label: "Leads do anúncio", dica: "Chegou pelo anúncio, site ou WhatsApp" },
  { key: "atendimento", label: "Conversa iniciada", dica: "A Gabi já está conversando" },
  { key: "qualificacao", label: "Qualificação", dica: "Decisor, faturamento, dor e momento" },
  { key: "reuniao", label: "Reunião agendada", dica: "Está na sua agenda" },
  { key: "reuniao_realizada", label: "Reunião realizada", dica: "Conversou com você" },
  { key: "proposta", label: "Negociação", dica: "Proposta enviada" },
  { key: "ganho", label: "Venda", dica: "Venda feita" },
  { key: "perdido", label: "Perdido", dica: "Sem perfil, sumiu ou desistiu", fim: true },
] as const satisfies readonly Coluna<string>[];
export type EtapaInbound = (typeof COLUNAS_INBOUND)[number]["key"];

/** Coluna de um lead da prospecção ativa. Quem ainda não foi abordado fica fora (está na Aprovação). */
export function etapaOutbound(l: OutreachLead): EtapaOutbound | null {
  const sc = l.status_comercial;
  if (sc === "perdido" || sc === "descartado" || l.wa_status === "optout" || l.cadencia === "parada") return "perdido";
  if (sc === "ganho" || sc === "proposta" || sc === "reuniao_realizada" || sc === "reuniao" || sc === "qualificacao") return sc;
  if (sc === "respondeu" || l.wa_status === "respondeu" || l.email_status === "respondeu" || l.cadencia === "respondeu") return "conversa";
  const abordado =
    (l.toque_atual ?? 0) > 0 || l.wa_status === "enviado" || l.email_status === "enviado" || ["ativa", "pausada", "concluida"].includes(l.cadencia);
  if (abordado) return "enviado";
  // Lista aprovada e ainda sem primeiro contato: pronta para disparar
  return l.wa_status === "pendente" && (l.leo_status === "aprovado" || l.msg_status === "aprovada") ? "disparar" : null;
}

/** O que gravar quando o card da prospecção vai para outra coluna (null: não dá para mover para lá). */
export function patchOutbound(l: OutreachLead, para: EtapaOutbound): Partial<OutreachLead> | null {
  const parar = { proximo_toque_em: null, proximo_canal: null };
  const saiDaCadencia = l.cadencia === "ativa" || l.cadencia === "pausada" ? "respondeu" : l.cadencia;
  switch (para) {
    case "disparar":
    case "enviado":
      return null; // essas duas a cadência é que decide (lista aprovada e envio feito)
    case "conversa":
      return {
        status_comercial: "respondeu",
        cadencia: saiDaCadencia === "nao_iniciada" ? l.cadencia : "respondeu",
        respondeu_no_toque: l.respondeu_no_toque ?? (l.toque_atual || 1),
        ...parar,
      } as Partial<OutreachLead>;
    case "perdido":
      return { status_comercial: "perdido", cadencia: "parada", ...parar } as Partial<OutreachLead>;
    default:
      return { status_comercial: para, cadencia: saiDaCadencia, ...parar } as Partial<OutreachLead>;
  }
}

/** Coluna de um contato inbound. Sem etapa marcada: "em atendimento" se a Ana já respondeu, senão "recebido". */
export function etapaInbound(c: Pick<Contato, "funil_etapa" | "status" | "last_outbound_at">): EtapaInbound {
  const e = c.funil_etapa as string | null;
  if (e === "conversando") return "atendimento"; // etapa antiga
  if (e && COLUNAS_INBOUND.some((x) => x.key === e)) return e as EtapaInbound;
  if (c.status === "desqualificado" || c.status === "opt_out") return "perdido";
  if (c.status === "qualificado") return "qualificacao";
  if (c.status === "agendado") return "reuniao";
  if (c.status === "cliente") return "ganho";
  return c.last_outbound_at ? "atendimento" : "recebido";
}

export const etapaInboundParaBanco = (e: EtapaInbound): EtapaOportunidade => e;

/** Instagram · Lista e LinkedIn · Lista (tabela comercial_lista_leads). */
export const COLUNAS_LISTA = [
  { key: "na_lista", label: "Na lista", dica: "Coletado, ainda sem contato" },
  { key: "contato", label: "Mensagem ou ligação", dica: "Abordado por DM ou WhatsApp" },
  { key: "conversa", label: "Conversa iniciada", dica: "Respondeu" },
  { key: "qualificacao", label: "Qualificação", dica: "Decisor, faturamento, dor e momento" },
  { key: "reuniao", label: "Reunião agendada", dica: "Está na sua agenda" },
  { key: "reuniao_realizada", label: "Reunião realizada", dica: "Conversou com você" },
  { key: "proposta", label: "Negociação", dica: "Proposta enviada" },
  { key: "ganho", label: "Venda", dica: "Venda feita" },
  { key: "perdido", label: "Perdido", dica: "Sem interesse, sem perfil ou desistiu", fim: true },
] as const satisfies readonly Coluna<EtapaLista>[];

/** Ligações · Lista (empresa parceira, dados pelo webhook). */
export const COLUNAS_LIGACOES = [
  { key: "na_lista", label: "Na lista", dica: "Ainda não ligaram" },
  { key: "contato", label: "Ligações feitas", dica: "Ligaram, ainda sem atender" },
  { key: "atendida", label: "Atendidas", dica: "A pessoa atendeu" },
  { key: "conversa", label: "Conversa", dica: "Conversou de verdade" },
  { key: "qualificacao", label: "Qualificação", dica: "Decisor, faturamento, dor e momento" },
  { key: "reuniao", label: "Reunião agendada", dica: "Está na sua agenda" },
  { key: "reuniao_realizada", label: "Reunião realizada", dica: "Conversou com você" },
  { key: "proposta", label: "Negociação", dica: "Proposta enviada" },
  { key: "ganho", label: "Venda", dica: "Venda feita" },
  { key: "perdido", label: "Perdido", dica: "Sem interesse ou número errado", fim: true },
] as const satisfies readonly Coluna<EtapaLista>[];

/* ───────────── Lista do Instagram no fluxo do time (12/11/2026) ───────────── */

/** @handle do perfil (URL ou @texto), em minúsculas. */
export function handleInstagram(ig: string | null | undefined): string | null {
  const s = (ig ?? "").trim();
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i) ?? s.match(/^@?([A-Za-z0-9._]+)$/);
  return m ? m[1].toLowerCase() : null;
}

/** place_id que a empresa da lista do Instagram ganha quando vai para o time (igual ao do servidor). */
export const placeIdInstagram = (perfilUrl: string | null | undefined, perfil?: string | null) => {
  const h = handleInstagram(perfilUrl) ?? handleInstagram(perfil);
  return h ? `ig_${h}` : null;
};

/** Coluna do funil da lista para quem já está no fluxo do time (vem da prospecção ativa). */
export function etapaListaDoTime(l: OutreachLead): EtapaLista {
  const e = etapaOutbound(l);
  if (!e || e === "disparar") return "na_lista";
  if (e === "enviado") return "contato";
  return e as EtapaLista;
}

/** Em que ponto do time a empresa está, antes do primeiro contato. Nulo depois que a Gabi abordou. */
export function passoDoTime(l: OutreachLead): string | null {
  const e = etapaOutbound(l);
  if (e && e !== "disparar") return null;
  if (l.wa_status !== "pendente") return null;
  if (!l.rita_status) return "Rita fazendo o raio-x";
  if (l.rita_status === "pendente") return "Raio-x para você aprovar";
  if (l.rita_status === "ajuste") return "Rita ajustando";
  if (!l.duda_status || l.duda_status === "ajuste") return "Duda montando PDF e site";
  if (l.duda_status === "pendente") return "PDF e site para aprovar";
  if (l.msg_status === "sem" || l.msg_status === "gerando") return "Bia escrevendo";
  if (l.msg_status === "rascunho") return "Mensagem para aprovar";
  if (l.msg_status === "aprovada") return "Na fila da Gabi";
  return "No time";
}

/** Lista → etapa da prospecção, para mover o card de quem já está no time. */
export const etapaOutboundDaLista = (e: EtapaLista): EtapaOutbound | null =>
  e === "na_lista" ? "disparar" : e === "contato" ? "enviado" : (COLUNAS_OUTBOUND.some((c) => c.key === e) ? (e as EtapaOutbound) : null);
