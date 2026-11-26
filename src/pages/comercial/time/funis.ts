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
  { key: "qualificacao", label: "Demonstrou interesse", dica: "Quente: gostou e quer conversar, ainda sem reunião" },
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
  { key: "qualificacao", label: "Demonstrou interesse", dica: "Quente: gostou e quer conversar, ainda sem reunião" },
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
  // 24/11 (Kelvin): Perdido é só quem disse que não quer (ou foi marcado perdido à mão). Cadência parada não é perda:
  // o lead segue na etapa em que está (agora o próximo passo é a ligação).
  if (sc === "perdido" || sc === "descartado" || l.wa_status === "optout") return "perdido";
  if (sc === "ganho" || sc === "proposta" || sc === "reuniao_realizada" || sc === "reuniao" || sc === "qualificacao") return sc;
  if (sc === "respondeu" || l.wa_status === "respondeu" || l.email_status === "respondeu" || l.cadencia === "respondeu") return "conversa";
  const abordado =
    (l.toque_atual ?? 0) > 0 || l.wa_status === "enviado" || l.email_status === "enviado" || ["ativa", "pausada", "concluida"].includes(l.cadencia);
  if (abordado) return "enviado";
  // Lista aprovada e ainda sem primeiro contato: pronta para disparar
  // 18/11: mensagem descartada (nicho que saiu da prospecção) não está mais na lista
  return l.wa_status === "pendente" && l.msg_status !== "rejeitada" && (l.leo_status === "aprovado" || l.msg_status === "aprovada") ? "disparar" : null;
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
  { key: "qualificacao", label: "Demonstrou interesse", dica: "Quente: gostou e quer conversar, ainda sem reunião" },
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
  { key: "qualificacao", label: "Demonstrou interesse", dica: "Quente: gostou e quer conversar, ainda sem reunião" },
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

/* ───────────── Funil comercial unificado (14/11/2026, Kelvin) ─────────────
 * Um funil só para todas as origens. As etapas de cada origem caem nas mesmas colunas:
 *  - Google (prospecção): disparar → Entrada, enviado → Mensagem ou ligação.
 *  - Listas (Instagram, LinkedIn, Ligações, cadastro manual): na_lista → Entrada, atendida → Conversa iniciada.
 *  - Inbound (anúncio): recebido → Entrada, atendimento → Conversa iniciada (não passa por Mensagem ou ligação).
 */
export const COLUNAS_UNICAS = [
  { key: "entrada", label: "Entrada", dica: "Na lista ou acabou de chegar" },
  { key: "contato", label: "Mensagem ou ligação", dica: "Já abordado, ainda sem conversa" },
  { key: "conversa", label: "Conversa iniciada", dica: "Morno: respondeu e conversou, mas parou" },
  { key: "qualificacao", label: "Demonstrou interesse", dica: "Quente: gostou e quer conversar, ainda sem reunião" },
  { key: "reuniao", label: "Reunião agendada", dica: "Está na sua agenda" },
  { key: "reuniao_realizada", label: "Reunião realizada", dica: "Conversou com você" },
  { key: "proposta", label: "Negociação", dica: "Proposta enviada" },
  { key: "ganho", label: "Venda", dica: "Venda feita" },
  { key: "perdido", label: "Perdido", dica: "Sem interesse, sem perfil ou desistiu", fim: true },
] as const satisfies readonly Coluna<string>[];
export type EtapaUnica = (typeof COLUNAS_UNICAS)[number]["key"];

export type OrigemLead = "google" | "instagram" | "ligacao" | "linkedin" | "anuncio" | "indicacao" | "recomendacao" | "network" | "evento" | "outro";
export type GrupoOrigem = "Outbound" | "Inbound" | "Relacionamento";
export const ORIGENS: { k: OrigemLead; nome: string; grupo: GrupoOrigem; cor: string; fundo: string }[] = [
  { k: "google", nome: "Google Meu Negócio", grupo: "Outbound", cor: "#2f6fe4", fundo: "#eaf1fe" },
  { k: "instagram", nome: "Instagram", grupo: "Outbound", cor: "#c2306f", fundo: "#fcebf3" },
  { k: "ligacao", nome: "Ligação", grupo: "Outbound", cor: "#17865b", fundo: "#e6f6ef" },
  { k: "linkedin", nome: "LinkedIn", grupo: "Outbound", cor: "#0a66c2", fundo: "#e8f1fb" },
  { k: "anuncio", nome: "Anúncio", grupo: "Inbound", cor: "#b86e00", fundo: "#fdf3e1" },
  { k: "indicacao", nome: "Indicação", grupo: "Relacionamento", cor: "#7a3fd1", fundo: "#f3ecfd" },
  { k: "recomendacao", nome: "Recomendação", grupo: "Relacionamento", cor: "#7a3fd1", fundo: "#f3ecfd" },
  { k: "network", nome: "Network", grupo: "Relacionamento", cor: "#7a3fd1", fundo: "#f3ecfd" },
  { k: "evento", nome: "Evento", grupo: "Relacionamento", cor: "#7a3fd1", fundo: "#f3ecfd" },
  { k: "outro", nome: "Outra origem", grupo: "Relacionamento", cor: "#6b6585", fundo: "#f1f0f5" },
];
export const ORIGEM_POR_CHAVE = Object.fromEntries(ORIGENS.map((o) => [o.k, o])) as Record<OrigemLead, (typeof ORIGENS)[number]>;
/** Origem de um lead cadastrado à mão (campo fonte). */
export const origemDaFonte = (f: string | null | undefined): OrigemLead =>
  f && (ORIGENS as { k: string }[]).some((o) => o.k === f) ? (f as OrigemLead) : "outro";

