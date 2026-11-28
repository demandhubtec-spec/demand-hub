import { test } from "node:test";
import assert from "node:assert/strict";
import { ehCelular, motivoDoRecado, nomeCurto, telefoneComDdi, textoDoRecado } from "../src/lib/recado-ligacao.ts";

test("só celular recebe recado", () => {
  assert.equal(ehCelular("19988506553"), true);
  assert.equal(ehCelular("+55 19 98850-6553"), true);
  assert.equal(ehCelular("5519988506553"), true);
  assert.equal(ehCelular("1938754968"), false); // fixo
  assert.equal(ehCelular("551140280300"), false);
  assert.equal(ehCelular("8007659999"), false);
});

test("telefone com 55", () => {
  assert.equal(telefoneComDdi("19988506553"), "5519988506553");
  assert.equal(telefoneComDdi("+55 19 98850-6553"), "5519988506553");
});

test("motivo do recado", () => {
  assert.equal(motivoDoRecado({ resultado: "caixa_postal" }, 0, false), "nao_atendeu");
  assert.equal(motivoDoRecado({ resultado: "nao_falou_com_responsavel" }, 5, true), "nao_atendeu");
  assert.equal(motivoDoRecado({ resultado: "nao_falou_com_responsavel" }, 12, false), "desligou");
  // falou com a recepção, passou o nome do dono: não é desligar na cara
  assert.equal(motivoDoRecado({ resultado: "nao_falou_com_responsavel", nome_responsavel: "Ivan" }, 20, false), null);
  assert.equal(motivoDoRecado({ resultado: "nao_falou_com_responsavel" }, 90, false), null);
  assert.equal(motivoDoRecado({ resultado: "sem_interesse" }, 10, false), null);
  assert.equal(motivoDoRecado({ resultado: "reuniao_agendada" }, 200, false), null);
});

test("texto do recado da Gabi e da Marina", () => {
  const g = textoDoRecado("nao_atendeu", "gabi", "Clínica Sorriso | Odontologia em Itu");
  assert.match(g, /Aqui é a Gabi, da Demand/);
  assert.match(g, /clientes da Clínica Sorriso\./);
  assert.doesNotMatch(g, /Kelvin|agora há pouco/);
  const m = textoDoRecado("desligou", "marina", null);
  assert.match(m, /Aqui é a Marina/);
  assert.match(m, /ligação da Gabi, da nossa equipe, caiu/);
  assert.match(m, /consultoria gratuita/);
});

test("nome curto", () => {
  assert.equal(nomeCurto("Odonto Carisma - Clínica Odontológica - Dentista"), "Odonto Carisma");
  assert.equal(nomeCurto("Brace di Napoli"), "Brace di Napoli");
});
