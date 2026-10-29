import { test } from "node:test";
import assert from "node:assert/strict";
import { render, spin, limpaEmpresa } from "../src/lib/outreach-render.ts";
import { ASSINATURA, buildMime, comRodape, dentroDaJanela, spNow } from "../src/lib/outreach-email.ts";

const lead = { empresa: "Clínica Sorriso - Odonto Valinhos", decisor: "ana paula souza", cidade: "Valinhos", nicho: "Odontologia" };
const noon = new Date("2026-10-28T15:00:00Z"); // 12h em SP → "Boa tarde"

test("variáveis do template (igual ao motor)", () => {
  const out = render("{{saudacao}}{{, primeiro_nome}}! Vi a {{empresa}} em {{cidade}}. Ajudo {{nicho_plural}}.", lead, () => 0, noon);
  assert.equal(out, "Boa tarde, Ana! Vi a Clínica Sorriso em Valinhos. Ajudo clínicas odontológicas.");
});

test("sem decisor, a vírgula some; nicho desconhecido vira 'empresas'", () => {
  assert.equal(render("Oi{{, primeiro_nome}}, {{nicho_plural}}", { ...lead, decisor: null, nicho: "Padaria" }), "Oi, empresas");
});

test("spintax sorteia só entre as opções", () => {
  for (let i = 0; i < 30; i++) assert.ok(["oi", "olá"].includes(spin("{oi|olá}")));
  assert.equal(limpaEmpresa("Padaria Pão Bom | Centro"), "Padaria Pão Bom");
});

test("janela de envio em horário de São Paulo", () => {
  const cfg = { send_days: [1, 2, 3, 4, 5], send_start_hour: 9, send_end_hour: 17 };
  assert.equal(dentroDaJanela(cfg, new Date("2026-10-28T12:00:00Z")), true); // qua 09h SP
  assert.equal(dentroDaJanela(cfg, new Date("2026-10-28T11:59:00Z")), false); // qua 08h59 SP
  assert.equal(dentroDaJanela(cfg, new Date("2026-10-28T20:59:00Z")), true); // qua 17h59 SP
  assert.equal(dentroDaJanela(cfg, new Date("2026-10-28T21:00:00Z")), false); // qua 18h SP
  assert.equal(dentroDaJanela(cfg, new Date("2026-11-01T15:00:00Z")), false); // domingo
  assert.equal(spNow(new Date("2026-10-28T02:00:00Z")).dow, 2); // ainda terça em SP
});

test("e-mail: assina como Ana e põe o rodapé de opt-out só se o texto ainda não tiver", () => {
  assert.equal(comRodape("Olá"), `Olá\n\n${ASSINATURA}\n\nSe não quiser mais receber, é só responder 'sair'.`);
  assert.match(ASSINATURA, /Consultora estratégica de negócios · DemandIA\nWhatsApp: \(19\) 98825-9883\ndemandhub\.com\.br/);
  const jaTem = 'Olá\n\nSe não quiser mais receber, é só responder "SAIR".';
  assert.doesNotMatch(comRodape(jaTem), /responder 'sair'/);
  assert.equal(comRodape("Oi\n\nAna\nDemandIA"), "Oi\n\nAna\nDemandIA\n\nSe não quiser mais receber, é só responder 'sair'.");
});

test("MIME com remetente Ana da DemandIA", () => {
  assert.match(buildMime("a@b.com", "Oi", "Corpo", "eu@gmail.com"), /^From: =\?UTF-8\?B\?.+\?= <eu@gmail.com>/);
  assert.doesNotMatch(buildMime("a@b.com", "Oi", "Corpo"), /^From:/m);
});

test("MIME com assunto em UTF-8", () => {
  const mime = buildMime("a@b.com", "Olá, ação", "Corpo");
  assert.match(mime, /Subject: =\?UTF-8\?B\?.+\?=/);
  assert.match(mime, /charset=UTF-8/);
});

import { contextoProspeccao, ehDisparoDaProspeccao } from "../src/lib/prospeccao.ts";

