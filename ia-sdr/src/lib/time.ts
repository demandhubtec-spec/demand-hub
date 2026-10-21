/**
 * Helpers de horário de Brasília (UTC-3 fixo — o Brasil não tem horário de verão desde 2019).
 * Trabalhamos com "hora local" representada por {y,m,d,h,min,dow} e convertemos para Date (UTC).
 */

const OFFSET_MS = -3 * 60 * 60 * 1000;

export interface Local {
  y: number;
  m: number; // 1-12
  d: number;
  h: number;
  min: number;
  dow: number; // 0=domingo
}

export function toLocal(date: Date): Local {
  const t = new Date(date.getTime() + OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    min: t.getUTCMinutes(),
    dow: t.getUTCDay(),
  };
}

export function fromLocal(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min) - OFFSET_MS);
}

export function hm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function minutesOfDay(l: Local): number {
  return l.h * 60 + l.min;
}

/** Início do dia local (00:00 BRT) somando `days` dias. */
export function localDayStart(date: Date, days = 0): Date {
  const l = toLocal(date);
  return fromLocal(l.y, l.m, l.d + days);
}

export function atLocalMinutes(dayStart: Date, minutes: number): Date {
  return new Date(dayStart.getTime() + minutes * 60_000);
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "quinta, 22/10 às 19:10" */
export function formatBR(date: Date): string {
  const l = toLocal(date);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${DIAS[l.dow]}, ${p(l.d)}/${p(l.m)} às ${p(l.h)}:${p(l.min)}`;
}

/** ISO com offset -03:00, que é como o Google e a IA devem enxergar os horários. */
export function isoBR(date: Date): string {
  const l = toLocal(date);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${l.y}-${p(l.m)}-${p(l.d)}T${p(l.h)}:${p(l.min)}:00-03:00`;
}

export function dateKey(l: Local): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${l.y}-${p(l.m)}-${p(l.d)}`;
}
