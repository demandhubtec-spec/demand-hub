import { SDR_CONFIG } from "../config/sdr.ts";
import { atLocalMinutes, hm, localDayStart, toLocal } from "./time.ts";

export interface Interval {
  start: Date;
  end: Date;
}

/** Todos os horários possíveis de reunião (sem olhar a agenda), dentro dos próximos N dias. */
export function candidateSlots(now: Date, cfg = SDR_CONFIG.reuniao): Interval[] {
  const step = cfg.duracaoMin + cfg.intervaloEntreReunioesMin;
  const earliest = now.getTime() + cfg.antecedenciaMinimaHoras * 3_600_000;
  const slots: Interval[] = [];

  for (let day = 0; day <= cfg.diasAFrente; day++) {
    const dayStart = localDayStart(now, day);
    const dow = toLocal(dayStart).dow;
    for (const [ini, fim] of cfg.janelas[dow] ?? []) {
      for (let t = hm(ini); t + cfg.duracaoMin <= hm(fim); t += step) {
        const start = atLocalMinutes(dayStart, t);
        if (start.getTime() < earliest) continue;
        slots.push({ start, end: new Date(start.getTime() + cfg.duracaoMin * 60_000) });
      }
    }
  }
  return slots;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Horários livres = candidatos que não batem com nenhum compromisso ocupado do Google Agenda. */
export function freeSlots(now: Date, busy: Interval[], cfg = SDR_CONFIG.reuniao): Interval[] {
  return candidateSlots(now, cfg).filter((s) => !busy.some((b) => overlaps(s, b)));
}

/**
 * Escolhe poucas opções bem distribuídas para oferecer ao lead
 * (no máximo uma por dia, priorizando os dias mais próximos).
 */
export function pickOptions(slots: Interval[], max = SDR_CONFIG.reuniao.maxOpcoesOferecidas): Interval[] {
  const byDay = new Map<string, Interval>();
  for (const s of slots) {
    const l = toLocal(s.start);
    const k = `${l.y}-${l.m}-${l.d}`;
    if (!byDay.has(k)) byDay.set(k, s);
  }
  const picked = [...byDay.values()].slice(0, max);
  return picked.length >= max ? picked : slots.slice(0, max);
}

/** Confere se um horário escolhido pelo lead é válido pelas regras da agenda. */
export function isValidSlot(start: Date, now: Date, cfg = SDR_CONFIG.reuniao): boolean {
  return candidateSlots(now, cfg).some((s) => s.start.getTime() === start.getTime());
}

/** Quando mandar confirmação e lembrete de uma reunião. */
export function reminderTimes(start: Date, now: Date) {
  const L = SDR_CONFIG.lembretes;
  const local = toLocal(start);
  const confirm =
    local.h >= 12
      ? atLocalMinutes(localDayStart(start), hm(L.confirmacaoMesmoDiaHora))
      : atLocalMinutes(localDayStart(start, -1), hm(L.confirmacaoDiaAnteriorHora));
  const reminder = new Date(start.getTime() - L.lembreteAntesMin * 60_000);
  return {
    confirm_at: confirm.toISOString(),
    // Se a reunião foi marcada depois do horário da confirmação, não precisa confirmar de novo
    confirm_sent_at: confirm <= now ? now.toISOString() : null,
    reminder_at: reminder.toISOString(),
    reminder_sent_at: reminder <= now ? now.toISOString() : null,
  };
}

