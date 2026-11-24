import { test } from "node:test";
import assert from "node:assert/strict";
import { PROMPT_GABI_PADRAO, preencherVariaveis, promptGabiEmTexto, secaoFollowUp, variaveisDesconhecidas } from "../src/lib/prompt-gabi.ts";
import { systemPrompt } from "../src/lib/prompt.ts";
import { varsPromptGabi } from "../src/lib/prospeccao.ts";

const p = {
  empresa: "Clínica Moriah",
  nicho: "Clínica médica",
  cidade: "Indaiatuba",
  wa_sent_at: "2026-11-14T11:00:00Z",
  wa_message: "Oi, bom dia! 😊\n\nTudo bem?",
  decisor: null,
  socios: [{ nome: "MARIA SOUZA" }],
  site: "https://moriah.com.br",
} as never;
const lead = { id: "1", phone: "5519", nome: "Recepção", status: "novo" } as never;

test("variáveis do Prompt System viram os dados do lead", () => {
  const t = preencherVariaveis("Oi {{empresa}} de {{cidade}}, {{ nicho_plural }} e {{xyz}}", varsPromptGabi(p));
  assert.equal(t, "Oi Clínica Moriah de Indaiatuba, clínicas e {{xyz}}");
});

test("o padrão não usa variável desconhecida e tem seção de follow-up", () => {
  assert.deepEqual(variaveisDesconhecidas(PROMPT_GABI_PADRAO), []);
  assert.ok(secaoFollowUp(PROMPT_GABI_PADRAO));
  const txt = promptGabiEmTexto(PROMPT_GABI_PADRAO, varsPromptGabi(p));
  assert.ok(!txt.includes("{{"));
});

test("prospecção v2 usa o Prompt System (sem BANT, sem 👍)", () => {
  const s = systemPrompt(lead, null, new Date("2026-11-14T12:30:00Z"), p);
  assert.ok(s.includes("PROMPT SYSTEM"));
  assert.ok(s.includes("Etapa 1: Apresentação"));
  assert.ok(!s.includes("BANT"));
  assert.ok(!s.includes("👍)"));
  assert.ok(s.includes('cumprimente com "bom dia"'));
});

test("prompt: no prompt da Marina, quem liga continua sendo a Gabi (24/11)", async () => {
  const { comNomeDaSdr } = await import("../src/lib/sdrs.ts");
  const { preencherVariaveis } = await import("../src/lib/prompt-gabi.ts");
  const t = preencherVariaveis(comNomeDaSdr("Você é a Gabi. Quem liga é sempre a ⟦Gabi⟧.", "marina"), {});
  assert.equal(t, "Você é a Marina. Quem liga é sempre a Gabi.");
  assert.equal(preencherVariaveis(comNomeDaSdr("Você é a Gabi. Quem liga é a ⟦Gabi⟧.", "gabi"), {}), "Você é a Gabi. Quem liga é a Gabi.");
});
