import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contextoPosDemo,
  demoAtiva,
  demoEsgotada,
  ehPedidoDeDemo,
  ehNumeroDoDono,
  ehSaidaDaDemo,
  emTesteDoDono,
  mensagensDaDemo,
  podeRetomarParaDemo,
  TESTE_DONO_MIN,
  promptDemo,
} from "../src/lib/demo.ts";
import { detectarOrigemAnuncio } from "../src/lib/anuncio.ts";
import { SDR_CONFIG } from "../src/config/sdr.ts";
import type { Message } from "../src/lib/db.ts";

test("mensagem pronta do botão do Direct abre a demo", () => {
  assert.ok(ehPedidoDeDemo("Oi! Quero testar a demo ao vivo da recepcionista de IA."));
  assert.ok(ehPedidoDeDemo("quero testar a demo"));
  assert.ok(ehPedidoDeDemo("DEMO"));
  assert.ok(ehPedidoDeDemo("queria ver a demonstração"));
});

test("conversa comum não abre a demo", () => {
  assert.ok(!ehPedidoDeDemo("Oi, quero o diagnóstico gratuito"));
  assert.ok(!ehPedidoDeDemo("quanto custa a limpeza de pele?"));
  assert.ok(!ehPedidoDeDemo("demorou pra responder"));
  assert.ok(!ehPedidoDeDemo(""));
  assert.ok(!ehPedidoDeDemo(null));
});

test("a mensagem pronta da demo não é confundida com a do anúncio de diagnóstico", () => {
  assert.equal(detectarOrigemAnuncio("Oi! Quero testar a demo ao vivo da recepcionista de IA."), null);
});

test("pedido de saída encerra a demo", () => {
  for (const t of ["SAIR", "sair.", "encerrar a demo", "quero sair do teste", "Acabou", "quero falar com a Ana"]) {
    assert.ok(ehSaidaDaDemo(t), t);
  }
  for (const t of ["quero sair às 18h", "vocês atendem sábado?", "fim de semana tem horário?"]) {
    assert.ok(!ehSaidaDaDemo(t), t);
  }
});

const agora = new Date("2026-11-04T22:00:00Z");
const h = (n: number) => new Date(agora.getTime() - n * 3_600_000).toISOString();

test("demo vale por tempo limitado", () => {
  assert.ok(demoAtiva({ inicio: h(1) }, null, agora));
  assert.ok(!demoAtiva({ inicio: h(SDR_CONFIG.demo.duracaoHoras + 0.1) }, null, agora));
  assert.ok(!demoAtiva(null, null, agora));
});

test("demo encerrada não vale, mas uma nova depois do encerramento vale", () => {
  assert.ok(!demoAtiva({ inicio: h(2) }, { em: h(1), motivo: "x" }, agora));
  assert.ok(demoAtiva({ inicio: h(0.5) }, { em: h(1), motivo: "x" }, agora));
});

const msg = (dir: "in" | "out", horasAtras: number, content = "oi"): Message => ({
  id: String(Math.random()),
  direction: dir,
  author: dir === "in" ? "lead" : "ia",
  kind: "text",
  content,
  created_at: h(horasAtras),
});

test("só as mensagens da demo vão para a recepcionista", () => {
  const ini = { inicio: h(1) };
  const hist = [msg("in", 30, "conversa antiga"), msg("out", 29.9), msg("in", 1, "quero testar a demo"), msg("out", 0.9)];
  const d = mensagensDaDemo(hist, ini);
  assert.equal(d.length, 2);
  assert.equal(d[0].content, "quero testar a demo");
});

test("limite de mensagens encerra a demo", () => {
  const ini = { inicio: h(1) };
  const muitas = Array.from({ length: SDR_CONFIG.demo.maxMensagens + 1 }, () => msg("in", 0.5));
  assert.ok(demoEsgotada(muitas, ini));
  assert.ok(!demoEsgotada(muitas.slice(1), ini));
});

test("prompt da recepcionista tem a clínica de exemplo, a abertura e as regras de estilo", () => {
  const p = promptDemo(agora, { inicio: h(0.1) }, 1);
  assert.match(p, new RegExp(SDR_CONFIG.demo.clinicaExemplo.nome));
  assert.match(p, /SAIR/);
  assert.match(p, /encerrar_demo/);
  assert.match(p, /travessão/);
  // o único travessão permitido é o da própria regra que proíbe travessão
  assert.doesNotMatch(p.replace("(— ou –)", ""), /[—–]/);
});

test("perto do limite, a recepcionista é avisada para concluir", () => {
  assert.doesNotMatch(promptDemo(agora, { inicio: h(0.1) }, 1), /chegando ao limite/);
  assert.match(promptDemo(agora, { inicio: h(0.1) }, SDR_CONFIG.demo.maxMensagens - 1), /chegando ao limite/);
});

test("depois da demo a Ana faz a virada uma vez e segue para o diagnóstico", () => {
  assert.match(contextoPosDemo(true), /faça a virada/);
  assert.doesNotMatch(contextoPosDemo(false), /faça a virada/);
  assert.match(contextoPosDemo(false), /diagnóstico gratuito/);
  assert.doesNotMatch(contextoPosDemo(true), /[—–]/);
});

test("modo teste reconhece o número do Kelvin com e sem o 9 e ignora os outros", () => {
  const donos = ["5519999990000"];
  assert.ok(ehNumeroDoDono("5519999990000", donos));
  assert.ok(ehNumeroDoDono("551999990000", donos));
  assert.ok(!ehNumeroDoDono("5511988887777", donos));
  assert.ok(!ehNumeroDoDono("5511988887777", ["", ""]));
  assert.ok(!ehNumeroDoDono(null, donos));
});

test("modo teste do Kelvin dura 30 minutos a partir do pedido", () => {
  const min = (n: number) => new Date(agora.getTime() - n * 60_000).toISOString();
  assert.equal(TESTE_DONO_MIN, 30);
  assert.ok(emTesteDoDono({ inicio: min(5) }, agora));
  assert.ok(emTesteDoDono({ inicio: min(29) }, agora));
  assert.ok(!emTesteDoDono({ inicio: min(31) }, agora));
  assert.ok(!emTesteDoDono(null, agora));
});

test("mandar o nome da clínica personaliza a demo e não encerra", () => {
  const p = promptDemo(agora, { inicio: h(0.1) }, 2);
  assert.match(p, /a demo CONTINUA/);
  assert.match(p, /NÃO use `encerrar_demo` por isso/);
  assert.doesNotMatch(p, /falar como dono/);
});

test("pedido da demo reativa a Ana pausada, menos quando a equipe assumiu", () => {
  assert.ok(podeRetomarParaDemo("qualificado", null, agora));
  assert.ok(podeRetomarParaDemo("sem_resposta", null, agora));
  assert.ok(podeRetomarParaDemo("em_qualificacao", h(24 * 8), agora));
  assert.ok(!podeRetomarParaDemo("em_qualificacao", h(24 * 2), agora));
  assert.ok(!podeRetomarParaDemo("humano", null, agora));
  assert.ok(!podeRetomarParaDemo("opt_out", null, agora));
});

test("modo teste do Kelvin está desligado: o número dele é só orientação", () => {
  assert.equal(SDR_CONFIG.demo.testeDoDono, false);
});
