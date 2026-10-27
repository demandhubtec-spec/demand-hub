import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlocked } from "../src/lib/bloqueio.ts";
import { parseWebhook } from "../src/lib/evolution.ts";

test("bloqueia os números da lista em qualquer formato", () => {
  assert.equal(isBlocked("5511952134563"), true);
  assert.equal(isBlocked("551152134563"), true); // sem o 9
  assert.equal(isBlocked("5519998844691@s.whatsapp.net"), true);
  assert.equal(isBlocked("27 99202-0434"), true);
  assert.equal(isBlocked("5519994786530"), true);
  assert.equal(isBlocked("5519988506553"), false); // Kelvin
  assert.equal(isBlocked("5511999999999"), false);
});

test("bloqueio extra pela variável IGNORE_PHONES", () => {
  process.env.IGNORE_PHONES = "21 98888-7777, 31 97777-6666";
  assert.equal(isBlocked("5521988887777"), true);
  assert.equal(isBlocked("553177776666"), true);
  delete process.env.IGNORE_PHONES;
  assert.equal(isBlocked("5521988887777"), false);
});

test("grupo, status e canal são ignorados", () => {
  const msg = (Chat: string, extra: object = {}) => ({ event: "Message", data: { Info: { ID: "X1", Chat, IsFromMe: false, ...extra }, Message: { conversation: "oi" } } });
  assert.equal(parseWebhook(msg("120363000000000000@g.us")), null);
  assert.equal(parseWebhook(msg("5511999999999-1612345678@g.us")), null);
  assert.equal(parseWebhook(msg("5511999999999@s.whatsapp.net", { IsGroup: true })), null);
  assert.equal(parseWebhook(msg("status@broadcast")), null);
  assert.equal(parseWebhook(msg("120363111111111111@newsletter")), null);
  const ok = parseWebhook(msg("5511999999999@s.whatsapp.net"));
  assert.equal(ok?.phone, "5511999999999");
});

test("contato com LID: usa o número real que vem junto para bloquear", () => {
  const m = parseWebhook({ event: "Message", data: { Info: { ID: "X2", Chat: "123456789012345@lid", Sender: "123456789012345@lid", SenderAlt: "5519998844691@s.whatsapp.net", IsFromMe: false }, Message: { conversation: "oi" } } });
  assert.ok(m);
  assert.equal(isBlocked(m!.phone, m!.jid, ...m!.altPhones), true);
});
