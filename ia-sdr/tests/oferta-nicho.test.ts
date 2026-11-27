import { test } from "node:test";
import assert from "node:assert/strict";
import { ofertaDoNicho, ofertaEmTexto, segmentoDoLead } from "../src/lib/oferta-nicho.ts";

test("segmento do lead", () => {
  assert.equal(segmentoDoLead("Curso profissionalizante"), "educacao");
  assert.equal(segmentoDoLead("Faculdade"), "educacao");
  assert.equal(segmentoDoLead("Escola de inglês"), "educacao");
  assert.equal(segmentoDoLead("Academia", "Box CrossFit Indaiatuba"), "academia");
  assert.equal(segmentoDoLead("Pilates"), "academia");
  assert.equal(segmentoDoLead("Odontologia"), "clinica");
  assert.equal(segmentoDoLead("Estética"), "estetica");
  assert.equal(segmentoDoLead("Restaurantes e alimentação"), "alimentacao");
  assert.equal(segmentoDoLead("Imobiliária"), "imobiliaria");
  assert.equal(segmentoDoLead("Construtora"), "construtora");
  assert.equal(segmentoDoLead("Casa de verão"), "generico");
});

test("oferta em texto traz dor, promessa, reunião e pergunta", () => {
  const t = ofertaEmTexto(ofertaDoNicho("Academia"));
  assert.match(t, /janeiro/);
  assert.match(t, /aula experimental/);
  assert.match(t, /motivo da reunião/);
});
