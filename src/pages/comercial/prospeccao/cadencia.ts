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

/**
 * Nota de oportunidade (0 a 100): quanto a empresa precisa do que a DemandIA faz e quanto vale abordar.
 * Quem não tem site, não tem Instagram ou está atrás dos concorrentes no Google ganha mais pontos;
 * empresa com muitas avaliações (mais movimento, mais verba) também sobe.
 */
export function pontuacao(l: OutreachLead): { nota: number; nivel: "Alta" | "Média" | "Baixa"; motivos: string[] } {
  const motivos: string[] = [];
  let n = 0;
  const soma = (pts: number, motivo: string) => {
    n += pts;
    motivos.push(motivo);
  };
  if (!l.site) soma(30, "sem site");
  else if (semSiteProprio(l.site)) soma(25, "sem site próprio (só página de diretório)");
  if (!l.instagram) soma(15, "sem Instagram");
  const p = l.diagnostico?.posicao;
  if (p?.tipo === "busca" && p.posicao > 3) soma(15, `${p.posicao}º na busca do Google`);
  if (p?.tipo === "avaliacoes" && p.posicao > Math.ceil(p.total / 2)) soma(15, `${p.posicao}º de ${p.total} em avaliações`);
  if ((l.diagnostico?.oportunidades ?? []).some((o) => o.includes("abaixo da média"))) soma(10, "avaliações abaixo da média");
  if (l.nota !== null && l.nota < 4.5) soma(10, `nota ${String(l.nota).replace(".", ",")}`);
  if (l.fotos !== null && l.fotos < 20) soma(5, "poucas fotos");
  if ((l.diagnostico?.oportunidades ?? []).some((o) => o.includes("palavras-chave"))) soma(5, "nome da ficha com palavras-chave");
  if ((l.avaliacoes ?? 0) >= 300) soma(10, "empresa com bastante movimento");
  else if ((l.avaliacoes ?? 0) >= 100) soma(5, "empresa com movimento");
  const nota = Math.min(100, n);
  return { nota, nivel: nota >= 45 ? "Alta" : nota >= 25 ? "Média" : "Baixa", motivos };
}

/** Diretórios, redes e link na bio não contam como site da empresa. */
const NAO_E_SITE = /(mechameaqui|guiamais|apontador|telelistas|solutudo|facebook\.com|instagram\.com|linktr\.ee|wa\.me|whatsapp\.com|negocio\.site|business\.site|google\.com|goo\.gl|ifood|doctoralia|booksy)/i;
export const semSiteProprio = (site: string | null | undefined) => !(site ?? "").trim() || NAO_E_SITE.test(site ?? "");

export type FiltroPrioridade = "todas" | "Alta" | "Média" | "Baixa";

const semAcento = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Prévia da saudação que vai sozinha antes de cada toque no WhatsApp. Igual ao envio: só usa o nome do
 * decisor quando ele aparece no nome da empresa; na hora de enviar, o nome do perfil do WhatsApp também conta.
 */
export function saudacaoPrevia(lead: { decisor?: string | null; empresa?: string | null }): string {
  const pn = (lead.decisor || "").trim().split(/\s+/)[0] || "";
  const nome = pn.charAt(0).toUpperCase() + pn.slice(1).toLowerCase();
  let chamar = "";
  if (nome.length >= 3 && new RegExp(`\\b${semAcento(nome)}\\b`).test(semAcento(lead.empresa || ""))) {
    const dr = (lead.empresa || "").match(new RegExp(`\\b(dra?)\\.?\\s+${nome}`, "i"));
    chamar = dr ? `${/a/i.test(dr[1]) ? "Dra." : "Dr."} ${nome}` : nome;
  }
  return `Oi, ${chamar ? `${chamar}, ` : ""}bom dia! 🙂`;
}

const CONTEXTO = /(te chamei|separei|imagino|fiz uma an[aá]lise|fiquei pensando|a gente ajuda|passando|olhando o perfil|vi o perfil)/i;
/** Mesma separação em balões que o envio faz (mensagem num bloco só vira apresentação, conteúdo e pergunta). */
export function separarEmBaloes(texto: string): string {
  const frasesDe = (t: string) => t.split(/(?<=[.!?…]|\p{Extended_Pictographic})\s+/u).map((f) => f.trim()).filter(Boolean);
  let b = texto.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  if (b.length >= 3) {
    // A pergunta final vai sempre sozinha no último balão
    const fim = frasesDe(b[b.length - 1]);
    if (fim.length > 1 && fim[fim.length - 1].includes("?")) b = [...b.slice(0, -1), fim.slice(0, -1).join(" "), fim[fim.length - 1]];
    // Mais de 3 balões: junta a apresentação com o motivo (os primeiros)
    while (b.length > 3) b = [`${b[0]} ${b[1]}`, ...b.slice(2)];
    return b.join("\n\n");
  }
  const frases = frasesDe(b.join(" "));
  if (frases.length < 3 || !frases[frases.length - 1].includes("?")) return texto;
  const pergunta = frases.pop() as string;
  let i = frases.findIndex((f) => /\bAna\b/.test(f));
  if (i < 0) i = 0;
  while (i + 1 < frases.length - 1 && CONTEXTO.test(frases[i + 1])) i++;
  return [frases.slice(0, i + 1).join(" "), frases.slice(i + 1).join(" "), pergunta].filter(Boolean).join("\n\n");
}
