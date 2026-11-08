import { test } from "node:test";
import assert from "node:assert/strict";
import { playbookEmTexto } from "../src/lib/playbook.ts";

test("playbook vira texto com uma linha por item, sem marcadores duplicados", () => {
  const t = playbookEmTexto([
    { titulo: "Cliente ideal", texto: "- Clínicas\n• Restaurantes\n\nBarbearias" },
    { titulo: "  ", texto: "  " },
    { titulo: "Nunca", texto: "Travessão" },
  ]);
  assert.equal(t, "### Cliente ideal\n- Clínicas\n- Restaurantes\n- Barbearias\n\n### Nunca\n- Travessão");
});

test("seção sem título ganha um nome", () => {
  assert.match(playbookEmTexto([{ titulo: "", texto: "algo" }]), /### Sem título/);
});
