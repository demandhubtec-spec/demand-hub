import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarHtml, lerPerfil } from "../src/lib/rita.ts";

test("site: confere celular, WhatsApp, formulário, depoimentos e acha a logo", () => {
  const html = `<html><head><title>Clínica Sorriso</title><meta name="viewport" content="width=device-width"><meta property="og:image" content="/img/og.png"></head>
  <body><img class="logo-topo" src="/img/logo.png"><a href="https://wa.me/5519999">Fale conosco</a><h2>O que nossos pacientes dizem</h2><form></form></body></html>`;
  const c = analisarHtml(html, "https://clinicasorriso.com.br");
  assert.equal(c.titulo, "Clínica Sorriso");
  assert.equal(c.celular, true);
  assert.equal(c.whatsapp, true);
  assert.equal(c.formulario, true);
  assert.equal(c.depoimentos, true);
  assert.equal(c.descricao, false);
  assert.equal(c.logo, "https://clinicasorriso.com.br/img/logo.png");
});

test("Instagram: lê o perfil do Apify no nosso formato", () => {
  const p = lerPerfil({ username: "ClinicaX", followersCount: 1200, postsCount: 80, biography: "Agende", externalUrl: "https://x.com.br", isBusinessAccount: true, latestPosts: [{ timestamp: "2026-10-01" }, { timestamp: "2026-11-01" }], profilePicUrlHD: "https://foto" });
  assert.equal(p.usuario, "clinicax");
  assert.equal(p.ultimo_post, "2026-11-01");
  assert.equal(p.comercial, true);
  assert.equal(p.foto, "https://foto");
});
