import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateBant } from "../src/lib/bant.ts";
import { reminderTimes } from "../src/lib/schedule.ts";
import { toChat } from "../src/lib/chat.ts";
import { destination, parseWebhook, splitBubbles } from "../src/lib/evolution.ts";
import { fromLocal, toLocal } from "../src/lib/time.ts";

test("BANT completo qualifica", () => {
  const r = evaluateBant({ faturamento_mensal: 50_000, autoridade: "decisor", dores: ["quer mais leads"], prazo: "imediato" });
  assert.equal(r.score, 4);
  assert.ok(r.qualificado);
});

test("faturamento abaixo de 30 mil desqualifica", () => {
  const r = evaluateBant({ faturamento_mensal: 20_000, autoridade: "decisor", dores: ["x"], prazo: "imediato" });
  assert.ok(!r.qualificado);
  assert.ok(r.desqualificado);
});

test("exatamente 30 mil qualifica no budget", () => {
  assert.ok(evaluateBant({ faturamento_mensal: 30_000 }).budget);
});

test("sem decisor na reunião não qualifica e pede para combinar", () => {
  const r = evaluateBant({ faturamento_mensal: 80_000, autoridade: "sem_decisor", dores: ["x"], prazo: "ate_3_meses" });
  assert.ok(!r.qualificado);
  assert.ok(!r.desqualificado);
  assert.ok(r.faltando.some((f) => f.includes("decisor")));
});

test("decisor que vai participar conta como autoridade", () => {
  assert.ok(evaluateBant({ autoridade: "decisor_vai_participar" }).authority);
});

test("prazo de 3 a 6 meses não está no time", () => {
  const r = evaluateBant({ faturamento_mensal: 80_000, autoridade: "decisor", dores: ["x"], prazo: "3_a_6_meses" });
  assert.equal(r.score, 3);
  assert.ok(!r.qualificado);
});

test("faturamento ainda desconhecido não desqualifica", () => {
  const r = evaluateBant({ dores: ["x"] });
  assert.ok(!r.desqualificado);
  assert.ok(r.faltando.includes("faturamento mensal"));
});

test("reunião à noite: confirmação 09:00 do mesmo dia, lembrete 1h antes", () => {
  const start = fromLocal(2026, 10, 22, 19, 10);
  const r = reminderTimes(start, fromLocal(2026, 10, 20, 10, 0));
  const c = toLocal(new Date(r.confirm_at));
  assert.deepEqual([c.d, c.h, c.min], [22, 9, 0]);
  const l = toLocal(new Date(r.reminder_at));
  assert.deepEqual([l.d, l.h, l.min], [22, 18, 10]);
  assert.equal(r.confirm_sent_at, null);
});

test("reunião sábado de manhã: confirmação sexta 17:00", () => {
  const r = reminderTimes(fromLocal(2026, 10, 24, 9, 0), fromLocal(2026, 10, 20, 10, 0));
  const c = toLocal(new Date(r.confirm_at));
  assert.deepEqual([c.dow, c.h], [5, 17]);
});

test("marcou no mesmo dia depois das 09:00: não manda confirmação repetida", () => {
  const r = reminderTimes(fromLocal(2026, 10, 22, 19, 10), fromLocal(2026, 10, 22, 14, 0));
  assert.notEqual(r.confirm_sent_at, null);
  assert.equal(r.reminder_sent_at, null);
});

