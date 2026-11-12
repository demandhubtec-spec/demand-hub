import test from "node:test";
import assert from "node:assert/strict";
import { contraste, hexValido, paletaDaMarca, pareceLogo } from "../src/lib/site-marca.ts";
import { MARCA_PDF, limparMensagem, porPdf, problemasDaSequencia, separarEmBaloes, tirarPdf } from "../src/lib/diagnostico-perfil.ts";
import { normalizarWhats, paraProspeccao, placeIdInstagram } from "../src/lib/lista-instagram.ts";
import { montarSite } from "../src/lib/extras.ts";
import { lerPerfil } from "../src/lib/rita.ts";

test("site: paleta sai da cor principal da logo, com contraste no botão", () => {
  const p = paletaDaMarca("#1B75BB", "#F7941D")!;
  assert.equal(p.cor, "#1B75BB");
  assert.equal(p.texto_no_destaque, "#FFFFFF");
  assert.ok(contraste(p.escura, "#FFFFFF") > 7, "tom escuro serve de fundo para texto branco");
  // amarelo claro escurece e o texto do botão fica escuro ou branco legível
  const a = paletaDaMarca("#FFE600")!;
  assert.ok(contraste(a.cor, a.texto_no_destaque) >= 2.6);
  // logo preta e branca: destaque dourado
  assert.equal(paletaDaMarca("#000000", "#FFFFFF")!.cor, "#B8892E");
  assert.equal(paletaDaMarca(null), null);
  assert.equal(hexValido("fff"), "#FFFFFF");
  assert.equal(hexValido("azul"), null);
});

test("site: endereços que não são logo ficam de fora", () => {
  assert.equal(pareceLogo("https://static.canva.com/static/images/fb_cover-1.jpg"), false);
  assert.equal(pareceLogo("data:image/svg+xml,%3Csvg"), false);
  assert.equal(pareceLogo("https://clinica.com.br/logo.png"), true);
});

test("site: modelo v2 traz etapas, dúvidas e 4 serviços", () => {
  const raw = JSON.stringify({
    titulo: "Sorriso cuidado de perto",
    subtitulo: "x",
    cta: "Agendar",
    sobre: "y",
    servicos: [1, 2, 3, 4, 5].map((n) => ({ titulo: `S${n}`, texto: "t" })),
    diferenciais: ["a"],
    etapas: [{ titulo: "Chame", texto: "no WhatsApp" }],
    faq: [{ pergunta: "Atende criança?", resposta: "Sim." }, { pergunta: "", resposta: "sem pergunta" }],
    chamada_final: "Fale com a gente",
    paleta: "azul",
  });
  const s = montarSite({ empresa: "Clínica X", nicho: "Odontologia", cidade: "Indaiatuba" } as never, raw, "tok12345");
  assert.equal(s.versao, 2);
  assert.equal(s.servicos.length, 4);
  assert.equal(s.etapas?.length, 1);
  assert.equal(s.faq?.length, 1);
  assert.equal(s.chamada_final, "Fale com a gente");
});

test("rita: fotos dos últimos posts vão para o site", () => {
  const p = lerPerfil({ username: "x", latestPosts: [{ displayUrl: "https://a/1.jpg" }, { displayUrl: "https://a/2.jpg" }, { displayUrl: null }] });
  assert.deepEqual(p.imagens, ["https://a/1.jpg", "https://a/2.jpg"]);
});

test("pdf: marcador [PDF] fica sozinho antes da pergunta e não conta como balão", () => {
  const t = "Tudo bem? Aqui é a Gabi, da DemandIA.\n\n[PDF]\n\nSeparei o raio-x da clínica.\n\nPosso te mostrar em 30 minutos?";
  const { texto, tinha } = tirarPdf(t);
  assert.equal(tinha, true);
  assert.doesNotMatch(texto, /\[PDF\]/);
  const b = porPdf(texto).split("\n\n");
  assert.equal(b[b.length - 2], MARCA_PDF);
  assert.match(separarEmBaloes(t), /\[PDF\]\n\nPosso te mostrar/);
  assert.match(limparMensagem(t), /\[PDF\]/);
  const problemas = problemasDaSequencia([{ n: 0, dia: 0, canal: "whatsapp", texto: t } as never]);
  assert.ok(!problemas.some((p) => p.includes("3 balões")), problemas.join("; "));
});

