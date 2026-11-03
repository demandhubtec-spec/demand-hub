import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateSlots, freeSlots, isValidSlot, pickOptions } from "../src/lib/schedule.ts";
import { clampToBusinessTime, isBusinessTime, nextFollowUpAt } from "../src/lib/followup.ts";
import { formatBR, fromLocal, toLocal } from "../src/lib/time.ts";

const hhmm = (d: Date) => {
  const l = toLocal(d);
  return `${String(l.h).padStart(2, "0")}:${String(l.min).padStart(2, "0")}`;
};

const DIA_TODO = Array.from({ length: 20 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

test("dias úteis: reuniões de 30 min das 9h às 19h", () => {
  const now = fromLocal(2026, 10, 20, 18, 0); // terça 18:00 → quarta inteira livre
  const day = candidateSlots(now).filter((s) => toLocal(s.start).d === 21);
  assert.deepEqual(day.map((s) => hhmm(s.start)), DIA_TODO);
  assert.equal(hhmm(day[day.length - 1].end), "19:00");
});

test("sábado: mesmo horário, das 9h às 19h", () => {
  const now = fromLocal(2026, 10, 21, 9, 0);
  const sat = candidateSlots(now).filter((s) => toLocal(s.start).d === 24);
  assert.deepEqual(sat.map((s) => hhmm(s.start)), DIA_TODO);
});

test("domingo não tem reunião", () => {
  const now = fromLocal(2026, 10, 21, 9, 0);
  assert.equal(candidateSlots(now).filter((s) => toLocal(s.start).dow === 0).length, 0);
});

test("antecedência mínima de 3h", () => {
  const today = candidateSlots(fromLocal(2026, 10, 21, 15, 10)).filter((s) => toLocal(s.start).d === 21);
  assert.deepEqual(today.map((s) => hhmm(s.start)), ["18:30"]);
  const tarde = candidateSlots(fromLocal(2026, 10, 21, 16, 0)).filter((s) => toLocal(s.start).d === 21);
  assert.deepEqual(tarde.map((s) => hhmm(s.start)), []);
});

test("remove horários ocupados no Google Agenda", () => {
  const now = fromLocal(2026, 10, 21, 14, 0);
  const busy = [{ start: fromLocal(2026, 10, 21, 17, 45), end: fromLocal(2026, 10, 21, 18, 15) }];
  const today = freeSlots(now, busy).filter((s) => toLocal(s.start).d === 21);
  assert.deepEqual(today.map((s) => hhmm(s.start)), ["17:00", "18:30"]);
});

test("oferece até 3 opções em dias diferentes", () => {
  const now = fromLocal(2026, 10, 21, 9, 0);
  const opts = pickOptions(freeSlots(now, []));
  assert.equal(opts.length, 3);
  assert.equal(new Set(opts.map((o) => toLocal(o.start).d)).size, 3);
  assert.match(formatBR(opts[0].start), /^quarta, 21\/10 às 12:00$/);
});

test("valida horário escolhido", () => {
  const now = fromLocal(2026, 10, 21, 9, 0);
  assert.ok(isValidSlot(fromLocal(2026, 10, 22, 10, 30), now));
  assert.ok(!isValidSlot(fromLocal(2026, 10, 22, 10, 15), now));
  assert.ok(!isValidSlot(fromLocal(2026, 10, 22, 19, 0), now)); // termina 19:30
  assert.ok(!isValidSlot(fromLocal(2026, 10, 25, 10, 0), now)); // domingo
});

test("horário comercial do follow-up: dias úteis 08–18h", () => {
  assert.ok(isBusinessTime(fromLocal(2026, 10, 21, 8, 0)));
  assert.ok(isBusinessTime(fromLocal(2026, 10, 21, 17, 59)));
  assert.ok(!isBusinessTime(fromLocal(2026, 10, 21, 18, 0)));
  assert.ok(!isBusinessTime(fromLocal(2026, 10, 21, 3, 0)));
  assert.ok(!isBusinessTime(fromLocal(2026, 10, 24, 10, 0))); // sábado
  assert.ok(!isBusinessTime(fromLocal(2026, 11, 2, 10, 0))); // finados
  assert.ok(!isBusinessTime(fromLocal(2026, 11, 20, 10, 0))); // consciência negra
});

test("follow-up de madrugada/fim de semana vai para o próximo dia útil 08:00", () => {
  const sexta22h = fromLocal(2026, 10, 23, 22, 0);
  const r = toLocal(clampToBusinessTime(sexta22h));
  assert.deepEqual([r.dow, r.h, r.min], [1, 8, 0]); // segunda 08:00
  const q6h = toLocal(clampToBusinessTime(fromLocal(2026, 10, 21, 6, 0)));
  assert.deepEqual([q6h.d, q6h.h], [21, 8]);
});

test("cadência 1, 3, 7 dias intercalando e limite de 12", () => {
  const from = fromLocal(2026, 10, 21, 10, 0); // quarta 10:00
  const a0 = toLocal(nextFollowUpAt(from, 0)!);
  assert.deepEqual([a0.d, a0.h], [22, 10]); // +1 dia
  const a1 = toLocal(nextFollowUpAt(from, 1)!);
  assert.deepEqual([a1.d, a1.dow, a1.h], [26, 1, 8]); // +3 = sábado → segunda 08:00
  const a2 = toLocal(nextFollowUpAt(from, 2)!);
  assert.deepEqual([a2.d, a2.h], [28, 10]); // +7
  const a3 = toLocal(nextFollowUpAt(from, 3)!);
  assert.equal(a3.d, 22); // volta para +1
  assert.ok(nextFollowUpAt(from, 11));
  assert.equal(nextFollowUpAt(from, 12), null);
});

test("nenhum follow-up gerado cai fora do horário comercial", () => {
  let t = fromLocal(2026, 10, 23, 19, 45);
  for (let i = 0; i < 12; i++) {
    const n = nextFollowUpAt(t, i)!;
    assert.ok(isBusinessTime(n), `tentativa ${i + 1} fora do horário: ${formatBR(n)}`);
    t = n;
  }
});
