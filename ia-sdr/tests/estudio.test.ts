import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aposAprovar,
  formatoDaMidia,
  hojeBR,
  limparTexto,
  momentoBR,
  montarLegenda,
  normalizarPalavra,
  notaReferencia,
  sequenciaDaSemana,
  somarDias,
  vagasDoCalendario,
  horizonteDoPlano,
  fimDoMes,
} from "../src/lib/estudio/regras.ts";
import { argumentosDoVideo, duracaoDaCena } from "../src/lib/estudio/video-args.ts";

const pilares = [
  { nome: "Dor", descricao: "" },
  { nome: "Demo", descricao: "" },
  { nome: "Oferta", descricao: "" },
];

test("data de Brasília vira o dia certo perto da meia-noite", () => {
  assert.equal(hojeBR(new Date("2026-11-05T02:30:00Z")), "2026-11-04");
  assert.equal(hojeBR(new Date("2026-11-05T03:30:00Z")), "2026-11-05");
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
});

test("horário de Brasília vira o instante certo", () => {
  assert.equal(momentoBR("2026-11-05", "19:30").toISOString(), "2026-11-05T22:30:00.000Z");
});

test("a semana segue o mix de formatos e não repete formato em dias seguidos", () => {
  const s = sequenciaDaSemana({ carrossel: 4, reels: 3 });
  assert.equal(s.length, 7);
  assert.equal(s.filter((f) => f === "carrossel").length, 4);
  assert.equal(s.filter((f) => f === "reels").length, 3);
  for (let i = 1; i < s.length; i++) assert.notEqual(s[i], s[i - 1]);
});

test("estático não entra mais no calendário: vira carrossel", () => {
  const s = sequenciaDaSemana({ carrossel: 3, estatico: 2, reels: 2 });
  assert.equal(s.filter((f) => f === "estatico").length, 0);
  assert.equal(s.filter((f) => f === "carrossel").length, 5);
});

test("o calendário só cria vaga nos dias livres, a partir de amanhã", () => {
  const v = vagasDoCalendario({
    hoje: "2026-11-04",
    diasAFrente: 7,
    ocupados: new Set(["2026-11-06"]),
    horarios: ["12:00", "19:30"],
    mix: { carrossel: 3, estatico: 2, reels: 2 },
    pilares,
  });
  assert.equal(v.length, 6);
  assert.equal(v[0].dia, "2026-11-05");
  assert.ok(!v.some((x) => x.dia === "2026-11-06" || x.dia === "2026-11-04"));
  assert.ok(new Set(v.map((x) => x.horario)).size === 2);
});

test("a nota compara engajamento pelo tamanho da conta e premia o recente", () => {
  const agora = new Date("2026-11-04T12:00:00Z");
  const pequena = notaReferencia({ curtidas: 500, comentarios: 50, seguidores: 10_000, publicadoEm: "2026-11-01T00:00:00Z" }, agora);
  const grande = notaReferencia({ curtidas: 500, comentarios: 50, seguidores: 1_000_000, publicadoEm: "2026-11-01T00:00:00Z" }, agora);
  const velha = notaReferencia({ curtidas: 500, comentarios: 50, seguidores: 10_000, publicadoEm: "2026-08-01T00:00:00Z" }, agora);
  assert.ok(pequena > grande);
  assert.ok(pequena > velha);
});

test("formato da mídia da Meta", () => {
  assert.equal(formatoDaMidia({ media_type: "VIDEO", media_product_type: "REELS" }), "reels");
  assert.equal(formatoDaMidia({ media_type: "CAROUSEL_ALBUM" }), "carrossel");
  assert.equal(formatoDaMidia({ media_type: "IMAGE" }), "estatico");
});

test("aprovar leva a copy para a arte e a arte para o agendamento", () => {
  assert.equal(aposAprovar("revisar_copy", "carrossel"), "copy_aprovada");
  assert.equal(aposAprovar("revisar_arte", "carrossel"), "agendado");
  assert.equal(aposAprovar("publicado", "carrossel"), null);
});

test("palavra-chave do gatilho fica limpa e em maiúscula", () => {
  assert.equal(normalizarPalavra("diagnóstico"), "DIAGNOSTICO");
  assert.equal(normalizarPalavra(" demo! "), "DEMO");
  assert.equal(normalizarPalavra("x"), null);
  assert.equal(normalizarPalavra(null), null);
});

