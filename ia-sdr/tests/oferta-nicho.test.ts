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
  assert.equal(segmentoDoLead("Distribuidora", "Distribuidora de tabacaria e headshop"), "b2b");
  assert.equal(segmentoDoLead("Casa de verão"), "generico");
});

test("oferta em texto traz dor, promessa, reunião e pergunta", () => {
  const t = ofertaEmTexto(ofertaDoNicho("Academia"));
  assert.match(t, /janeiro/);
  assert.match(t, /aula experimental/);
  assert.match(t, /consultoria gratuita/);
});

test("28/11: recado para robô e prompt sem diagnóstico", async () => {
  const { recadoParaRobo } = await import("../src/lib/prospeccao.ts");
  const r = recadoParaRobo({ nicho: "clínica odontológica" } as never, "Marina");
  assert.ok(!/diagn/i.test(r), r);
  assert.match(r, /consultoria gratuita/);
  const { readFileSync } = await import("node:fs");
  const pg = readFileSync(new URL("../src/lib/prompt-gabi.ts", import.meta.url), "utf8");
  assert.ok(!pg.includes("pode perguntar se viram"));
});
