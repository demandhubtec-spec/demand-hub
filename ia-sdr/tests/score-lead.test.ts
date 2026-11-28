import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularScore, ehCelular, faixaDoScore, scoreEmTexto, seguidoresDaObservacao, semSiteProprio } from "../src/lib/score-lead.ts";

const agora = new Date("2026-11-28T15:00:00Z");

test("score: academia forte vira A, com dor e motivos", () => {
  const s = calcularScore({
    nicho: "Academia", empresa: "CrossFit Centro", avaliacoes: 320, nota: 4.8, fotos: 60, responde_avaliacoes: 0.1,
    posicao_busca: 14, site: "https://instagram.com/crossfitcentro", instagram: "https://instagram.com/crossfitcentro",
    whatsapp: "5511987654321", socios: [{ nome: "João" }], cnpj_email: "a@b.com", porte: "EPP", cnpj_situacao: "ATIVA",
    ig_perfil: { seguidores: 4200, ultimo_post: "2026-11-25T10:00:00Z", link: "https://wa.me/5511987654321" },
  }, agora);
  assert.equal(s.faixa, "A", JSON.stringify(s));
  assert.ok(s.score >= 70);
  assert.ok(s.dor && /site|Google/.test(s.dor));
});

test("score: lead sem dados e telefone fixo fica C", () => {
  const s = calcularScore({ nicho: "Clínica médica", empresa: "Clínica X", whatsapp: "551133334444", site: "https://clinicax.com.br", nota: 3.5, avaliacoes: 4 }, agora);
  assert.equal(s.faixa, "C", JSON.stringify(s));
});

test("score: restaurante que vende pelo iFood tem essa dor", () => {
  const s = calcularScore({ nicho: "Restaurantes e alimentação", empresa: "Burger Y", avaliacoes: 800, nota: 4.6, site: "https://www.ifood.com.br/delivery/x", whatsapp: "5519991112222", ig_perfil: { seguidores: 2500, ultimo_post: "2026-11-20T00:00:00Z", link: "https://ifood.com.br/x" } }, agora);
  assert.ok(s.blocos.dor >= 13, JSON.stringify(s));
  assert.ok(["A", "B"].includes(s.faixa));
});

test("ajudantes do score", () => {
  assert.equal(seguidoresDaObservacao("1,3 mil seguidores."), 1300);
  assert.equal(seguidoresDaObservacao("850 seguidores"), 850);
  assert.equal(ehCelular("5519982153958"), true);
  assert.equal(ehCelular("551938755779"), false);
  assert.equal(semSiteProprio("https://linktr.ee/x"), true);
  assert.equal(semSiteProprio("https://empresa.com.br"), false);
  assert.equal(faixaDoScore(70), "A");
  assert.equal(faixaDoScore(55), "B");
  assert.equal(faixaDoScore(49), "C");
  assert.match(scoreEmTexto({ score: 78, score_faixa: "A", score_dor: "não tem site próprio" }), /A \(78\/100\).*NÃO afirme.*não tem site próprio/);
  assert.equal(scoreEmTexto(null), "");
});
