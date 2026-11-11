import { test } from "node:test";
import assert from "node:assert/strict";
import { etapaDoTexto, lerLigacao } from "../src/lib/ligacoes.ts";
import { calcularFases, faseGargalo, lerInsights } from "../src/lib/insights.ts";

test("ligações: entende os nomes de etapa mais comuns", () => {
  assert.equal(etapaDoTexto("Não atendeu"), "contato");
  assert.equal(etapaDoTexto("ATENDIDA"), "atendida");
  assert.equal(etapaDoTexto("Reunião agendada"), "reuniao");
  assert.equal(etapaDoTexto("reuniao realizada"), "reuniao_realizada");
  assert.equal(etapaDoTexto("Venda"), "ganho");
  assert.equal(etapaDoTexto("sem interesse"), "perdido");
  assert.equal(etapaDoTexto("qualquer coisa"), null);
});

test("ligações: lê o contato com nomes em inglês ou português", () => {
  const a = lerLigacao({ id: 77, name: "Clínica Sol", phone: "+55 (19) 99999-1234", status: "answered", attempts: 3, value: "R$ 1.500,00" });
  assert.ok(!("erro" in a));
  if (!("erro" in a)) {
    assert.equal(a.externo_id, "77");
    assert.equal(a.whatsapp, "5519999991234");
    assert.equal(a.etapa, "atendida");
    assert.equal(a.tentativas, 3);
  }
  const b = lerLigacao({ telefone: "19 98888-0000", empresa: "Pet Feliz", atendida: false });
  assert.ok(!("erro" in b) && b.etapa === "contato" && b.externo_id === "tel:19988880000" && b.tentativas === 1);
  assert.ok("erro" in lerLigacao({ empresa: "Sem telefone" }));
});

test("insights: mede as 4 fases e acha o gargalo pela distância da meta", () => {
  const f = calcularFases([
    { contatado: true, respondeu: true, msgsDoLead: 5, etapa: "qualificacao" },
    { contatado: true, respondeu: true, msgsDoLead: 1, etapa: "respondeu" },
    { contatado: true, respondeu: false, msgsDoLead: 0, etapa: "contatado" },
    { contatado: true, respondeu: true, msgsDoLead: 4, etapa: "reuniao" },
    { contatado: false, respondeu: true, msgsDoLead: 2, etapa: null },
  ]);
  assert.equal(f.abordagem.valor, 75);
  assert.equal(f.conexao.base, 4);
  assert.equal(f.qualificacao.valor, 50);
  assert.equal(f.agendamento.valor, 50);
  assert.equal(faseGargalo(f, { abordagem: 35, conexao: 70, qualificacao: 45, agendamento: 80 }), "conexao") // agendamento tem base pequena (2) e fica de fora;
});

test("insights: aceita só o formato certo, tira travessão e deixa um gargalo só", () => {
  const r = lerInsights(
    JSON.stringify({
      insights: [
        { fase: "qualificacao", gravidade: "gargalo", titulo: "Pergunta cedo — demais", causa: "x", incluir: ["a"], trecho: [{ de: "lead", texto: "oi" }, { de: "bot", texto: "?" }] },
        { fase: "abordagem", gravidade: "gargalo", titulo: "t", causa: "c", incluir: ["b"] },
        { fase: "outra", titulo: "t", causa: "c", incluir: ["b"] },
        { fase: "conexao", titulo: "sem correção", causa: "c", incluir: [] },
      ],
    }),
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].titulo, "Pergunta cedo, demais");
  assert.equal(r[0].agente, "marina");
  assert.equal(r[0].trecho.length, 1);
  assert.equal(r[1].agente, "gabi");
  assert.equal(r[1].gravidade, "atencao");
  assert.deepEqual(lerInsights("não é json"), []);
});
