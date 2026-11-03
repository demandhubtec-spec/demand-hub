// Testes: deno test --no-check --allow-env --allow-net --allow-read --import-map ./import_map.test.json ig-bot_test.ts
Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "teste");
// @ts-ignore: impede o servidor de subir no teste
Deno.serve = () => ({});
const m: any = await import("./index.ts");
function assert(c: unknown, msg = "falhou") { if (!c) throw new Error(msg); }
function eq(a: unknown, b: unknown) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`esperado ${y}, veio ${x}`); }

const G = (o: any) => ({ id: "g1", nome: "Agenda", ativo: true, tipo: "link", palavras: ["agenda"], midias: [], respostas_publicas: ["Te mandei no direct"], mensagem: "Oi, {nome}! Aqui está o checklist.", botao_tipo: "link", botao_texto: "Abrir checklist", botao_url: "https://exemplo.com/c", whatsapp_texto: null, ...o });

Deno.test("palavra inteira, sem acento, sem diferenciar maiúscula", () => {
  assert(m.casaPalavra("Quero a AGENDA!", "agenda"));
  assert(m.casaPalavra("orçamento", "ORCAMENTO"));
  assert(!m.casaPalavra("agendamento", "agenda"));
  assert(!m.casaPalavra("", "agenda"));
});

Deno.test("post específico vence o de qualquer post; inativo não conta", () => {
  const geral = G({ id: "geral" });
  const doPost = G({ id: "post", midias: ["123"] });
  eq(m.escolherGatilho([geral, doPost], "agenda", "123").id, "post");
  eq(m.escolherGatilho([geral, doPost], "agenda", "999").id, "geral");
  eq(m.escolherGatilho([doPost], "agenda", "999"), null);
  eq(m.escolherGatilho([G({ ativo: false })], "agenda", "1"), null);
});

Deno.test("nome no texto, e some com elegância quando não tem nome", () => {
  eq(m.textoComNome("Oi, {nome}! Tudo certo?", "Ana"), "Oi, Ana! Tudo certo?");
  eq(m.textoComNome("Oi, {nome}! Tudo certo?", ""), "Oi! Tudo certo?");
});

Deno.test("botões: WhatsApp da Ana, página com origem, link próprio, sem botão", () => {
  const w = m.urlDoBotao(G({ botao_tipo: "whatsapp", whatsapp_texto: "Oi, quero o diagnóstico gratuito" }));
  assert(w.startsWith("https://wa.me/5519988259883?text=Oi%2C%20quero"), w);
  const d = m.urlDoBotao(G({ botao_tipo: "diagnostico", nome: "Agenda cheia", palavras: ["AGENDA"] }), { adId: null });
  assert(d.includes("utm_medium=organico") && d.includes("utm_campaign=gatilho-agenda-cheia") && d.includes("utm_content=agenda"), d);
  assert(m.urlDoBotao(G({ botao_tipo: "diagnostico" }), { adId: "9" }).includes("utm_medium=pago"));
  eq(m.urlDoBotao(G({})), "https://exemplo.com/c");
  eq(m.urlDoBotao(G({ botao_url: "javascript:alert(1)" })), null);
  eq(m.urlDoBotao(G({ botao_tipo: "nenhum" })), null);
});

function motor(gatilhos: any, extra: any = {}) {
  const chamadas: any[] = [];
  const contados: any[] = [];
  const d = {
    ig: {
      responderComentario: async (id: string, t: string) => chamadas.push(["publica", id, t]),
      respostaPrivada: async (id: string, msg: any) => { if (extra.falhaBotao && msg.link) throw new Error("sem botão"); chamadas.push(["privada", id, msg]); },
      primeiroNome: async () => "Kelvin",
      enviar: async () => {},
    },
    store: { novoEvento: async () => true, carregar: async () => null, salvar: async () => true, log: async () => {} },
    config: { igAccountId: "NOS", mediaIds: ["legado"], mediumSemAd: "pago", testUsernames: [], horasLembrete: 2, fluxo: "link", gatilhos },
    agora: () => new Date("2026-11-03T12:00:00Z"),
    sorteio: () => 0,
    depoisDeSalvar: async () => {},
    contar: async (id: string, ok: boolean) => contados.push([id, ok]),
  };
  return { mo: new m.Motor(d), chamadas, contados };
}
const ev = (texto: string, mediaId = "123") => ({ comentarioId: "c1", texto, deId: "u1", deUsername: "fulano", mediaId, adId: null, criadoEm: "2026-11-03T11:59:00Z" });

Deno.test("gatilho simples: responde no post e manda o Direct com botão", async () => {
  const { mo, chamadas, contados } = motor([G({})]);
  await mo.comentario(ev("quero a agenda"));
  eq(chamadas[0], ["publica", "c1", "Te mandei no direct"]);
  eq(chamadas[1][2], { texto: "Oi, Kelvin! Aqui está o checklist.", link: { titulo: "Abrir checklist", url: "https://exemplo.com/c" } });
  eq(contados, [["g1", true]]);
});

Deno.test("sem botão aceito, manda o link no texto", async () => {
  const { mo, chamadas } = motor([G({})], { falhaBotao: true });
  await mo.comentario(ev("agenda"));
  eq(chamadas[1][2].texto, "Oi, Kelvin! Aqui está o checklist.\n\n👉 https://exemplo.com/c");
});

Deno.test("comentário sem palavra de gatilho é ignorado", async () => {
  const { mo, chamadas } = motor([G({})]);
  await mo.comentario(ev("que post legal"));
  eq(chamadas.length, 0);
});

Deno.test("sem a tabela de gatilhos, segue o DIAGNÓSTICO antigo só no post configurado", async () => {
  const a = motor(null);
  await a.mo.comentario(ev("diagnóstico", "legado"));
  assert(a.chamadas.some((c: any) => c[0] === "privada" && c[2].link.url.includes("demandhub.com.br/diagnostico")));
  const b = motor(null);
  await b.mo.comentario(ev("diagnóstico", "outro"));
  eq(b.chamadas.length, 0);
});

Deno.test("gatilho do tipo diagnóstico usa os textos do portal", async () => {
  const { mo, chamadas, contados } = motor([G({ id: "d1", tipo: "diagnostico", palavras: ["diagnostico"], mensagem: "Oi, {nome}! Seu diagnóstico começa aqui.", botao_tipo: "diagnostico", botao_texto: "Fazer diagnóstico", respostas_publicas: ["Olha o direct"] })]);
  await mo.comentario(ev("DIAGNÓSTICO"));
  eq(chamadas[0][2], "Olha o direct");
  eq(chamadas[1][2].texto, "Oi, Kelvin! Seu diagnóstico começa aqui.");
  assert(chamadas[1][2].link.url.includes("utm_campaign=gatilho-agenda"));
  eq(contados, [["d1", true]]);
});

Deno.test("nossas próprias respostas não disparam", async () => {
  const { mo, chamadas } = motor([G({})]);
  await mo.comentario({ ...ev("agenda"), deId: "NOS" });
  eq(chamadas.length, 0);
});
