import { SDR_CONFIG } from "../config/sdr.ts";

export interface BantInput {
  segmento?: string | null;
  faturamento_mensal?: number | null;
  autoridade?: string | null;
  dores?: string[] | null;
  prazo?: string | null;
}

export interface BantResult {
  score: number;
  budget: boolean;
  authority: boolean;
  need: boolean;
  timing: boolean;
  qualificado: boolean;
  /** Fora do perfil de forma definitiva (faturamento abaixo do mínimo) */
  desqualificado: boolean;
  faltando: string[];
}

/** Academia, box de crossfit, estúdio de pilates ou de treino. */
export function ehAcademia(segmento?: string | null): boolean {
  const t = (segmento ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /academia|crossfit|pilates|estudio (de )?(treino|funcional|fitness|pilates)|studio fitness/.test(t);
}

/** Faturamento mínimo para o segmento: academias pedem mais, o resto segue o padrão. */
export function faturamentoMinimo(segmento?: string | null, cfg = SDR_CONFIG.qualificacao): number {
  return ehAcademia(segmento) ? cfg.faturamentoMinimoAcademia : cfg.faturamentoMinimoMensal;
}

/** Quem conta como autoridade: dono/sócio, o responsável por marketing, atendimento ou vendas, ou o decisor que vai participar. */
export const AUTORIDADES_VALIDAS = ["decisor", "responsavel_area", "decisor_vai_participar"];

export function evaluateBant(l: BantInput, cfg = SDR_CONFIG.qualificacao): BantResult {
  const budget = (l.faturamento_mensal ?? 0) >= faturamentoMinimo(l.segmento, cfg);
  const authority = !!l.autoridade && AUTORIDADES_VALIDAS.includes(l.autoridade);
  const need = (l.dores?.length ?? 0) > 0;
  const timing = !!l.prazo && (cfg.prazosAceitos as readonly string[]).includes(l.prazo);

  const faltando: string[] = [];
  if (!need) faltando.push("necessidade (dor principal)");
  if (l.faturamento_mensal == null) faltando.push("faturamento mensal");
  if (!l.prazo) faltando.push("prazo/urgência");
  if (!l.autoridade) faltando.push("quem decide");
  if (l.autoridade === "sem_decisor") faltando.push("combinar a presença do decisor (dono ou responsável por marketing, atendimento ou vendas) na reunião");

  const score = [budget, authority, need, timing].filter(Boolean).length;
  return {
    score,
    budget,
    authority,
    need,
    timing,
    qualificado: score === 4,
    desqualificado: l.faturamento_mensal != null && !budget,
    faltando,
  };
}

/**
 * Normaliza o faturamento informado pela IA para reais.
 * Leads falam "50 mil" e o modelo às vezes envia 50: valores abaixo de 1.000 são tratados como milhares.
 */
export function normalizeFaturamento(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".")) : Number(v);
  if (!isFinite(n) || n <= 0) return null;
  return n < 1000 ? Math.round(n * 1000) : Math.round(n);
}