const prosp = {
  empresa: "Clínica Sorriso", nicho: "Odontologia", cidade: "Valinhos", decisor: "Ana", cargo_decisor: null,
  site: null, instagram: null, observacoes: null,
  wa_message: "Boa tarde, Ana! Aqui é o Kelvin...", wa_sent_at: "2026-10-28T15:00:00Z",
};

test("opção C: reconhece o disparo da prospecção (não é o Kelvin respondendo à mão)", () => {
  assert.equal(ehDisparoDaProspeccao(prosp, "Boa tarde, Ana! Aqui é o Kelvin...", new Date("2026-10-30T10:00:00Z")), true);
  assert.equal(ehDisparoDaProspeccao(prosp, "outra coisa", new Date("2026-10-28T15:01:00Z")), true); // até 3 min
  assert.equal(ehDisparoDaProspeccao(prosp, "Oi, aqui é o Kelvin de novo", new Date("2026-10-29T10:00:00Z")), false);
  assert.equal(ehDisparoDaProspeccao(null, "qualquer"), false);
  // cada balão do disparo também é reconhecido
  const emBaloes = { ...prosp, wa_message: "Boa tarde, Ana! Tudo bem?\n\nAqui é o Kelvin, de Indaiatuba." };
  assert.equal(ehDisparoDaProspeccao(emBaloes, "Aqui é o Kelvin, de Indaiatuba.", new Date("2026-10-30T10:00:00Z")), true);
});

test("opção C: a Ana recebe o contexto da abordagem ativa", () => {
  const c = contextoProspeccao(prosp);
  assert.match(c, /PROSPECÇÃO ATIVA/);
  assert.match(c, /Aqui é o Kelvin/);
  assert.match(c, /encaminhar_humano/);
  assert.match(c, /Odontologia/);
  assert.match(c, /encerrar_contato/);
  assert.equal(contextoProspeccao(null), "");
});

import { diagnosticar, limparMensagem, nomeComPalavrasChave } from "../src/lib/diagnostico-perfil.ts";

const base = {
  place_id: "a", empresa: "Mais Odonto Prime | Dentista | Implante Dentário | Indaiatuba - SP", nicho: "Odontologia", cidade: "Indaiatuba",
  decisor: null, avaliacoes: 300, nota: null, site: null, instagram: "x", fotos: null, tem_descricao: null, tem_horario: null,
  responde_avaliacoes: null, termo_busca: null, posicao_busca: null, total_busca: null,
};
const concs = [
  { place_id: "b", empresa: "B", avaliacoes: 900, nota: 4.9 },
  { place_id: "c", empresa: "C", avaliacoes: 500, nota: 4.8 },
  { place_id: "d", empresa: "D", avaliacoes: 100, nota: 4.7 },
];

test("diagnóstico: posição entre os concorrentes mapeados (sem dado da busca)", () => {
  const d = diagnosticar(base, concs);
  assert.deepEqual(d.posicao && { t: d.posicao.tipo, p: d.posicao.posicao, n: d.posicao.total }, { t: "avaliacoes", p: 3, n: 4 });
  assert.ok(d.pontos_fortes.some((x) => x.includes("3º em avaliações entre as 4 clínicas odontológicas")));
  assert.ok(d.oportunidades.some((x) => x.includes("não tem site")));
  assert.ok(d.oportunidades.some((x) => x.includes("palavras-chave")));
});

test("diagnóstico: posição real da busca tem prioridade e nada é inventado", () => {
  const d = diagnosticar({ ...base, site: "s", posicao_busca: 7, total_busca: 20, termo_busca: "dentista Indaiatuba" }, concs);
  assert.equal(d.posicao?.tipo, "busca");
  assert.ok(d.oportunidades[0].includes('7º no Google Maps para "dentista Indaiatuba"'));
  assert.ok(!d.oportunidades.some((x) => x.includes("nota")));
});

test("nome com palavras-chave e limpeza da mensagem", () => {
  assert.equal(nomeComPalavrasChave("BBZ Advocacia"), false);
  assert.equal(nomeComPalavrasChave(base.empresa), true);
  assert.equal(limparMensagem('"Oi, Ana! — tudo bem?\n\nSegundo **balão**"'), "Oi, Ana! tudo bem?\n\nSegundo balão");
  assert.equal(limparMensagem("Oi, Diego.\n\nSegundo\ncom quebra\n\nTerceiro", 2), "Oi, Diego.\n\nSegundo com quebra Terceiro");
});

