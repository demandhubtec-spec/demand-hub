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
  const s = sequenciaDaSemana({ carrossel: 3, estatico: 2, reels: 2 });
  assert.equal(s.length, 7);
  assert.equal(s.filter((f) => f === "carrossel").length, 3);
  assert.equal(s.filter((f) => f === "reels").length, 2);
  for (let i = 1; i < s.length; i++) assert.notEqual(s[i], s[i - 1]);
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
