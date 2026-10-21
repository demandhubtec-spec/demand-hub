import { SDR_CONFIG } from "../config/sdr.ts";
import { atLocalMinutes, dateKey, hm, localDayStart, minutesOfDay, toLocal } from "./time.ts";

type FollowCfg = typeof SDR_CONFIG.followUp;

export function isBusinessDay(date: Date, cfg: FollowCfg = SDR_CONFIG.followUp): boolean {
  const l = toLocal(date);
  if (!cfg.diasUteis.includes(l.dow)) return false;
  const key = dateKey(l);
  if (cfg.feriadosFixos.includes(key.slice(5))) return false;
  if (cfg.feriadosExtras.includes(key)) return false;
  return true;
}

/** Pode mandar follow-up agora? (dia útil, entre 08:00 e 18:00 de Brasília) */
export function isBusinessTime(date: Date, cfg: FollowCfg = SDR_CONFIG.followUp): boolean {
  if (!isBusinessDay(date, cfg)) return false;
  const m = minutesOfDay(toLocal(date));
  return m >= hm(cfg.janela[0]) && m < hm(cfg.janela[1]);
}

/** Empurra um horário para dentro do horário comercial mais próximo (nunca para trás). */
export function clampToBusinessTime(date: Date, cfg: FollowCfg = SDR_CONFIG.followUp): Date {
  if (isBusinessTime(date, cfg)) return date;
  const open = hm(cfg.janela[0]);
  const m = minutesOfDay(toLocal(date));

  // Ainda hoje, antes de abrir e hoje é dia útil → hoje às 08:00
  if (m < open && isBusinessDay(date, cfg)) return atLocalMinutes(localDayStart(date), open);

  // Senão, próximo dia útil às 08:00
  for (let i = 1; i <= 14; i++) {
    const day = localDayStart(date, i);
    if (isBusinessDay(day, cfg)) return atLocalMinutes(day, open);
  }
  throw new Error("Nenhum dia útil encontrado nos próximos 14 dias");
}

/**
 * Quando mandar o próximo follow-up.
 * @param from      momento da última mensagem enviada por nós
 * @param attempts  quantos follow-ups já foram enviados nesta sequência
 * @returns Date, ou null se já chegou no limite de tentativas
 */
export function nextFollowUpAt(from: Date, attempts: number, cfg: FollowCfg = SDR_CONFIG.followUp): Date | null {
  if (attempts >= cfg.maxTentativas) return null;
  const days = cfg.intervalosDias[attempts % cfg.intervalosDias.length];
  const base = new Date(from.getTime() + days * 86_400_000);
  return clampToBusinessTime(base, cfg);
}
