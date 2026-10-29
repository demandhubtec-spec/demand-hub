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

import { contextoProspeccao, ehDisparoDaProspeccao } from "../src/lib/prospeccao.ts";

const prosp = {
  empresa: "Clínica Sorriso", nicho: "Odontologia", cidade: "Valinhos", decisor: "Ana", cargo_decisor: null,
  site: null, instagram: null, observacoes: null,
  wa_message: "Boa tarde, Ana! Aqui é o Kelvin...", wa_sent_at: "2026-10-28T15:00:00Z",
};

test("opção C: reconhece o disparo da prospecção (não é o Kelvin respondendo à mão)", () => {
  assert.equal(ehDisparoDaProspeccao(prosp, "Boa tarde, Ana! Aqui é o Kelvin...", new Date("2026-10-30T10:00:00Z")), true);
  assert.equal(ehDisparoDaProspeccao(prosp, "outra coisa", new Date("2026-10-28T15:01:00Z")), true); // até 3 min
  assert.equal(ehDisparoDaProspeccao(prosp, "Oi, aqui é o Kelvin de novo", new Date("2026-10-29T10:00:00Z")), false);
  assert.equal(ehDisparoDaProspeccao(null, "qualquer"), false);
});

test("opção C: a Ana recebe o contexto da abordagem ativa", () => {
  const c = contextoProspeccao(prosp);
  assert.match(c, /PROSPECÇÃO ATIVA/);
  assert.match(c, /Aqui é o Kelvin/);
  assert.match(c, /Odontologia/);
  assert.match(c, /encerrar_contato/);
  assert.equal(contextoProspeccao(null), "");
});
