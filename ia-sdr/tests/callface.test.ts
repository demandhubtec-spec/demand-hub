import { test } from "node:test";
import assert from "node:assert/strict";
import { ehCallface, etapaDoResultado, inicioBrasilia, normalizarLeitura, notaDaLigacao, transcricaoEmTexto } from "../src/lib/callface.ts";

test("reconhece o envio do Callface", () => {
  assert.equal(ehCallface({ call_id: "x", destination_number: "+5511999999999" }), true);
  assert.equal(ehCallface({ telefone: "11999" }), false);
});

test("transcrição vira texto", () => {
  assert.equal(transcricaoEmTexto([{ role: "agent", text: "Oi" }, { speaker: "user", content: "Bom dia" }]), "agent: Oi\nuser: Bom dia");
  assert.equal(transcricaoEmTexto("já é texto"), "já é texto");
  assert.equal(transcricaoEmTexto(null), "");
});

test("normaliza a leitura da IA", () => {
  const l = normalizarLeitura({ resultado: "reuniao_agendada", reuniao_inicio: "2026-11-24T10:00", email: " Joao@Clinica.com.br ", temperatura: "x", resumo: "ok", nome_responsavel: "null" });
  assert.equal(l.resultado, "reuniao_agendada");
  assert.equal(l.reuniao_inicio, "2026-11-24T10:00");
  assert.equal(l.email, "joao@clinica.com.br");
  assert.equal(l.temperatura, "quente");
  assert.equal(l.nome_responsavel, null);
  const ruim = normalizarLeitura({ resultado: "inventado", reuniao_inicio: "terça 10h", email: "sem email" });
  assert.equal(ruim.resultado, "nao_falou_com_responsavel");
  assert.equal(ruim.reuniao_inicio, null);
  assert.equal(ruim.email, null);
});

test("horário de Brasília", () => {
  assert.equal(inicioBrasilia("2026-11-24T10:00").toISOString(), "2026-11-24T13:00:00.000Z");
});

test("etapa do funil pelo resultado", () => {
  const base = normalizarLeitura({ resultado: "reuniao_agendada" });
  assert.equal(etapaDoResultado(base, true), "reuniao");
  assert.equal(etapaDoResultado(base, false), "qualificacao");
  assert.equal(etapaDoResultado(normalizarLeitura({ resultado: "sem_interesse" }), false), "perdido");
  assert.equal(etapaDoResultado(normalizarLeitura({ resultado: "caixa_postal" }), false), "contato");
});

test("nota do card", () => {
  const n = notaDaLigacao(normalizarLeitura({ resultado: "retorno_combinado", temperatura: "morno", resumo: "Falou com a recepção.", retorno: "quinta 14h com o Dr. João" }), null, "https://app.callface.ai/calls/1");
  assert.match(n, /retorno combinado \(morno\)/);
  assert.match(n, /Retorno: quinta 14h/);
  assert.match(n, /calls\/1/);
});

test("WhatsApp de confirmação quando ligou num fixo", () => {
  assert.equal(normalizarLeitura({ whatsapp: "(11) 98765-4321" }).whatsapp, "5511987654321");
  assert.equal(normalizarLeitura({ whatsapp: "não tem" }).whatsapp, null);
});
