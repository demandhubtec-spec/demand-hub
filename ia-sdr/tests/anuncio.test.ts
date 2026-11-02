import { test } from "node:test";
import assert from "node:assert/strict";
import { contextoAnuncio, dadosDoAnuncio, detectarOrigemAnuncio, nichoDoTexto } from "../src/lib/anuncio.ts";

test("mensagem pronta do anúncio identifica a origem e o nicho", () => {
  const o = detectarOrigemAnuncio("Oi, quero o diagnóstico gratuito da minha clínica de estética.");
  assert.ok(o);
  assert.equal(o.via, "mensagem_pronta");
  assert.equal(o.nicho, "estetica");
  assert.equal(o.teste, false);
});

test("botão 'Quero testar a Ana' marca como teste", () => {
  const o = detectarOrigemAnuncio("Quero testar a Ana");
  assert.ok(o);
  assert.equal(o.teste, true);
});

test("botão de faturamento é reconhecido", () => {
  const o = detectarOrigemAnuncio("Faturo acima de R$ 30 mil e quero o diagnóstico");
  assert.ok(o);
  assert.equal(o.via, "mensagem_pronta");
});

test("conversa comum, sem anúncio e sem mensagem pronta, não é marcada", () => {
  assert.equal(detectarOrigemAnuncio("Oi, tudo bem? Vi vocês no Google"), null);
  assert.equal(detectarOrigemAnuncio("quanto custa?"), null);
});

test("dados do anúncio no contextInfo: pergunta de paciente vira teste e o nicho sai do título", () => {
  const m = {
    extendedTextMessage: {
      text: "quanto fica um implante?",
      contextInfo: { externalAdReply: { title: "Teste a Ana · clínica odontológica", sourceId: "120210000000", ctwaClid: "abc" } },
    },
  };
  const dados = dadosDoAnuncio(m);
  assert.ok(dados);
  assert.equal(dados.adId, "120210000000");
  const o = detectarOrigemAnuncio("quanto fica um implante?", dados);
  assert.ok(o);
  assert.equal(o.via, "anuncio");
  assert.equal(o.nicho, "odonto");
  assert.equal(o.teste, true);
});

test("chaves no formato PascalCase também são lidas", () => {
  const dados = dadosDoAnuncio({ extendedTextMessage: { ContextInfo: { ExternalAdReply: { Title: "Academia pronta para janeiro", SourceID: "9" } } } });
  assert.ok(dados);
  assert.equal(dados.adId, "9");
  assert.equal(nichoDoTexto(dados.titulo ?? ""), "academia");
});

test("mensagem sem dados de anúncio não inventa origem", () => {
  assert.equal(dadosDoAnuncio({ conversation: "oi" }), null);
});

test("contexto do prompt: corte de faturamento por nicho e sem jargão", () => {
  const academia = contextoAnuncio({ via: "anuncio", nicho: "academia", teste: true });
  assert.match(academia, /R\$ 100\.000/);
  assert.match(academia, /aluno/);
  const estetica = contextoAnuncio({ via: "mensagem_pronta", nicho: "estetica", teste: false });
  assert.match(estetica, /R\$ 30\.000/);
  assert.match(estetica, /paciente/);
  assert.doesNotMatch(estetica, /[—–]/);
  assert.equal(contextoAnuncio(null), "");
});
