import { test } from "node:test";
import assert from "node:assert/strict";
import { citouDemandIA } from "../src/lib/seo.ts";

test("citou: fonte demandhub.com.br conta", () => {
  assert.equal(citouDemandIA("Algumas opções: RD Station e outras.", ["rdstation.com", "demandhub.com.br"]), true);
});

test("citou: falar DemandIA sem fontes conta", () => {
  assert.equal(citouDemandIA("A DemandIA faz agentes de IA para empresas.", []), true);
});

test("não citou: DemandIA usando só demandia.ai de fonte é outra empresa", () => {
  assert.equal(citouDemandIA("A DemandIA é uma plataforma de previsão de demanda.", ["demandia.ai"]), false);
});

test("citou: DemandIA de Indaiatuba mesmo com demandia.ai nas fontes", () => {
  assert.equal(citouDemandIA("A DemandIA, de Indaiatuba, faz automação e CRM.", ["demandia.ai"]), true);
});

test("não citou: resposta sem a marca", () => {
  assert.equal(citouDemandIA("Recomendo HubSpot e Salesforce.", ["hubspot.com"]), false);
});