import { humanizar, problemasDeEstilo } from "../src/lib/estilo.ts";
import { CADENCIA, montarSequencia, nomeCurto, problemasDaSequencia } from "../src/lib/diagnostico-perfil.ts";
import { toquesRecebidos } from "../src/lib/prospeccao.ts";

test("humanizar: tira travessão, markdown e exclamação em excesso", () => {
  assert.equal(humanizar("Oi — tudo bem?"), "Oi, tudo bem?");
  assert.equal(humanizar("Uma dica simples para o perfil — responda as avaliações."), "Uma dica simples para o perfil: responda as avaliações.");
  assert.equal(humanizar("O perfil — que é bom — precisa de fotos."), "O perfil, que é bom, precisa de fotos.");
  assert.equal(humanizar("— Começo\nfim –."), "Começo\nfim.");
  assert.equal(humanizar("**Atenção** aqui!!"), "Atenção aqui!");
  assert.equal(humanizar("- item um\n- item dois"), "item um\nitem dois");
  assert.equal(humanizar("Bem-vindo à Clínica Pró-Vida"), "Bem-vindo à Clínica Pró-Vida");
});

test("problemas de estilo: pega frases prontas, travessão e emoji", () => {
  assert.deepEqual(problemasDeEstilo("Oi, tudo bem? Posso te mandar?"), []);
  const p = problemasDeEstilo("Espero que esteja bem — vamos alavancar! Show! 🚀");
  assert.ok(p.some((x) => x.includes("espero que esteja bem")));
  assert.ok(p.some((x) => x.includes("alavancar")));
  assert.ok(p.includes("tem travessão"));
  assert.ok(p.includes("tem emoji"));
  assert.ok(p.includes("mais de um ponto de exclamação"));
});

test("nome curto da ficha", () => {
  assert.equal(nomeCurto("Mais Odonto Prime | Dentista | Implante Dentário | Indaiatuba - SP"), "Mais Odonto Prime");
  assert.equal(nomeCurto("Clínica Consultare - Centro Médico Acessível - Unidade Campinas"), "Clínica Consultare");
  assert.equal(nomeCurto("Oliveira & Carneiro Advogados"), "Oliveira & Carneiro Advogados");
});

test("cadência padrão: 6 toques em 10 dias, alternando WhatsApp e e-mail", () => {
  assert.deepEqual(CADENCIA.map((c) => `${c.dia}${c.periodo[0]}${c.canal[0]}`), ["0mw", "0te", "2mw", "4me", "7mw", "10mw"]);
});

test("montar sequência: junta a resposta da IA com a cadência e limpa o texto", () => {
  const resp = JSON.stringify({
    toques: [
      { texto: "Oi, Diego, tudo bem? Aqui é a Ana, da DemandIA.\n\nVi o perfil — posso te mandar?" },
      { assunto: "Perfil da X no Google", texto: "Diego, mandei mensagem no WhatsApp mais cedo." },
      { texto: "Conseguiu ver?" },
      { assunto: "Uma coisa no perfil", texto: "Texto do segundo e-mail." },
      { texto: "Uma dica: responda as avaliações." },
      { texto: "Não vou insistir mais. Posso te procurar mais para frente?" },
    ],
  });
  const seq = montarSequencia("```json\n" + resp + "\n```");
  assert.equal(seq.length, 6);
  assert.equal(seq[0].texto, "Oi, Diego, tudo bem? Aqui é a Ana, da DemandIA.\n\nVi o perfil, posso te mandar?");
  assert.equal(seq[1].canal, "email");
  assert.equal(seq[1].assunto, "Perfil da X no Google");
  assert.equal(seq[5].dia, 10);
  assert.deepEqual(problemasDaSequencia(seq), []);
  assert.throws(() => montarSequencia('{"toques":[{"texto":"a"}]}'), /1 toques/);
});

