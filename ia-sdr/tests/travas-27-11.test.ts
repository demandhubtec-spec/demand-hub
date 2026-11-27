import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarTravasDeTexto, deveCalarNaDespedida, extrairEmail, semPerguntaDeFaturamento, siteCerto, soDespedida } from "../src/lib/travas.ts";
import { textoDoMaterial } from "../src/lib/material-ligacao.ts";

test("site errado vira demandhub.com.br", () => {
  assert.equal(siteCerto("Veja em www.demandia.com.br e https://DemandIA.com"), "Veja em demandhub.com.br e demandhub.com.br");
  assert.match(aplicarTravasDeTexto("Nosso site: demandia.com.br", new Date("2026-11-27T13:00:00Z")), /demandhub\.com\.br/);
});

test("pergunta de faturamento sai da mensagem", () => {
  const t = "Que legal, Ivianh! 😊\n\nE hoje vocês faturam quanto por mês, mais ou menos?";
  assert.equal(semPerguntaDeFaturamento(t), "Que legal, Ivianh! 😊");
  assert.equal(semPerguntaDeFaturamento("O faturamento de vocês vai crescer com isso."), "O faturamento de vocês vai crescer com isso.");
});

test("despedida: só agradecimento", () => {
  assert.ok(soDespedida("Obrigada!"));
  assert.ok(soDespedida("Por nada 😊"));
  assert.ok(soDespedida("👍"));
  assert.ok(!soDespedida("Obrigada, pode mandar o diagnóstico?"));
});

test("cala no loop de obrigada/por nada", () => {
  const h = [
    { direction: "out", content: "Imagina! Obrigada você 😊" },
    { direction: "in", content: "Por nada!" },
  ];
  assert.ok(deveCalarNaDespedida(h));
  // nossa última foi pergunta: responde
  assert.ok(!deveCalarNaDespedida([{ direction: "out", content: "Conseguiu dar uma olhadinha?" }, { direction: "in", content: "Obrigada" }]));
  // diagnóstico mandado (sem despedida) e a pessoa agradece: responde
  assert.ok(!deveCalarNaDespedida([{ direction: "out", content: "Segue o diagnóstico da clínica." }, { direction: "in", content: "Obrigada" }]));
  // veio pergunta nova: responde
  assert.ok(!deveCalarNaDespedida([{ direction: "out", content: "Obrigada, sucesso!" }, { direction: "in", content: "Quanto custa?" }]));
});

test("e-mail na mensagem", () => {
  assert.equal(extrairEmail("pode mandar no RJCCLINICA@GMAIL.COM."), "rjcclinica@gmail.com");
  assert.equal(extrairEmail("manda aqui mesmo"), null);
});

test("material pedido no WhatsApp", () => {
  const t = textoDoMaterial("Beatriz", "Nova Opção Turismo", "https://demandhub.com.br/portfolioservicos", null, "whatsapp", "Marina");
  assert.match(t, /Aqui é a Marina, da Demand/);
  assert.match(t, /Como combinamos no WhatsApp/);
});
