import { test } from "node:test";
import assert from "node:assert/strict";
import { comNomeDaSdr, idPromptDaSdr, nomeDaSdr, proximaSdr, sdrValida } from "../src/lib/sdrs.ts";

test("lead sem SDR (antigo) é da Gabi", () => {
  assert.equal(sdrValida(undefined), "gabi");
  assert.equal(sdrValida("qualquer"), "gabi");
  assert.equal(sdrValida("marina"), "marina");
  assert.equal(nomeDaSdr("marina"), "Marina");
  assert.equal(idPromptDaSdr(null), "prompt_gabi");
});

test("o prompt da Marina troca só o nome", () => {
  assert.equal(comNomeDaSdr("Você é a Gabi, da DemandIA. Aqui é a Gabi.", "marina"), "Você é a Marina, da DemandIA. Aqui é a Marina.");
  assert.equal(comNomeDaSdr("Você é a Gabi", "gabi"), "Você é a Gabi");
});

test("fila única: Gabi 30 e Marina 10 dividem na proporção e respeitam o teto", () => {
  const tetos = { gabi: 30, marina: 10 };
  const feitos = { gabi: 0, marina: 0 };
  const ordem: string[] = [];
  for (let i = 0; i < 45; i++) {
    const s = proximaSdr(feitos, tetos, ["gabi", "marina"]);
    if (!s) break;
    feitos[s]++;
    ordem.push(s);
  }
  assert.deepEqual(feitos, { gabi: 30, marina: 10 });
  assert.equal(ordem.length, 40);
  // A Marina entra espalhada no dia, não tudo no fim
  assert.ok(ordem.slice(0, 8).includes("marina"));
});

test("Marina desligada: só a Gabi dispara", () => {
  assert.equal(proximaSdr({ gabi: 5, marina: 0 }, { gabi: 30, marina: 10 }, ["gabi"]), "gabi");
  assert.equal(proximaSdr({ gabi: 30, marina: 0 }, { gabi: 30, marina: 10 }, ["gabi"]), null);
});