test("follow-up da cadência também não pausa a IA e entra no contexto da Ana", () => {
  const p = {
    empresa: "X", nicho: null, cidade: null, decisor: null, cargo_decisor: null, site: null, instagram: null, observacoes: null,
    wa_message: "Oi, tudo bem?", wa_sent_at: "2026-10-28T12:00:00Z", toque_atual: 3, ultimo_toque_em: "2026-10-30T12:30:00Z",
    sequencia: [
      { n: 0, canal: "whatsapp", texto: "Oi, tudo bem?" },
      { n: 1, canal: "email", assunto: "Perfil", texto: "Corpo do e-mail" },
      { n: 2, canal: "whatsapp", texto: "Conseguiu ver a mensagem?" },
      { n: 3, canal: "whatsapp", texto: "Ainda não enviado" },
    ],
  };
  assert.equal(ehDisparoDaProspeccao(p, "Conseguiu ver a mensagem?", new Date("2026-11-05T12:00:00Z")), true);
  assert.equal(ehDisparoDaProspeccao(p, "texto do Kelvin", new Date("2026-10-30T12:31:00Z")), true);
  assert.equal(ehDisparoDaProspeccao(p, "texto do Kelvin", new Date("2026-11-05T12:00:00Z")), false);
  const r = toquesRecebidos(p);
  assert.match(r, /E-mail \(assunto "Perfil"\)/);
  assert.match(r, /Conseguiu ver/);
  assert.doesNotMatch(r, /Ainda não enviado/);
});

import { classificarThread } from "../src/lib/outreach-email.ts";

test("e-mail: reconhece resposta, pedido para sair e e-mail devolvido", () => {
  const nosso = { id: "1", labelIds: ["SENT"], snippet: "Oi Diego" };
  const h = (from: string, subject = "Re: Perfil") => ({ headers: [{ name: "From", value: from }, { name: "Subject", value: subject }] });
  assert.equal(classificarThread([nosso]), null);
  const r = classificarThread([nosso, { id: "2", labelIds: ["INBOX"], snippet: "Pode me ligar amanh&#39;ã", internalDate: "1700000000000", payload: h("Diego <d@x.com>") }]);
  assert.equal(r?.tipo, "resposta");
  assert.equal(r?.texto, "Pode me ligar amanh'ã");
  assert.equal(classificarThread([nosso, { id: "3", snippet: "Por favor, SAIR da lista", payload: h("d@x.com") }])?.tipo, "optout");
  assert.equal(classificarThread([nosso, { id: "4", snippet: "não tenho interesse", payload: h("d@x.com") }], ["não tenho interesse"])?.tipo, "optout");
  assert.equal(classificarThread([nosso, { id: "5", snippet: "Address not found", payload: h("Mail Delivery Subsystem <mailer-daemon@googlemail.com>") }])?.tipo, "bounce");
});

test("MIME com List-Unsubscribe quando tem remetente", () => {
  assert.match(buildMime("a@b.com", "Oi", "Corpo", "eu@gmail.com"), /List-Unsubscribe: <mailto:eu@gmail.com\?subject=sair>/);
});

import { promptRevisaoSequencia, promptSequencia } from "../src/lib/diagnostico-perfil.ts";

test("copy: a Ana escreve com SPIN e um ângulo por toque, e o revisor confere tudo", () => {
  const d = diagnosticar(base, concs);
  const p = promptSequencia(base, d);
  assert.match(p, /SPIN/);
  assert.match(p, /Reciprocidade/);
  assert.match(p, /Ângulo: Despedida/);
  const seq = montarSequencia(JSON.stringify({ toques: [1, 2, 3, 4, 5, 6].map((n) => ({ assunto: `A${n}`, texto: `Texto ${n}` })) }));
  const r = promptRevisaoSequencia(base, d, seq);
  assert.match(r, /Checklist da revisão/);
  assert.match(r, /Mais Odonto Prime/);
  assert.doesNotMatch(r, /Implante Dentário \|/);
});

import { emailHtml } from "../src/lib/outreach-email.ts";

test("e-mail: vai em texto e HTML, com assinatura com foto e sem citar nome da equipe", () => {
  const corpo = comRodape("Oi, tudo bem?\n\nVi o perfil de vocês.");
  const mime = buildMime("a@b.com", "Oi", corpo, "eu@gmail.com");
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /text\/plain/);
  assert.match(mime, /text\/html/);
  const html = emailHtml(corpo);
  assert.match(html, /<img src="https:\/\/portal\.demandhub\.com\.br\/brand\/ana-email\.jpg"/);
  assert.match(html, /Consultora estratégica de negócios/);
  assert.match(html, /wa\.me\/5519988259883/);
  assert.match(html, /font-size:11px[^>]*>Se não quiser mais receber/);
  assert.doesNotMatch(html, /<p[^>]*>Ana<br>DemandIA/);
});

