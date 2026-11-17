import { test } from "node:test";
import assert from "node:assert/strict";
import { ordenarCandidatos, type CandidatoCutucada } from "../src/lib/cutucada-fila.ts";

const V2 = "2026-11-13T03:00:00Z";
// Terça, 17/11/2026, 08:10 em Brasília
const agora = new Date("2026-11-17T11:10:00Z");
const c = (place_id: string, wa_sent_at: string, ultimo_toque_em: string | null = null): CandidatoCutucada => ({
  place_id, empresa: place_id, whatsapp: "5519999999999", wa_sent_at, ultimo_toque_em,
});

test("quem recebeu o 'Oi' na sexta à noite (fora da janela antiga de 1 a 6 h) agora entra", () => {
  const sexta1830 = c("sexta-noite", "2026-11-13T21:30:00Z", "2026-11-13T21:29:50Z");
  assert.deepEqual(ordenarCandidatos([sexta1830], agora, V2).map((x) => x.place_id), ["sexta-noite"]);
});

test("quem já foi cutucado (ultimo_toque_em depois do 1º contato) não entra de novo", () => {
  const cutucado = c("ja-cutucado", "2026-11-16T12:00:00Z", "2026-11-16T13:05:00Z");
  assert.equal(ordenarCandidatos([cutucado], agora, V2).length, 0);
});

test("menos de 1 hora do 1º contato ainda espera; antes da v2 ou mais de 5 dias não entra", () => {
  const recente = c("agora-pouco", "2026-11-17T10:40:00Z");
  const antigo = c("antes-v2", "2026-11-12T15:00:00Z");
  assert.equal(ordenarCandidatos([recente, antigo], agora, V2).length, 0);
  const seisDias = ordenarCandidatos([c("x", "2026-11-14T12:00:00Z")], new Date("2026-11-20T12:00:00Z"), V2);
  assert.equal(seisDias.length, 0);
});

test("os das últimas 6 horas vão antes dos atrasados", () => {
  const mais = new Date("2026-11-17T15:00:00Z"); // 12h em Brasília
  const atrasado = c("atrasado", "2026-11-14T13:00:00Z");
  const quente = c("quente", "2026-11-17T11:00:00Z");
  assert.deepEqual(ordenarCandidatos([atrasado, quente], mais, V2).map((x) => x.place_id), ["quente", "atrasado"]);
});