test("histórico vira mensagens alternadas para o modelo", () => {
  const base = { id: "1", kind: "conversa", created_at: "" };
  const chat = toChat([
    { ...base, direction: "out", author: "ia", content: "Oi! Tudo bem?" },
    { ...base, direction: "in", author: "lead", content: "oi" },
    { ...base, direction: "in", author: "lead", content: "quero mais leads" },
    { ...base, direction: "out", author: "humano", content: "Fala, João!" },
  ]);
  assert.deepEqual(chat.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
  assert.equal(chat[2].content, "oi\nquero mais leads");
  assert.match(chat[3].content as string, /Kelvin respondeu manualmente/);
});

test("webhook da Evolution: texto, áudio, grupo e mensagem própria", () => {
  const msg = (key: object, message: object, messageType = "conversation") => ({
    event: "messages.upsert",
    data: { key, pushName: "João", message, messageType },
  });
  const t = parseWebhook(msg({ remoteJid: "5511988887777@s.whatsapp.net", id: "A1", fromMe: false }, { conversation: " Olá " }));
  assert.deepEqual([t?.phone, t?.text, t?.fromMe], ["5511988887777", "Olá", false]);

  const a = parseWebhook(msg({ remoteJid: "5511988887777@s.whatsapp.net", id: "A2" }, { audioMessage: {} }, "audioMessage"));
  assert.equal(a?.text, null);
  assert.equal(a?.messageType, "audioMessage");

  assert.equal(parseWebhook(msg({ remoteJid: "1203630@g.us", id: "A3" }, { conversation: "oi" })), null);
  assert.equal(parseWebhook({ event: "connection.update", data: {} }), null);

  const mine = parseWebhook({ event: "MESSAGES_UPSERT", data: { key: { remoteJid: "5511988887777@s.whatsapp.net", id: "A4", fromMe: true }, message: { extendedTextMessage: { text: "já te respondo" } } } });
  assert.equal(mine?.fromMe, true);
  assert.equal(mine?.text, "já te respondo");
});

test("resposta da IA vira até 4 balões", () => {
  assert.deepEqual(splitBubbles("Oi, João!\n\nTudo certo?\n\n\n"), ["Oi, João!", "Tudo certo?"]);
  assert.equal(splitBubbles("a\n\nb\n\nc\n\nd\n\ne").length, 4);
});

test("webhook do Evolution GO: texto, áudio, grupo, mensagem própria e LID", () => {
  const go = (info: object, message: object) => ({
    event: "Message",
    instanceName: "demandia",
    instanceId: "x",
    data: { Info: { ID: "3EB0ABC", Chat: "5519988887777@s.whatsapp.net", Sender: "5519988887777@s.whatsapp.net", IsFromMe: false, IsGroup: false, PushName: "Maria", Type: "text", ...info }, Message: message },
  });
  const t = parseWebhook(go({}, { conversation: "Oi, quero saber mais" }));
  assert.deepEqual([t?.id, t?.phone, t?.text, t?.fromMe, t?.pushName, t?.instanceName], ["3EB0ABC", "5519988887777", "Oi, quero saber mais", false, "Maria", "demandia"]);

  const ext = parseWebhook(go({}, { extendedTextMessage: { text: "link https://x.com" }, messageContextInfo: {} }));
  assert.equal(ext?.text, "link https://x.com");

  const audio = parseWebhook(go({ Type: "media" }, { messageContextInfo: {}, audioMessage: { mimetype: "audio/ogg" } }));
  assert.equal(audio?.text, null);
  assert.equal(audio?.messageType, "audioMessage");

  assert.equal(parseWebhook(go({ IsGroup: true, Chat: "1203@g.us" }, { conversation: "oi" })), null);
  assert.equal(parseWebhook(go({ Chat: "status@broadcast" }, { conversation: "oi" })), null);
  assert.equal(parseWebhook({ event: "Receipt", data: {} }), null);

  const mine = parseWebhook(go({ IsFromMe: true }, { conversation: "Fala, Maria! Aqui é o Kelvin" }));
  assert.equal(mine?.fromMe, true);
  assert.equal(mine?.phone, "5519988887777");

  const lid = parseWebhook(go({ Chat: "123456789012345@lid" }, { conversation: "oi" }));
  assert.equal(lid?.jid, "123456789012345@lid");
  assert.equal(destination({ phone: lid!.phone, whatsapp_jid: lid!.jid }), "123456789012345@lid");
  assert.equal(destination({ phone: "5519988887777", whatsapp_jid: "5519988887777@s.whatsapp.net" }), "5519988887777");
});

test("faturamento '50' vira R$ 50.000 e qualifica no budget", async () => {
  const { normalizeFaturamento } = await import("../src/lib/bant.ts");
  assert.equal(normalizeFaturamento(50), 50000);
  assert.equal(normalizeFaturamento(50000), 50000);
  assert.equal(normalizeFaturamento("60 mil"), 60000);
  assert.equal(normalizeFaturamento("R$ 45.000"), 45000);
  assert.equal(normalizeFaturamento(0), null);
  assert.ok(evaluateBant({ faturamento_mensal: normalizeFaturamento(50) }).budget);
  assert.ok(!evaluateBant({ faturamento_mensal: normalizeFaturamento(20) }).budget);
});

test("status do WhatsApp no Evolution GO", async () => {
  const { parseStatus, isHealthy } = await import("../src/lib/whatsapp-health.ts");
  assert.ok(isHealthy(parseStatus({ message: "success", data: { Connected: true, LoggedIn: true, Name: "DemandIA" } })));
  assert.ok(!isHealthy(parseStatus({ message: "success", data: { Connected: false, LoggedIn: false } })));
  assert.ok(!isHealthy(parseStatus({ data: { Connected: true, LoggedIn: false } })));
  assert.ok(!isHealthy(parseStatus({ error: "instance not found" })));
});

test("vigia do WhatsApp: lentidão não é queda e aviso só 1x por dia após reconexão", async () => {
  const { isConfirmedDown, shouldAlert } = await import("../src/lib/whatsapp-health.ts");
  assert.ok(!isConfirmedDown({ connected: false, loggedIn: false, unreachable: true, error: "TimeoutError" }));
  assert.ok(isConfirmedDown({ connected: false, loggedIn: false }));
  assert.ok(!isConfirmedDown({ connected: true, loggedIn: true }));
  const now = new Date("2026-10-27T18:00:00Z");
  assert.ok(!shouldAlert(false, null, now));
  assert.ok(shouldAlert(true, null, now));
  assert.ok(!shouldAlert(true, "2026-10-27T10:00:00Z", now));
  assert.ok(shouldAlert(true, "2026-10-26T17:00:00Z", now));
});