test("estilo: nunca cita o nome do Kelvin para o lead", () => {
  assert.ok(problemasDeEstilo("O Kelvin faz o diagnóstico").some((p) => p.includes("kelvin")));
});

import { handleInstagram, linkPrevia, montarSite, promptDirect, semSiteProprio } from "../src/lib/extras.ts";

test("extras: site de diretório conta como sem site próprio", () => {
  assert.equal(semSiteProprio(null), true);
  assert.equal(semSiteProprio("https://mechameaqui.com.br/shopping-dos-animais"), true);
  assert.equal(semSiteProprio("https://www.instagram.com/x/"), true);
  assert.equal(semSiteProprio("https://bbzadvocacia.com.br/"), false);
  assert.equal(handleInstagram("https://www.instagram.com/bbzadv/"), "bbzadv");
  assert.equal(handleInstagram("@clinica.sorriso"), "clinica.sorriso");
});

test("extras: prévia de site monta com dados reais e sem travessão", () => {
  const raw = JSON.stringify({
    titulo: "Seu sorriso — cuidado de perto",
    subtitulo: "Atendimento próximo em Indaiatuba.",
    cta: "Agendar consulta",
    sobre: "Atendemos com calma.",
    servicos: [{ titulo: "Limpeza", texto: "Rotina." }, { titulo: "Clareamento", texto: "Seguro." }, { titulo: "Implante", texto: "Planejado." }],
    diferenciais: ["Perto do centro"],
    paleta: "verde",
  });
  const s = montarSite(base, raw, "abc12345");
  assert.equal(s.token, "abc12345");
  assert.equal(s.paleta, "verde");
  assert.equal(s.servicos.length, 3);
  assert.doesNotMatch(s.titulo, /[—–]/);
  assert.equal(s.nota, base.nota);
  assert.throws(() => montarSite(base, "{}"));
  assert.match(linkPrevia("abc12345", "https://x.app/"), /^https:\/\/x\.app\/previa\/abc12345$/);
});

test("extras: Direct apresenta a Ana e não cita o Kelvin", () => {
  const p = promptDirect(base, diagnosticar(base, concs));
  assert.match(p, /aqui é a Ana, da DemandIA/);
  assert.doesNotMatch(p, /Kelvin/);
});

test("sequência: toque 1 sem apresentação vira problema", () => {
  const seq = montarSequencia(JSON.stringify({ toques: [1, 2, 3, 4, 5, 6].map((n) => ({ assunto: `A${n}`, texto: `Texto ${n}` })) }));
  assert.ok(problemasDaSequencia(seq).some((p) => p.includes("aqui é a Ana")));
});

import { pareceRespostaAutomatica } from "../src/lib/prospeccao.ts";

test("resposta automática da empresa não conta como resposta", () => {
  assert.equal(pareceRespostaAutomatica("Olá! Seja muito bem-vindo (a) à *AS Odontologia* 😷\nSorrir é o primeiro passo\n*Em que Posso te ajudar?*", 5), true);
  assert.equal(pareceRespostaAutomatica("Bom dia, sou a assistente virtual da *Líbano Imóveis*.\n\nSeu protocolo de atendimento é: *261029461637*.", 9999), true);
  assert.equal(pareceRespostaAutomatica("Escolha uma opção:\n1 - Financeiro\n2 - Agendamento", null), true);
  assert.equal(pareceRespostaAutomatica("Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.", 3600), true);
  // gente de verdade
  assert.equal(pareceRespostaAutomatica("Oi Ana, pode mandar sim", 300), false);
  assert.equal(pareceRespostaAutomatica("Bom dia! Como posso ajudar?", 3600), false); // saudação genérica muito depois do envio: é pessoa
  assert.equal(pareceRespostaAutomatica("Quanto custa?", 20), false);
});