test("instagram: lead da lista vira empresa da prospecção, só com WhatsApp", () => {
  assert.equal(normalizarWhats("(19) 99999-1234"), "5519999991234");
  assert.equal(normalizarWhats("123"), null);
  assert.equal(placeIdInstagram("Pancheria1288"), "ig_pancheria1288");
  const base = { id: "1", empresa: "Creme Gelato", perfil: "@cremegelatocn", perfil_url: "https://www.instagram.com/cremegelatocn/", nicho: "Alimentação", cidade: null, email: null, nota: "Quente", fonte: "@assessorialpha", comentario: "Alpha", observacoes: "2,4 mil seguidores", etapa: "na_lista" };
  const l = paraProspeccao({ ...base, whatsapp: "5564992262514" }, "2026-11-12T12:00:00Z")!;
  assert.equal(l.place_id, "ig_cremegelatocn");
  assert.equal(l.origem, "instagram");
  assert.equal(l.leo_status, "aprovado");
  assert.equal(l.instagram, "https://www.instagram.com/cremegelatocn/");
  assert.match(String(l.observacoes), /Lista do Instagram/);
  assert.equal(paraProspeccao({ ...base, whatsapp: null }), null);
});

test("sem logo: identidade criada pelo padrão do nicho", async () => {
  const { marcaCriada, nomeDaMarca, paletaDoNicho, siglaDaMarca } = await import("../src/lib/identidade-nicho.ts");
  assert.deepEqual(nomeDaMarca("Dra. Laura Pazinato I Endocrinologista", "Endocrinologia"), { nome: "Dra. Laura Pazinato", sub: "Endocrinologista", pessoa: true });
  assert.equal(nomeDaMarca("Dra Giovanna Lutti - Endocrinologista em Campinas").sub, "Endocrinologista");
  assert.equal(nomeDaMarca("Clínica EEMA (Dr. Murilo Cerci e Dra. Daniela Albiero)", "Endocrinologia").nome, "Clínica EEMA");
  assert.equal(nomeDaMarca("Haras Villa Real", "Imobiliária").sub, "Negócios imobiliários");
  assert.equal(nomeDaMarca("FM Cardoso Negócios Imobiliários", "Imobiliária").sub, "");
  assert.equal(siglaDaMarca("Dra. Keila Hayashi Nakamura"), "KN");
  assert.equal(siglaDaMarca("Ultra Visão Imóveis"), "UV");
  const m = marcaCriada("Dra. Laura Pazinato I Endocrinologista", "Endocrinologia");
  assert.equal(m.monograma, true);
  assert.equal(m.sigla, "LP");
  assert.equal(marcaCriada("FM Cardoso Negócios Imobiliários", "Imobiliária").simbolo, "casa");
  assert.equal(marcaCriada("AGRO VARIEDADES DO JOSÉ", "Pet shop / Veterinária").simbolo, "pata");
  // Paleta do nicho: endocrinologia não cai no azul genérico, e o botão tem contraste com texto branco
  const p = paletaDoNicho("Endocrinologia", "Dra. Laura Pazinato I Endocrinologista");
  assert.notEqual(p.cor, "#1F5EFF");
  for (const nicho of ["Endocrinologia", "Odontologia", "Imobiliária", "Pet shop / Veterinária", "Estética", "Advocacia", null]) {
    for (const emp of ["A", "Clínica Beta", "Dra. Ana Souza"]) {
      const c = paletaDoNicho(nicho, emp);
      assert.ok(contraste(c.cor, "#FFFFFF") >= 3, `${nicho}/${emp}: ${c.cor}`);
      assert.ok(contraste(c.escura, "#FFFFFF") >= 7, `${nicho}/${emp}: ${c.escura}`);
    }
  }
  // mesma empresa, mesma paleta (estável entre visitas)
  assert.deepEqual(paletaDoNicho("Odontologia", "Sorriso X"), paletaDoNicho("Odontologia", "Sorriso X"));
});