export const daOutbound = (e: EtapaOutbound): EtapaUnica => (e === "disparar" ? "entrada" : e === "enviado" ? "contato" : e);
// 25/11 (Kelvin, jornada): ligação atendida só pela recepção ainda não é conversa com o lead → "Mensagem ou ligação".
export const daLista = (e: EtapaLista): EtapaUnica => (e === "na_lista" ? "entrada" : e === "atendida" ? "contato" : e);

/** 25/11: o card do Google também anda com a ligação da Gabi (a ligação dele não vira card separado). Fica a etapa mais avançada. */
export function comLigacao(e: EtapaUnica, lig: EtapaLista | null | undefined): EtapaUnica {
  if (!lig || e === "perdido" || lig === "perdido") return e;
  const l = daLista(lig);
  return ORDEM_UNICA.indexOf(l) > ORDEM_UNICA.indexOf(e) ? l : e;
}
export const daInbound = (e: EtapaInbound): EtapaUnica => (e === "recebido" ? "entrada" : e === "atendimento" ? "conversa" : e);
export const paraOutbound = (u: EtapaUnica): EtapaOutbound => (u === "entrada" ? "disparar" : u === "contato" ? "enviado" : u);
export const paraLista = (u: EtapaUnica): EtapaLista => (u === "entrada" ? "na_lista" : u);
export const paraInbound = (u: EtapaUnica): EtapaInbound | null => (u === "entrada" ? "recebido" : u === "contato" ? null : u === "conversa" ? "atendimento" : u);

/** Nome da primeira coluna conforme as origens marcadas no filtro. */
export function nomeEntrada(origens: OrigemLead[]): { label: string; dica: string } {
  const grupos = new Set(origens.map((o) => ORIGEM_POR_CHAVE[o].grupo));
  if (grupos.size === 1 && grupos.has("Inbound")) return { label: "Lead do anúncio", dica: "Chegou pelo anúncio, site ou WhatsApp" };
  if (grupos.size === 1 && grupos.has("Outbound")) return { label: "Na lista", dica: "Lista aprovada, pronta para o primeiro contato" };
  return { label: "Entrada", dica: "Na lista ou acabou de chegar" };
}

/* ───────────── Etapa final do card (21/11/2026): a mesma regra para o Kanban e para os Indicadores ───────────── */

export const ORDEM_UNICA: EtapaUnica[] = ["entrada", "contato", "conversa", "qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"];

/** A Gabi marca o avanço na conversa (qualificado, agendado, cliente). Se ela já foi além da etapa do card, o card acompanha. */
export function comAvancoDaGabi(e: EtapaUnica, sdr: Contato | undefined | null): EtapaUnica {
  if (!sdr || e === "perdido") return e;
  const g: EtapaUnica | null = sdr.status === "cliente" ? "ganho" : sdr.status === "agendado" ? "reuniao" : sdr.status === "qualificado" ? "qualificacao" : null;
  return g && ORDEM_UNICA.indexOf(g) > ORDEM_UNICA.indexOf(e) ? g : e;
}

/**
 * Ajusta a etapa pela conversa real (21/11): quente (mostrou interesse) → Demonstrou interesse; morno → Conversa
 * iniciada; só robô respondeu → fica em Mensagem ou ligação. Temperatura escolhida à mão vale acima da IA.
 * qualifAMao: o card foi posto em Demonstrou interesse à mão (não desce sozinho).
 */
export function ajustarPelaConversa(
  etapa: EtapaUnica,
  sdr: Contato | undefined | null,
  tempManual: "quente" | "morno" | "frio" | null | undefined,
  qualifAMao: boolean,
  inbound = false,
): EtapaUnica {
  if (["perdido", "reuniao", "reuniao_realizada", "proposta", "ganho"].includes(etapa)) return etapa;
  const ate = (alvo: EtapaUnica) => (ORDEM_UNICA.indexOf(alvo) > ORDEM_UNICA.indexOf(etapa) ? alvo : etapa);
  if (tempManual === "quente") return ate("qualificacao");
  if (tempManual === "morno") return ate("conversa");
  if (tempManual) return etapa;
  const ctx = sdr?.contexto;
  if (!ctx) return etapa;
  // Inbound não passa por "Mensagem ou ligação": quem chegou pelo anúncio e ainda não conversou fica na Entrada (25/11)
  if (inbound && ctx.conversou === false) return (etapa === "entrada" || etapa === "conversa" || etapa === "qualificacao") && !qualifAMao ? "entrada" : etapa;
  let e: EtapaUnica = etapa === "entrada" ? (inbound ? "conversa" : "contato") : etapa;
  if (ctx.conversou === false) return (e === "conversa" || e === "qualificacao") && !qualifAMao ? "contato" : e;
  if (ctx.temperatura === "quente") return ORDEM_UNICA.indexOf("qualificacao") > ORDEM_UNICA.indexOf(e) ? "qualificacao" : e;
  if (e === "qualificacao" && !qualifAMao) e = "conversa";
  return ORDEM_UNICA.indexOf("conversa") > ORDEM_UNICA.indexOf(e) ? "conversa" : e;
}
