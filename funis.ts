/**
 * Os dois funis do Time Comercial IA, com as etapas definidas pelo Kelvin (08/11/2026).
 *  - Outbound (prospecção ativa): disparar (lista aprovada) → mensagem ou ligação feita → conversa iniciada → qualificação →
 *    reunião agendada → reunião realizada → negociação → fechamento.
 *  - Inbound [anúncios]: mensagem recebida ou cadastro → em atendimento → qualificação →
 *    reunião agendada → reunião realizada → negociação → fechamento.
 * Funções puras: decidem a coluna de cada card e o que gravar quando o card muda de coluna.
 */
import type { OutreachLead } from "@/hooks/useProspeccao";
import type { Contato, EtapaOportunidade } from "@/hooks/useCrm";

export interface Coluna<K extends string> {
  key: K;
  label: string;
  dica: string;
  fim?: boolean;
}

export const COLUNAS_OUTBOUND = [
  { key: "disparar", label: "Disparar · mensagem ou ligação", dica: "Lista aprovada, pronta para o primeiro contato" },
  { key: "enviado", label: "Mensagem ou ligação feita", dica: "Já abordado, ainda sem conversa" },
  { key: "conversa", label: "Conversa iniciada", dica: "Respondeu ou atendeu a ligação" },
  { key: "qualificacao", label: "Qualificação", dica: "Decisor, faturamento, dor e momento" },
  { key: "reuniao", label: "Reunião agendada", dica: "Está na sua agenda" },
  { key: "reuniao_realizada", label: "Reunião realizada", dica: "Conversou com você" },
  { key: "proposta", label: "Negociação", dica: "Proposta enviada" },
  { key: "ganho", label: "Fechamento", dica: "Venda feita" },
  { key: "perdido", label: "Perdido", dica: "Pediu para sair, sem perfil ou desistiu", fim: true },
] as const satisfies readonly Coluna<string>[];
export type EtapaOutbound = (typeof COLUNAS_OUTBOUND)[number]["key"];

export const COLUNAS_INBOUND = [
  { key: "recebido", label: "Mensagem recebida / cadastro", dica: "Chegou pelo anúncio, site ou WhatsApp" },
  { key: "atendimento", label: "Em atendimento", dica: "A Ana já está conversando" },
  { key: "qualificacao", label: "Qualificação", dica: "Decisor, faturamento, dor e momento" },
  { key: "reuniao", label: "Reunião agendada", dica: "Está na sua agenda" },
  { key: "reuniao_realizada", label: "Reunião realizada", dica: "Conversou com você" },
  { key: "proposta", label: "Negociação", dica: "Proposta enviada" },
  { key: "ganho", label: "Fechamento", dica: "Venda feita" },
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
