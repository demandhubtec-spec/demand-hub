import { test } from "node:test";
import assert from "node:assert/strict";
import { leadPatch, normalizePhone, parseForm, phoneVariants, toCSV } from "../src/lib/diagnostico.ts";

const base = {
  nome: "Maria Souza", whatsapp: "(19) 98825-9883", email: "maria@clinica.com.br", empresa: "Clínica Bem Estar", segmento: "Clínica / saúde / estética",
  cargo: "dono", faturamento: "50k_100k", equipe: "6-15", canais: ["Indicação"], dores: ["Poucos clientes chegando"],
  tempo_resposta: "No mesmo dia", invest_marketing: "Até R$ 2 mil", prazo: "ate_3_meses", desafio: "", utm: { utm_source: "facebook", utm_campaign: "diag", lixo: "x" },
};

test("telefone: aceita com e sem 55 e recusa número curto", () => {
  assert.equal(normalizePhone("(19) 98825-9883"), "5519988259883");
  assert.equal(normalizePhone("5519988259883"), "5519988259883");
  assert.equal(normalizePhone("1988259883"), "551988259883");
  assert.equal(normalizePhone("98825-9883"), null);
});

test("telefone: variantes com e sem o 9", () => {
  assert.deepEqual(phoneVariants("5519988259883").sort(), ["551988259883", "5519988259883"].sort());
  assert.deepEqual(phoneVariants("551988259883").sort(), ["551988259883", "5519988259883"].sort());
});

test("formulário válido vira lead qualificado (dono, 50 mil, dor, até 3 meses)", () => {
  const r = parseForm(base);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.form.utm, { utm_source: "facebook", utm_campaign: "diag" }); // só chaves conhecidas
  const { patch, bant } = leadPatch(r.form);
  assert.equal(patch.faturamento_mensal, 50_000);
  assert.equal(patch.autoridade, "decisor");
  assert.equal(bant.score, 4);
  assert.equal(bant.qualificado, true);
});

test("abaixo de 30 mil fica desqualificado; colaborador não conta como decisor", () => {
  const r = parseForm({ ...base, faturamento: "ate_30k", cargo: "colaborador" });
  assert.ok(r.ok);
  if (!r.ok) return;
  const { patch, bant } = leadPatch(r.form);
  assert.equal("autoridade" in patch, false);
  assert.equal(bant.desqualificado, true);
});

test("formulário sem campos obrigatórios é recusado", () => {
  assert.equal(parseForm({ ...base, nome: "" }).ok, false);
  assert.equal(parseForm({ ...base, whatsapp: "123" }).ok, false);
  assert.equal(parseForm({ ...base, faturamento: "qualquer" }).ok, false);
  assert.equal(parseForm({ ...base, email: "" }).ok, false);
  assert.equal(parseForm({ ...base, email: "maria@" }).ok, false);
});

test("CSV escapa vírgula, aspas e listas", () => {
  const csv = toCSV([{ a: 'Oi, "tudo"', b: ["x", "y"] }], [["a", "A"], ["b", "B"]]);
  assert.equal(csv, 'A,B\n"Oi, ""tudo""","x, y"');
});
