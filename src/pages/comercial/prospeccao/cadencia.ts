import type { OutreachLead, Toque } from "@/hooks/useProspeccao";

/** Colunas do Kanban da prospecção, na ordem do funil. */
export const ETAPAS = [
  { key: "aprovar", label: "Para aprovar", dica: "A Ana escreveu, falta você aprovar" },
  { key: "aprovado", label: "Aprovado", dica: "Na fila para a primeira mensagem" },
  { key: "cadencia", label: "Em cadência", dica: "Recebendo os follow-ups" },
  { key: "respondeu", label: "Respondeu", dica: "A Ana está conversando" },
  { key: "reuniao", label: "Reunião", dica: "Diagnóstico marcado" },
  { key: "proposta", label: "Proposta", dica: "Proposta enviada" },
  { key: "ganho", label: "Ganho", dica: "Virou cliente" },
  { key: "retomar", label: "Retomar depois", dica: "Não respondeu, volta na data" },
  { key: "descartado", label: "Descartado", dica: "Pediu para sair ou não tem fit" },
  { key: "fora", label: "Sem WhatsApp", dica: "Sem número para abordar" },
] as const;

export type Etapa = (typeof ETAPAS)[number]["key"];

export function etapaDoLead(l: OutreachLead): Etapa {
  const sc = l.status_comercial;
  if (sc === "ganho" || sc === "proposta" || sc === "reuniao") return sc;
  if (sc === "descartado" || sc === "perdido" || l.wa_status === "optout" || l.cadencia === "parada") return "descartado";
  if (sc === "respondeu" || l.wa_status === "respondeu" || l.cadencia === "respondeu") return "respondeu";
  if (l.cadencia === "concluida") return "retomar";
  if (l.cadencia === "ativa" || l.cadencia === "pausada") return "cadencia";
  if (l.wa_status === "pendente") return l.msg_status === "aprovada" ? "aprovado" : "aprovar";
  if (l.wa_status === "enviado") return "cadencia";
  return "fora";
}

/** O que muda no lead quando você move o card para uma coluna. */
export function patchParaEtapa(l: OutreachLead, etapa: Etapa): Partial<OutreachLead> | null {
  const parar = { proximo_toque_em: null, proximo_canal: null } as const;
  switch (etapa) {
    case "respondeu":
      return {
        status_comercial: "respondeu",
        cadencia: "respondeu",
        respondeu_no_toque: l.respondeu_no_toque ?? (l.toque_atual || 1),
        ...parar,
        ...(l.wa_status === "enviado" ? { wa_status: "respondeu" } : { email_status: "respondeu" }),
      } as Partial<OutreachLead>;
    case "reuniao":
    case "proposta":
    case "ganho":
      return {
        status_comercial: etapa,
        cadencia: l.cadencia === "ativa" || l.cadencia === "pausada" ? "respondeu" : l.cadencia,
        ...parar,
      } as Partial<OutreachLead>;
    case "descartado":
      return { status_comercial: "descartado", cadencia: "parada", ...parar } as Partial<OutreachLead>;
    case "retomar": {
      const d = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
      return { cadencia: "concluida", retomar_em: d, ...parar } as Partial<OutreachLead>;
    }
    default:
      return null;
  }
}

const CANAL: Record<string, string> = { whatsapp: "WhatsApp", email: "E-mail" };
export const canalLabel = (c?: string | null) => (c ? CANAL[c] ?? c : "");

export function quandoTexto(t: Pick<Toque, "dia" | "periodo">) {
  return `Dia ${t.dia}, ${t.periodo === "tarde" ? "tarde" : "manhã"}`;
}

/** "Toque 3 de 6 · próximo: WhatsApp qui 30/10 09:30" */
export function resumoCadencia(l: OutreachLead): string {
  const total = l.sequencia?.length ?? 6;
  if (l.cadencia === "pausada") return `Pausada no toque ${l.toque_atual} de ${total}`;
  if (l.cadencia !== "ativa") return "";
  const prox = l.proximo_toque_em
    ? new Date(l.proximo_toque_em).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return `${l.toque_atual} de ${total} feitos · próximo: ${canalLabel(l.proximo_canal)} ${prox}`.trim();
}

/** Funil clássico a partir dos leads (cada etapa conta quem chegou nela ou passou dela). */
export function funil(leads: OutreachLead[]) {
  const abordados = leads.filter(
    (l) => (l.toque_atual ?? 0) > 0 || ["enviado", "respondeu", "optout"].includes(l.wa_status) || l.email_status === "enviado",
  );
  const respondeu = abordados.filter(
    (l) =>
      l.wa_status === "respondeu" ||
      l.email_status === "respondeu" ||
      l.cadencia === "respondeu" ||
      ["respondeu", "reuniao", "proposta", "ganho"].includes(l.status_comercial),
  );
  const reuniao = leads.filter((l) => ["reuniao", "proposta", "ganho"].includes(l.status_comercial));
  const proposta = leads.filter((l) => ["proposta", "ganho"].includes(l.status_comercial));
  const ganho = leads.filter((l) => l.status_comercial === "ganho");
  return [
    { key: "abordados", label: "Abordados", n: abordados.length },
    { key: "respondeu", label: "Responderam", n: respondeu.length },
    { key: "reuniao", label: "Reunião", n: reuniao.length },
    { key: "proposta", label: "Proposta", n: proposta.length },
    { key: "ganho", label: "Ganho", n: ganho.length },
  ];
}

/** Em qual toque as pessoas responderam (para saber qual mensagem funciona). */
export function respostasPorToque(leads: OutreachLead[], seqPadrao: Pick<Toque, "dia" | "periodo" | "canal">[]) {
  return seqPadrao.map((t, i) => ({
    toque: i + 1,
    label: `${i + 1}. ${canalLabel(t.canal)} · ${quandoTexto(t)}`,
    n: leads.filter((l) => l.respondeu_no_toque === i + 1).length,
  }));
}

export const CADENCIA_PADRAO: Pick<Toque, "dia" | "periodo" | "canal">[] = [
  { dia: 0, periodo: "manha", canal: "whatsapp" },
  { dia: 0, periodo: "tarde", canal: "email" },
  { dia: 2, periodo: "manha", canal: "whatsapp" },
  { dia: 4, periodo: "manha", canal: "email" },
  { dia: 7, periodo: "manha", canal: "whatsapp" },
  { dia: 10, periodo: "manha", canal: "whatsapp" },
];