test("legenda ganha a chamada da palavra-chave, hashtags e nunca passa de 2.200", () => {
  const l = montarLegenda("Sua recepção fecha às 19h — e o paciente não.", "DEMO", ["#clinica", "estetica"]);
  assert.match(l, /Comenta DEMO/);
  assert.match(l, /#clinica #estetica/);
  assert.doesNotMatch(l, /[—–]/);
  assert.equal(montarLegenda("Comenta DEMO aqui", "DEMO").match(/DEMO/g)?.length, 1);
  assert.ok(montarLegenda("a".repeat(5000), "DEMO").length <= 2200);
});

test("texto da arte sai sem travessão", () => {
  assert.equal(limparTexto("Agenda cheia — sem recepção  extra"), "Agenda cheia, sem recepção extra");
});

test("plano do mês: começa na data escolhida e vai até o fim do mês", () => {
  assert.equal(fimDoMes("2026-11-05"), "2026-11-30");
  assert.equal(fimDoMes("2027-02-10"), "2027-02-28");
  assert.deepEqual(horizonteDoPlano("2026-11-05", "2026-11-09"), { de: "2026-11-09", ate: "2026-11-30" });
  assert.deepEqual(horizonteDoPlano("2026-11-12", "2026-11-09"), { de: "2026-11-13", ate: "2026-11-30" });
});

test("plano do mês: a partir do dia 24 já planeja o mês seguinte", () => {
  assert.deepEqual(horizonteDoPlano("2026-11-24", "2026-11-09"), { de: "2026-11-25", ate: "2026-12-31" });
  assert.deepEqual(horizonteDoPlano("2026-12-28", null), { de: "2026-12-29", ate: "2027-01-31" });
});

test("vagas do mês: um post por dia entre de e ate, sem os dias ocupados", () => {
  const v = vagasDoCalendario({
    hoje: "2026-11-05",
    diasAFrente: 14,
    de: "2026-11-09",
    ate: "2026-11-30",
    ocupados: new Set(["2026-11-10"]),
    horarios: ["12:00", "19:30"],
    mix: { carrossel: 4, estatico: 2, reels: 1 },
    pilares,
  });
  assert.equal(v.length, 21);
  assert.equal(v[0].dia, "2026-11-09");
  assert.equal(v[v.length - 1].dia, "2026-11-30");
  assert.ok(!v.some((x) => x.dia === "2026-11-10"));
});

test("reels: duração de cada cena sai do roteiro, entre 2 e 5 segundos", () => {
  assert.equal(duracaoDaCena("0-3s"), 3);
  assert.equal(duracaoDaCena("3-10s"), 5);
  assert.equal(duracaoDaCena("10-11s"), 2);
  assert.equal(duracaoDaCena(undefined), 3);
});

test("reels: comando do vídeo encadeia as cenas com transição e áudio mudo", () => {
  const a = argumentosDoVideo(["a.png", "b.png", "c.png"], [3, 4, 3], "out.mp4");
  const filtro = a[a.indexOf("-filter_complex") + 1];
  assert.equal((filtro.match(/xfade/g) ?? []).length, 2);
  assert.ok(filtro.includes("offset=2.60") && filtro.includes("offset=6.20"));
  assert.ok(a.includes("anullsrc=channel_layout=stereo:sample_rate=44100"));
  assert.equal(a[a.length - 1], "out.mp4");
});

test("fotos: copy nova usa a cena escrita pela Bia; copy antiga ganha cena tirada do texto", async () => {
  const { cenasDasFotos } = await import("../src/lib/estudio/fotos.ts");
  const nova = cenasDasFotos({ slides: [{ titulo: "Capa", foto: "recepcionista olhando o celular" }, { titulo: "Dois" }, { titulo: "Fim" }], legenda: "" }, "carrossel");
  assert.ok(nova[0]?.startsWith("recepcionista olhando o celular"));
  assert.match(nova[0] ?? "", /rosto deste post: "Capa"/);
  assert.ok(nova[1]?.includes("Dois"));
  const reels = cenasDasFotos({ cenas: [{ tempo: "0-3s", texto_tela: "Seu *WhatsApp* demora" }, { tempo: "3-6s", texto_tela: "B" }], legenda: "", capa_titulo: "", prompt_video: "" }, "reels");
  assert.ok(reels[0]?.includes("Seu WhatsApp demora"));
});

test("foto: o prompt pede foto real, sem texto e no formato certo", async () => {
  const { promptDaFoto } = await import("../src/lib/estudio/fotos.ts");
  const p = promptDaFoto("dona de clínica sorrindo com o celular", "vertical");
  assert.match(p, /dona de clínica sorrindo/);
  assert.match(p, /Sem nenhum texto/);
  assert.match(p, /Enquadramento vertical com o assunto no centro/);
  assert.match(promptDaFoto("dono no balcão", "paisagem"), /horizontal 3:2/);
  assert.match(promptDaFoto("dono no balcão", "retrato"), /Nada cortado/);
});

test("carrossel V5: layout de cada lâmina, foto certa para cada um e pessoa recortada na capa", async () => {
  const { planoDoCarrossel, formatoDaFoto, cenasDasFotos, promptDaFoto } = await import("../src/lib/estudio/fotos.ts");
  const slides = [
    { titulo: "Capa *gigante*", foto: "dona de clínica de blazer" },
    { titulo: "Problema", foto: "recepção lotada" },
    { titulo: "Conversa", conversa: [{ quem: "cliente" as const, texto: "Oi" }, { quem: "ia" as const, texto: "Olá!" }] },
    { titulo: "Lista", itens: ["um", "dois", "três"] },
    { titulo: "Ponto", foto: "dono no balcão" },
    { titulo: "Chamada" },
  ];
  assert.deepEqual(planoDoCarrossel(slides), ["capa", "cena", "chat", "lista", "imersiva", "chamada"]);
  assert.equal(formatoDaFoto("capa"), "recorte");
  assert.equal(formatoDaFoto("cena"), "paisagem");
  assert.equal(formatoDaFoto("imersiva"), "retrato");
  const c = cenasDasFotos({ slides, legenda: "" }, "carrossel");
  assert.match(c[0]!, /dona de clínica de blazer/);
  assert.equal(c[2], null);
  assert.equal(c[3], null);
  assert.match(c[5]!, /dona de clínica de blazer/); // a chamada traz a mesma pessoa da capa
  assert.match(promptDaFoto("dona de clínica", "recorte"), /fundo totalmente transparente/);
});

test("fotos do Kelvin (feitas no ChatGPT dele) têm prioridade; com referência o prompt pede para seguir o estilo", async () => {
  const { fotosManuais, promptDaFoto } = await import("../src/lib/estudio/fotos.ts");
  const m = fotosManuais({ slides: [{ titulo: "A" }, { titulo: "B", foto_url: "https://x/foto.jpg" }], legenda: "" });
  assert.equal(m.get(1), "https://x/foto.jpg");
  assert.equal(m.size, 1);
  assert.match(promptDaFoto("dono no balcão", "retrato", true), /referências de posts que funcionaram/);
  assert.doesNotMatch(promptDaFoto("dono no balcão", "retrato"), /referências/);
});

test("fotos: tenta os modelos de imagem em ordem e pula o que a conta não tem", async () => {
  const { modelosDeImagem, semModelo } = await import("../src/lib/estudio/fotos.ts");
  assert.deepEqual(modelosDeImagem(undefined, null), ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"]);
  assert.deepEqual(modelosDeImagem("gpt-image-1", "gpt-image-2").slice(0, 2), ["gpt-image-2", "gpt-image-1"]);
  assert.equal(semModelo(400, "The model 'gpt-image-1' does not exist."), true);
  assert.equal(semModelo(400, "Invalid size"), false);
  assert.equal(semModelo(429, "rate limit"), false);
});

test("Kairogen: argumentos do generate_image pelo esquema, links e modelos", async () => {
  const { argsDeImagem, linksDeImagem, modelosDeImagem: modelosKg, escolherPadrao } = await import("../src/lib/kairogen.ts");
  const sch = {
    properties: { prompt: { type: "string" }, model: { type: "string" }, aspect_ratio: { type: "string", enum: ["1:1", "3:4", "4:3", "9:16", "16:9"] }, num_images: { type: "number" }, quality: { type: "string", enum: ["standard", "hd"] } },
    required: ["prompt", "model", "quality"],
  };
  assert.deepEqual(argsDeImagem(sch, "foto", "nano-banana-pro", "2:3"), { prompt: "foto", model: "nano-banana-pro", aspect_ratio: "3:4", num_images: 1, quality: "standard" });
  assert.equal(argsDeImagem(sch, "x", null, "3:2").aspect_ratio, "4:3");
  assert.equal(argsDeImagem(sch, "x", null, "9:16").aspect_ratio, "9:16");
  assert.deepEqual(argsDeImagem(undefined, "x", "m", "2:3"), { prompt: "x" });
  assert.deepEqual(linksDeImagem({ content: [{ type: "text", text: '{"status":"done","outputs":["https://cdn.kairogen.ai/out/abc.png"],"docs":"https://kairogen.ai/docs/mcp"}' }] }), ["https://cdn.kairogen.ai/out/abc.png"]);
  const lista = modelosKg({ content: [{ type: "text", text: JSON.stringify({ models: [{ id: "nano-banana-pro", type: "image" }, { id: "veo-3-1", type: "video" }, { id: "topaz", type: "upscale" }, { id: "gpt-image-2", type: "image" }] }) }] });
  assert.deepEqual(lista, ["nano-banana-pro", "gpt-image-2"]);
  assert.equal(escolherPadrao(["flux-2-pro", "gpt-image-2"]), "gpt-image-2");
  assert.equal(escolherPadrao([]), null);
});
