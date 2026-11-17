/**
 * As SDRs que falam com os leads pelo WhatsApp, cada uma no seu número (16/11/2026, pedido do Kelvin):
 * - Gabi: o número de sempre (variáveis EVOLUTION_INSTANCE / EVOLUTION_INSTANCE_TOKEN).
 * - Marina: número próprio, mesma função (primeiro contato, follow-up e agendamento).
 * O lead fica com quem fez o primeiro contato, ou com o número em que a pessoa chamou.
 * Este arquivo não fala com o banco (dá para testar); a parte do banco está em instancias.ts.
 */
export const SDRS = ["gabi", "marina"] as const;
export type Sdr = (typeof SDRS)[number];

export const NOME_SDR: Record<Sdr, string> = { gabi: "Gabi", marina: "Marina" };

/** Qualquer valor desconhecido (lead antigo, coluna vazia) é da Gabi. */
export function sdrValida(v: unknown): Sdr {
  return v === "marina" ? "marina" : "gabi";
}

export function nomeDaSdr(v: unknown): string {
  return NOME_SDR[sdrValida(v)];
}

/** Id do Prompt System da SDR na tabela comercial_playbook. */
export function idPromptDaSdr(v: unknown): string {
  return `prompt_${sdrValida(v)}`;
}

/** Troca o nome da Gabi pelo da SDR num texto pronto (prompt padrão, por exemplo). */
export function comNomeDaSdr(texto: string, v: unknown): string {
  return sdrValida(v) === "gabi" ? texto : texto.replace(/\bGabi\b/g, nomeDaSdr(v));
}

/**
 * Quem faz o próximo primeiro contato: a SDR ligada que ainda tem vaga no dia, proporcional ao teto
 * (com Gabi 30 e Marina 10, a Marina entra a cada ~4 envios). Empate: Gabi. Nenhuma com vaga: null.
 */
export function proximaSdr(enviadosHoje: Record<Sdr, number>, tetos: Record<Sdr, number>, liberadas: Sdr[]): Sdr | null {
  const comVaga = liberadas.filter((s) => (tetos[s] ?? 0) > 0 && (enviadosHoje[s] ?? 0) < tetos[s]);
  if (!comVaga.length) return null;
  return comVaga.sort((a, b) => (enviadosHoje[a] ?? 0) / tetos[a] - (enviadosHoje[b] ?? 0) / tetos[b] || SDRS.indexOf(a) - SDRS.indexOf(b))[0];
}
