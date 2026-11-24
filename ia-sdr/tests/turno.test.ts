import { test } from "node:test";
import assert from "node:assert/strict";
import { naJanelaDoTurno, proximaJanelaDoTurno, turnoDoLead } from "../src/lib/turno.ts";

// Horário de Brasília (UTC-3)
const br = (iso: string) => new Date(`${iso}-03:00`);

test("turno: pizzaria, hamburgueria, lanches e bar são da noite", () => {
  assert.equal(turnoDoLead({ nicho: "Restaurantes e alimentação", empresa: "Pizzaria da Vó" }), "noite");
  assert.equal(turnoDoLead({ nicho: "Restaurantes e alimentação", empresa: "Patrick's Burgers Indaiatuba" }), "noite");
  assert.equal(turnoDoLead({ nicho: "Restaurantes e alimentação", empresa: "Nenê Lanches" }), "noite");
  assert.equal(turnoDoLead({ nicho: "Restaurantes e alimentação", empresa: "Yankees American Bar" }), "noite");
  assert.equal(turnoDoLead({ nicho: "Restaurantes e alimentação", empresa: "Restaurante e Pizzaria Paraiso" }), "noite");
});

test("turno: restaurante de almoço, café, doces e salgados são do almoço; clínica não tem turno", () => {
  assert.equal(turnoDoLead({ nicho: "Restaurantes e alimentação", empresa: "Restaurante Grão Pará" }), "almoco");
  assert.equal(turnoDoLead({ nicho: "Alimentação", empresa: "Café do Lago Colonial" }), "almoco");
  assert.equal(turnoDoLead({ nicho: "Alimentação", empresa: "Giba Salgados" }), "almoco");
  assert.equal(turnoDoLead({ nicho: "Clínica médica", empresa: "Vacivitta Salto" }), null);
  assert.equal(turnoDoLead({ nicho: "Imobiliária", empresa: "Barão Imóveis" }), null);
  assert.equal(turnoDoLead({ nicho: "Clínica médica", empresa: "Odontoclinic - Campinas Barão Geraldo" }), null);
  assert.equal(turnoDoLead({ nicho: "Restaurantes e alimentação", empresa: "Restaurante Barão Geraldo" }), "almoco");
  assert.equal(turnoDoLead(null), null);
});

test("janela: noite das 17h30 às 18h30 de segunda a sexta", () => {
  assert.equal(naJanelaDoTurno(br("2026-11-24T17:29:00"), "noite"), false);
  assert.equal(naJanelaDoTurno(br("2026-11-24T17:30:00"), "noite"), true);
  assert.equal(naJanelaDoTurno(br("2026-11-24T18:29:00"), "noite"), true);
  assert.equal(naJanelaDoTurno(br("2026-11-24T18:30:00"), "noite"), false);
  assert.equal(naJanelaDoTurno(br("2026-11-28T17:45:00"), "noite"), false); // sábado
});

test("janela: almoço das 9h às 11h", () => {
  assert.equal(naJanelaDoTurno(br("2026-11-24T08:59:00"), "almoco"), false);
  assert.equal(naJanelaDoTurno(br("2026-11-24T09:00:00"), "almoco"), true);
  assert.equal(naJanelaDoTurno(br("2026-11-24T10:59:00"), "almoco"), true);
  assert.equal(naJanelaDoTurno(br("2026-11-24T11:00:00"), "almoco"), false);
});

test("próxima janela: hoje se ainda não passou, senão o próximo dia válido", () => {
  assert.equal(proximaJanelaDoTurno(br("2026-11-24T10:00:00"), "noite").toISOString(), br("2026-11-24T17:30:00").toISOString());
  assert.equal(proximaJanelaDoTurno(br("2026-11-24T19:00:00"), "noite").toISOString(), br("2026-11-25T17:30:00").toISOString());
  assert.equal(proximaJanelaDoTurno(br("2026-11-27T19:00:00"), "noite").toISOString(), br("2026-11-30T17:30:00").toISOString()); // sexta → segunda
  assert.equal(proximaJanelaDoTurno(br("2026-11-24T12:00:00"), "almoco").toISOString(), br("2026-11-25T09:00:00").toISOString());
  // feriado pulado
  const semFeriado = (d: Date) => d.toISOString().slice(0, 10) !== "2026-11-25";
  assert.equal(proximaJanelaDoTurno(br("2026-11-24T19:00:00"), "noite", semFeriado).toISOString(), br("2026-11-26T17:30:00").toISOString());
});
