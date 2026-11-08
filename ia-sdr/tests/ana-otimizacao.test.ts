import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirAcaoDemo, naJanelaDaDemo } from "../src/lib/demo-jobs.ts";
import { mensagensDoLeadNaDemo } from "../src/lib/demo.ts";
import { limparNomeDoPush } from "../src/lib/nome.ts";
import { extrairContatos, lerVcard, textoDosContatos } from "../src/lib/evolution.ts";
import { conferirSegmento, corrigirMarca } from "../src/lib/canal.ts";
import { ehCliente, isBlocked } from "../src/lib/bloqueio.ts";
import type { Message } from "../src/lib/db.ts";

const agora = new Date("2026-11-08T15:00:00Z"); // 12h em Brasília
const min = (m: number) => new Date(agora.getTime() - m * 60_000);
const base = { agora, ativa: true, testou: 0, ultimaFoiDoLead: false, jaCutucou: false, jaRetomou: false };

test("demo: cutuca 15 min depois da abertura se não testou, uma vez só", () => {
  assert.equal(decidirAcaoDemo({ ...base, ultimaNossaEm: min(10) }), null);
  assert.equal(decidirAcaoDemo({ ...base, ultimaNossaEm: min(16) }), "cutucar");
  assert.equal(decidirAcaoDemo({ ...base, ultimaNossaEm: min(16), jaCutucou: true }), null);
  assert.equal(decidirAcaoDemo({ ...base, ultimaNossaEm: min(16), testou: 2 }), null);
});

test("demo: retoma 2 horas parado, uma vez só, e nunca por cima de mensagem do lead", () => {
  assert.equal(decidirAcaoDemo({ ...base, ultimaNossaEm: min(121), jaCutucou: true }), "retomar");
  assert.equal(decidirAcaoDemo({ ...base, ativa: false, testou: 3, ultimaNossaEm: min(130) }), "retomar");
  assert.equal(decidirAcaoDemo({ ...base, ultimaNossaEm: min(130), jaRetomou: true, jaCutucou: true }), null);
  assert.equal(decidirAcaoDemo({ ...base, ultimaNossaEm: min(300), ultimaFoiDoLead: true }), null);
});

test("demo: janela das 8h às 21h de Brasília", () => {
  assert.equal(naJanelaDaDemo(new Date("2026-11-08T15:00:00Z")), true); // 12h
  assert.equal(naJanelaDaDemo(new Date("2026-11-08T08:30:00Z")), false); // 5h30
  assert.equal(naJanelaDaDemo(new Date("2026-11-09T00:30:00Z")), false); // 21h30
});

test("demo: o pedido da demo não conta como teste", () => {
  const m = (d: "in" | "out", c: string, t: string) => ({ id: t, lead_id: "x", direction: d, author: d === "in" ? "lead" : "ia", kind: "conversa", content: c, created_at: t }) as unknown as Message;
  const hist = [m("in", "Oi, quero testar a demo ao vivo da recepcionista de IA", "2026-11-08T08:22:00Z"), m("out", "Demo liberada", "2026-11-08T08:22:30Z")];
  const ini = { inicio: "2026-11-08T08:22:05Z" };
  assert.equal(mensagensDoLeadNaDemo(hist, ini), 0);
  assert.equal(mensagensDoLeadNaDemo([...hist, m("in", "Quanto custa o botox?", "2026-11-08T08:25:00Z")], ini), 1);
});

test("nome do WhatsApp: e-mail vai para e-mail, @ de usuário não vira nome", () => {
  assert.deepEqual(limparNomeDoPush("marlucia25ester@gmail.com"), { nome: null, email: "marlucia25ester@gmail.com" });
  assert.deepEqual(limparNomeDoPush("jhonatapirapora"), { nome: null, email: null });
  assert.deepEqual(limparNomeDoPush("antoniolopes040658"), { nome: null, email: null });
  assert.deepEqual(limparNomeDoPush("roseli"), { nome: "roseli", email: null });
  assert.deepEqual(limparNomeDoPush("Dra Maria Beatriz Dias"), { nome: "Dra Maria Beatriz Dias", email: null });
  assert.deepEqual(limparNomeDoPush("🙂"), { nome: null, email: null });
});

test("cartão de contato: guarda nome e número", () => {
  const vcard = "BEGIN:VCARD\nVERSION:3.0\nN:;Fernanda;;;\nFN:Dra. Fernanda\nitem1.TEL;waid=5519999887766:+55 19 99988-7766\nitem1.X-ABLabel:Celular\nEND:VCARD";
  assert.deepEqual(lerVcard(vcard), { nome: "Dra. Fernanda", telefone: "5519999887766" });
  assert.deepEqual(lerVcard("BEGIN:VCARD\nFN:Leandro\nTEL;type=CELL:+55 (19) 3333-4444\nEND:VCARD"), { nome: "Leandro", telefone: "551933334444" });
  const cs = extrairContatos({ contactMessage: { displayName: "Dra. Fernanda", vcard } });
  assert.equal(textoDosContatos(cs), "[contato compartilhado] Dra. Fernanda +5519999887766");
  assert.equal(extrairContatos({ contactsArrayMessage: { contacts: [{ vcard }, { displayName: "Ana", vcard: "FN:Ana\nTEL:11988887777" }] } }).length, 2);
  assert.equal(textoDosContatos([]), null);
});

test("marca: o áudio transcrito errado volta a ser DemandIA, sem mexer em 'demanda'", () => {
  assert.equal(corrigirMarca("A Temendy trabalha com vendas"), "A DemandIA trabalha com vendas");
  assert.equal(corrigirMarca("Aqui é da Demand IA."), "Aqui é da DemandIA.");
  assert.equal(corrigirMarca("Sua demanda resolvida"), "Sua demanda resolvida");
});

test("segmento: texto de clínica não vai para escritório de advocacia", () => {
  const iogm = { empresa: "IOGM Advogados", nicho: "Advocacia" };
  assert.match(conferirSegmento("Temos um plano para atrair mais clientes para a clínica", iogm) ?? "", /não é clínica/);
  assert.equal(conferirSegmento("Temos um plano para o escritório", iogm), null);
  assert.equal(conferirSegmento("Plano para a clínica", { empresa: "Sorriso", nicho: "Odontologia" }), null);
  assert.equal(conferirSegmento("Plano para a clínica", null), null);
});

test("clientes: a Ana não conversa com cliente ativo, mas cliente não é bloqueado", () => {
  assert.equal(ehCliente("5519993629493"), true);
  assert.equal(ehCliente("551993629493"), true);
  assert.equal(isBlocked("5519993629493"), false);
  assert.equal(ehCliente("5519988506553"), false);
});
