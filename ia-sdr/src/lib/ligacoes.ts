/**
 * Ligações · dados que chegam da empresa parceira pelo webhook (portal > Time Comercial IA > Funil > Ligações).
 * Funções puras: entendem o que a empresa mandou e decidem a etapa do funil de ligações.
 *
 * Etapas: na_lista → contato (ligação feita) → atendida → conversa → qualificacao → reuniao →
 *         reuniao_realizada → proposta → ganho (venda); perdido fica de lado.
 */

export const ETAPAS_LIGACAO = [
  "na_lista",
  "contato",
  "atendida",
  "conversa",
  "qualificacao",
  "reuniao",
  "reuniao_realizada",
  "proposta",
  "ganho",
  "perdido",
] as const;
export type EtapaLigacao = (typeof ETAPAS_LIGACAO)[number];

/** Palavras que cada empresa costuma usar para cada etapa (sem acento, minúsculas). */
const SINONIMOS: [EtapaLigacao, string[]][] = [
  ["ganho", ["ganho", "venda", "vendido", "fechado", "fechamento", "won", "closed_won"]],
  ["proposta", ["proposta", "negociacao", "negociando", "proposal"]],
  ["reuniao_realizada", ["reuniao_realizada", "reuniao realizada", "realizada", "meeting_done"]],
  ["reuniao", ["reuniao", "reuniao_agendada", "reuniao agendada", "agendada", "agendado", "meeting", "scheduled"]],
  ["qualificacao", ["qualificacao", "qualificado", "qualified"]],
  ["conversa", ["conversa", "conversou", "em_conversa", "talked", "conversation"]],
  ["atendida", ["atendida", "atendeu", "answered", "atendimento"]],
  ["contato", ["contato", "ligacao_feita", "ligou", "ligada", "chamada", "nao_atendeu", "caixa_postal", "ocupado", "called", "no_answer"]],
  ["perdido", ["perdido", "sem_interesse", "nao_quer", "descartado", "lost", "invalido", "numero_errado"]],
  ["na_lista", ["na_lista", "novo", "lista", "new", "pendente"]],
];

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Etapa a partir do texto que a empresa mandou (status, etapa, resultado). null: não reconheceu. */
export function etapaDoTexto(t: unknown): EtapaLigacao | null {
  if (typeof t !== "string" || !t.trim()) return null;
  const n = semAcento(t).replace(/\s+/g, "_");
  if (/^nao_atend/.test(n)) return "contato";
  for (const [etapa, palavras] of SINONIMOS) {
    if (palavras.some((p) => n === p.replace(/\s+/g, "_"))) return etapa;
  }
  for (const [etapa, palavras] of SINONIMOS) {
    if (palavras.some((p) => p.length > 4 && n.includes(p.replace(/\s+/g, "_")))) return etapa;
  }
  return null;
}

export interface LigacaoRecebida {
  externo_id: string;
  empresa: string;
  whatsapp: string | null;
  email: string | null;
  nicho: string | null;
  cidade: string | null;
  etapa: EtapaLigacao;
  tentativas: number;
  valor: number | null;
  observacoes: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/**
 * Lê um registro do webhook. Aceita os nomes de campo mais comuns (português e inglês).
 * Sem id ou sem telefone/nome: devolve o motivo em "erro".
 */
export function lerLigacao(b: Record<string, unknown>): LigacaoRecebida | { erro: string } {
  const externo = str(b.id ?? b.externo_id ?? b.lead_id ?? b.call_id ?? b.contato_id);
  const telefone = str(b.telefone ?? b.whatsapp ?? b.phone ?? b.celular);
  const empresa = str(b.empresa ?? b.company ?? b.nome ?? b.name ?? b.razao_social) ?? telefone;
  if (!externo && !telefone) return { erro: "faltou o id ou o telefone do contato" };
  if (!empresa) return { erro: "faltou o nome do contato ou da empresa" };
  const atendida = b.atendida ?? b.answered;
  const texto = etapaDoTexto(b.etapa ?? b.status ?? b.stage ?? b.resultado ?? b.result);
  const etapa: EtapaLigacao = texto ?? (atendida === true ? "atendida" : atendida === false ? "contato" : "na_lista");
  const tent = Number(b.tentativas ?? b.attempts ?? b.ligacoes ?? 0);
  const valorBruto = b.valor ?? b.value ?? b.amount;
  const valor = valorBruto == null || valorBruto === "" ? null : Number(String(valorBruto).replace(/[^\d,.-]/g, "").replace(",", "."));
  return {
    externo_id: externo ?? `tel:${(telefone ?? "").replace(/\D/g, "")}`,
    empresa,
    whatsapp: telefone ? telefone.replace(/\D/g, "") || null : null,
    email: str(b.email),
    nicho: str(b.nicho ?? b.segmento ?? b.segment),
    cidade: str(b.cidade ?? b.city),
    etapa,
    tentativas: Number.isFinite(tent) && tent > 0 ? Math.round(tent) : etapa === "na_lista" ? 0 : 1,
    valor: valor != null && Number.isFinite(valor) ? valor : null,
    observacoes: str(b.observacoes ?? b.notas ?? b.notes ?? b.resumo ?? b.summary),
  };
}
