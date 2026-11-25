import { test } from "node:test";
import assert from "node:assert/strict";
import { portfolioDoSegmento, textoDoMaterial } from "../src/lib/material-ligacao.ts";
import { normalizarLeitura } from "../src/lib/callface.ts";

test("portfólio certo por segmento", () => {
  assert.equal(portfolioDoSegmento("Odontologia"), "https://demandhub.com.br/portfolioclinicas");
  assert.equal(portfolioDoSegmento(null, "Pizzaria Forcin"), "https://demandhub.com.br/portfolioresturante".replace("resturante", "restaurante"));
  assert.equal(portfolioDoSegmento("Pet shop / Veterinária"), "https://demandhub.com.br/portfoliopetshop");
  assert.equal(portfolioDoSegmento("Advocacia"), "https://demandhub.com.br/portfolioadvocacia");
  assert.equal(portfolioDoSegmento("Imobiliária"), "https://demandhub.com.br/portfolioimobiliaria");
  assert.equal(portfolioDoSegmento("Eventos", "Buffet Garçons"), "https://demandhub.com.br/portfolioeventos");
  assert.equal(portfolioDoSegmento("Pousadas e viagem"), "https://demandhub.com.br/portfolioservicos");
});

test("texto do material: nome, empresa curta, diagnóstico opcional e pergunta de horário", () => {
  const t = textoDoMaterial("Giovana Silva", "Oral Unic | Dentista em Indaiatuba", "https://demandhub.com.br/portfolioclinicas", null);
  assert.match(t, /^Oi, Giovana!/);
  assert.match(t, /a Oral Unic\./);
  assert.doesNotMatch(t, /diagnóstico que/);
  assert.match(t, /Qual o melhor dia e horário pra você\?$/);
  const t2 = textoDoMaterial(null, null, "x", "https://r");
  assert.match(t2, /^Oi! Aqui é a Gabi, da Demand/);
  assert.match(t2, /diagnóstico que nosso especialista preparou/);
  assert.match(t2, /pra conversar com o responsável\?$/);
});

test("leitura da ligação aceita material só whatsapp/email", () => {
  assert.equal(normalizarLeitura({ material: "whatsapp" }).material, "whatsapp");
  assert.equal(normalizarLeitura({ material: "email" }).material, "email");
  assert.equal(normalizarLeitura({ material: "sim" }).material, null);
});
