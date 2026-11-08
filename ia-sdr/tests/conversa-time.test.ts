import { test } from "node:test";
import assert from "node:assert/strict";
import { lerResposta, respostaEmTexto } from "../src/lib/conversa-time.ts";

test("lê a resposta do agente e monta o texto na ordem: entendi, contexto, solução, hipóteses", () => {
  const r = lerResposta(
    JSON.stringify({ entendi: "Você quer mais reuniões — com clínicas", contexto: "12 abordadas", solucao: "Focar em clínicas", hipoteses: ["Testar áudio no 1º toque", ""], proximo_passo: "Aprovar a lista", pergunta: "" }),
  );
  assert.ok(r);
  assert.equal(r!.hipoteses.length, 1);
  assert.equal(r!.pergunta, null);
  const t = respostaEmTexto(r!);
  assert.ok(t.indexOf("Entendi assim") < t.indexOf("Melhor solução"));
  assert.ok(t.includes("1. Testar áudio"));
  assert.ok(!t.includes("—"));
});

test("resposta inválida volta null", () => {
  assert.equal(lerResposta("não é json"), null);
  assert.equal(lerResposta(JSON.stringify({ entendi: "x" })), null);
});
