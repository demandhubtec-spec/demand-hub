/**
 * Turno de alimentação (23/11/2026, Kelvin): teste de duas semanas.
 * Quem só abre à noite (pizzaria, hamburgueria, lanches, bar) recebe o 1º contato e os follow-ups das 17h30 às 18h30
 * (antes do movimento começar). Restaurante de almoço, café, doces e salgados recebem das 9h às 11h.
 * O resto (clínicas, eventos...) segue o horário de sempre. Mesma regra em supabase/functions/outreach-wa-tick.
 */
import { atLocalMinutes, localDayStart, minutesOfDay, toLocal } from "./time.ts";

export type Turno = "noite" | "almoco";

// "bar" e "pub" só como palavra inteira: "Barão Geraldo" (bairro de Campinas) não é bar
const NOITE = /pizz|hamburg|burger|burguer|(?<!\p{L})lanch|(?<!\p{L})bar(?!\p{L})|(?<!\p{L})pub(?!\p{L})|espetaria|espetinho|hot ?dog|petiscaria|choperia|cervejaria|boteco/iu;
const ALIMENTACAO = /aliment|restaur|hamburg|burger|pizz|lanch|caf[eé]|confeit|doce|salgad|marmit|delivery|gastronom|food|a[cç]a[ií]|gelat|sorvet|churras|espetaria|coxinha|padaria|cantina|(?<!\p{L})bar(?!\p{L})/iu;

export const JANELAS_TURNO: Record<Turno, [number, number]> = {
  noite: [17 * 60 + 30, 18 * 60 + 30],
  almoco: [9 * 60, 11 * 60],
};

/** Turno do lead pela empresa e pelo nicho; null quando não é alimentação (segue o horário normal). */
export function turnoDoLead(p: { nicho?: string | null; empresa?: string | null } | null | undefined): Turno | null {
  if (!p) return null;
  const t = `${p.nicho ?? ""} ${p.empresa ?? ""}`;
  if (!ALIMENTACAO.test(t)) return null;
  return NOITE.test(t) ? "noite" : "almoco";
}

/** Dias do turno: noite só de segunda a sexta; almoço de segunda a sábado (sábado é só de manhã). */
function diaDoTurno(dow: number, turno: Turno): boolean {
  return turno === "noite" ? dow >= 1 && dow <= 5 : dow >= 1 && dow <= 6;
}

export function naJanelaDoTurno(now: Date, turno: Turno, ehDiaUtil: (d: Date) => boolean = () => true): boolean {
  const l = toLocal(now);
  if (!diaDoTurno(l.dow, turno) || !ehDiaUtil(now)) return false;
  const m = minutesOfDay(l);
  const [ini, fim] = JANELAS_TURNO[turno];
  return m >= ini && m < fim;
}

/** Próximo começo da janela do turno a partir de agora (hoje, se ainda não passou; senão o próximo dia válido). */
export function proximaJanelaDoTurno(now: Date, turno: Turno, ehDiaUtil: (d: Date) => boolean = () => true): Date {
  const [ini] = JANELAS_TURNO[turno];
  for (let i = 0; i <= 14; i++) {
    const dia = localDayStart(now, i);
    const inicio = atLocalMinutes(dia, ini);
    if (inicio.getTime() < now.getTime()) continue;
    if (diaDoTurno(toLocal(dia).dow, turno) && ehDiaUtil(dia)) return inicio;
  }
  return atLocalMinutes(localDayStart(now, 1), ini);
}
