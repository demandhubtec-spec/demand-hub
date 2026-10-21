import { SDR_CONFIG } from "../config/sdr.ts";

export interface BantInput {
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

export function evaluateBant(l: BantInput, cfg = SDR_CONFIG.qualificacao): BantResult {
  const budget = (l.faturamento_mensal ?? 0) >= cfg.faturamentoMinimoMensal;
  const authority = l.autoridade === "decisor" || l.autoridade === "decisor_vai_participar";
  const need = (l.dores?.length ?? 0) > 0;
  const timing = !!l.prazo && (cfg.prazosAceitos as readonly string[]).includes(l.prazo);

  const faltando: string[] = [];
  if (!need) faltando.push("necessidade (dor principal)");
  if (l.faturamento_mensal == null) faltando.push("faturamento mensal");
  if (!l.prazo) faltando.push("prazo/urgência");
  if (!l.autoridade) faltando.push("quem decide");
  if (l.autoridade === "sem_decisor") faltando.push("combinar a presença do decisor na reunião");

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
