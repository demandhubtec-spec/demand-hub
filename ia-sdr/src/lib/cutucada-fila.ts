/** Fila da cutucada da prospecção v2 (sem banco, para dar para testar). Usada por cutucada.ts. */

/** Cutucadas por rodada do relógio (a cada 10 min), para não disparar uma rajada de WhatsApp de uma vez. */
export const CUTUCADAS_POR_RODADA = 3;
/** Depois disso a cutucada não faz mais sentido (o lead fica sem follow-up, como antes). */
export const CUTUCADA_ATE_DIAS = 5;

export interface CandidatoCutucada {
  place_id: string;
  empresa: string;
  whatsapp: string;
  wa_sent_at: string;
  ultimo_toque_em: string | null;
}

/**
 * Quem ainda espera a cutucada, na ordem de envio: primeiro quem recebeu o "Oi" nas últimas 6 horas
 * (o atendimento ainda está quente), depois os atrasados, do mais antigo para o mais novo.
 * Já cutucado = ultimo_toque_em depois do 1º contato (a cutucada e o envio avulso marcam esse campo;
 * o 1º contato marca ANTES de enviar, então fica igual ou antes de wa_sent_at).
 */
export function ordenarCandidatos(lista: CandidatoCutucada[], now: Date, fluxoV2Desde: string): CandidatoCutucada[] {
  const umaHora = now.getTime() - 60 * 60_000;
  const seisHoras = now.getTime() - 6 * 60 * 60_000;
  const limite = now.getTime() - CUTUCADA_ATE_DIAS * 86_400_000;
  const desde = new Date(fluxoV2Desde).getTime();
  const pend = lista.filter((o) => {
    const env = new Date(o.wa_sent_at).getTime();
    if (!(env >= desde && env >= limite && env <= umaHora)) return false;
    const ult = o.ultimo_toque_em ? new Date(o.ultimo_toque_em).getTime() : 0;
    return ult <= env + 60_000;
  });
  const t = (o: CandidatoCutucada) => new Date(o.wa_sent_at).getTime();
  const recentes = pend.filter((o) => t(o) >= seisHoras).sort((a, b) => t(a) - t(b));
  const atrasados = pend.filter((o) => t(o) < seisHoras).sort((a, b) => t(a) - t(b));
  return [...recentes, ...atrasados];
}
