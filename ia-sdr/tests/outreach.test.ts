import { test } from "node:test";
import assert from "node:assert/strict";
import { render, spin, limpaEmpresa } from "../src/lib/outreach-render.ts";
import { buildMime, comRodape, dentroDaJanela, spNow } from "../src/lib/outreach-email.ts";

const lead = { empresa: "Clínica Sorriso - Odonto Valinhos", decisor: "ana paula souza", cidade: "Valinhos", nicho: "Odontologia" };
const noon = new Date("2026-10-28T15:00:00Z"); // 12h em SP → "Boa tarde"

test("variáveis do template (igual ao motor)", () => {
  const out = render("{{saudacao}}{{, primeiro_nome}}! Vi a {{empresa}} em {{cidade}}. Ajudo {{nicho_plural}}.", lead, () => 0, noon);
  assert.equal(out, "Boa tarde, Ana! Vi a Clínica Sorriso em Valinhos. Ajudo clínicas odontológicas.");
});

test("sem decisor, a vírgula some; nicho desconhecido vira 'empresas'", () => {
  assert.equal(render("Oi{{, primeiro_nome}}, {{nicho_plural}}", { ...lead, decisor: null, nicho: "Padaria" }), "Oi, empresas");
});

test("spintax sorteia só entre as opções", () => {
  for (let i = 0; i < 30; i++) assert.ok(["oi", "olá"].includes(spin("{oi|olá}")));
  assert.equal(limpaEmpresa("Padaria Pão Bom | Centro"), "Padaria Pão Bom");
});

test("janela de envio em horário de São Paulo", () => {
  const cfg = { send_days: [1, 2, 3, 4, 5], send_start_hour: 9, send_end_hour: 17 };
  assert.equal(dentroDaJanela(cfg, new Date("2026-10-28T12:00:00Z")), true); // qua 09h SP
  assert.equal(dentroDaJanela(cfg, new Date("2026-10-28T11:59:00Z")), false); // qua 08h59 SP
  assert.equal(dentroDaJanela(cfg, new Date("2026-10-28T20:59:00Z")), true); // qua 17h59 SP
  assert.equal(dentroDaJanela(cfg, new Date("2026-10-28T21:00:00Z")), false); // qua 18h SP
  assert.equal(dentroDaJanela(cfg, new Date("2026-11-01T15:00:00Z")), false); // domingo
  assert.equal(spNow(new Date("2026-10-28T02:00:00Z")).dow, 2); // ainda terça em SP
});

test("rodapé de opt-out: coloca só se o texto ainda não tiver", () => {
  assert.match(comRodape("Olá"), /responder 'sair'/);
  const jaTem = 'Olá\n\nSe não quiser mais receber, é só responder "SAIR".';
  assert.equal(comRodape(jaTem), jaTem);
});

test("MIME com assunto em UTF-8", () => {
  const mime = buildMime("a@b.com", "Olá, ação", "Corpo");
  assert.match(mime, /Subject: =\?UTF-8\?B\?.+\?=/);
  assert.match(mime, /charset=UTF-8/);
});
