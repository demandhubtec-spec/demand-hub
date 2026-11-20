import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarTravasDeTexto,
  corrigirSaudacao,
  dizQueEnviouDiagnostico,
  faltaLinkDoModelo,
  linkDoModeloNaFerramenta,
  limparCaracteresEstranhos,
  nomeCurto,
  perguntaSeViu,
  recusou,
  situacaoDaRecusa,
  tirarQuerida,
} from "../src/lib/travas.ts";

// 08:33 e 14:00 de Brasília (UTC-3)
const MANHA = new Date("2026-11-16T11:33:00Z");
const TARDE = new Date("2026-11-16T17:00:00Z");
const NOITE = new Date("2026-11-16T22:00:00Z");

test("1. saudação pela hora certa (Dra. Bárbara às 08:33)", () => {
  assert.equal(corrigirSaudacao("Boa tarde, Dra. Bárbara! Tudo bem?", MANHA), "Bom dia, Dra. Bárbara! Tudo bem?");
  assert.equal(corrigirSaudacao("Oi, boa tarde! Tudo bem? Aqui é a Gabi", MANHA), "Oi, bom dia! Tudo bem? Aqui é a Gabi");
  assert.equal(corrigirSaudacao("Oi, bom dia!", TARDE), "Oi, boa tarde!");
  assert.equal(corrigirSaudacao("Oi, boa tarde!", NOITE), "Oi, boa noite!");
  assert.equal(corrigirSaudacao("Oi, boa tarde!", TARDE), "Oi, boa tarde!");
  // Só a saudação de abertura: "bom dia" no fim do texto fica como está
  const longo = "Oi! Aqui é a Gabi, da DemandIA. Preparei um diagnóstico gratuito pra vocês. Tenha um bom dia";
  assert.equal(corrigirSaudacao(longo, TARDE), longo);
});

test("3. reconhece quando a mensagem diz que mandou o diagnóstico", () => {
  assert.ok(dizQueEnviouDiagnostico("Prontinho, separei aqui! Mostra como a clínica aparece no Google"));
  assert.ok(dizQueEnviouDiagnostico("Te mandei o diagnóstico agorinha 😊"));
  assert.ok(dizQueEnviouDiagnostico("Segue o diagnóstico de vocês"));
  assert.ok(!dizQueEnviouDiagnostico("Prontinho! Reunião marcada para terça, 17/11, às 10h"));
  assert.ok(!dizQueEnviouDiagnostico("Posso te mandar o diagnóstico por aqui?"));
});

test("2. link do modelo de site sempre junto", () => {
  const link = "https://demandia-sdr.vercel.app/previa/abc";
  assert.equal(linkDoModeloNaFerramenta(`PDF enviado. Agora escreva ... inclua este link do modelo de site: ${link} . Termine`), link);
  assert.equal(linkDoModeloNaFerramenta("PDF enviado. Agora escreva o texto (eles têm site)"), null);
  assert.ok(faltaLinkDoModelo("Montei um modelo com a logo e as cores 😊 O que acharam do modelo?", link));
  assert.ok(!faltaLinkDoModelo(`Montei um modelo: ${link}`, link));
  assert.ok(!faltaLinkDoModelo("O que acharam do modelo?", link, [`Olha o modelo: ${link}`]));
  assert.ok(!faltaLinkDoModelo("Conseguiu ver o diagnóstico?", link));
  assert.ok(faltaLinkDoModelo("Prontinho, separei aqui!", link, [], true));
  assert.ok(!faltaLinkDoModelo("O que acharam do modelo?", null));
});

test("4. recusa: um não permite uma pergunta; dois nãos ou silêncio depois do não encerram", () => {
  assert.ok(recusou("Não temos interesse, obrigada"));
  assert.ok(recusou("Boa tarde. No momento não temos interesse"));
  assert.ok(recusou("sem interesse"));
  assert.ok(recusou("Não precisamos, obrigado"));
  assert.ok(recusou("Não, obrigada"));
  assert.ok(recusou("Pode tirar meu número da lista"));
  assert.ok(!recusou("Não quero perder essa oportunidade"));
  assert.ok(!recusou("Pode mandar por aqui que ela visualiza"));
  assert.ok(!recusou("Não vamos conseguir hoje, pode ser amanhã?"));
  assert.ok(!recusou("[resposta automática] Não temos interesse em spam"));

  const umNao = [
    { direction: "out", content: "Oi, bom dia! Tudo bem?" },
    { direction: "in", content: "Não temos interesse" },
  ];
  assert.deepEqual(situacaoDaRecusa(umNao), { ultimaFoiRecusa: true, recusas: 1, semRespostaDepoisDoNao: false });
  const naoEPergunta = [...umNao, { direction: "out", content: "Imagina! Posso só perguntar o que pesa mais?" }];
  assert.equal(situacaoDaRecusa(naoEPergunta).semRespostaDepoisDoNao, true);
  const doisNaos = [...naoEPergunta, { direction: "in", content: "Não precisamos, obrigada" }];
  assert.equal(situacaoDaRecusa(doisNaos).recusas, 2);
  const mudouDeIdeia = [...naoEPergunta, { direction: "in", content: "Na verdade pode mandar sim" }];
  assert.equal(situacaoDaRecusa(mudouDeIdeia).ultimaFoiRecusa, false);
});

test("6. follow-up que pergunta se viram", () => {
  assert.ok(perguntaSeViu("Conseguiu dar uma olhadinha no diagnóstico?"));
  assert.ok(perguntaSeViu("Vocês chegaram a ver o que mandei?"));
  assert.ok(perguntaSeViu("Se quiser, posso reenviar 😊"));
  assert.ok(perguntaSeViu("Queria retomar de onde paramos"));
  assert.ok(!perguntaSeViu("Preparei um diagnóstico gratuito. Posso te mandar por aqui?"));
});

test("7. nome curto da empresa", () => {
  assert.equal(nomeCurto("Dra. Luana Aranha - Geriatria e Clínica Médica em Campinas", "Campinas"), "Dra. Luana Aranha");
  assert.equal(nomeCurto("Dra. Rosiane Guimarães - Medicina da Obesidade | Emagrecimento"), "Dra. Rosiane Guimarães");
  assert.equal(nomeCurto("Dra Larissa Avelino SOUSAS"), "Dra Larissa Avelino");
  assert.equal(nomeCurto("EMI- Dra. Fernanda Carvalho"), "EMI");
  assert.equal(nomeCurto("Baldin Advogados"), "Baldin Advogados");
  assert.equal(nomeCurto("Imobiliária Campo Grande Campinas", "Campinas"), "Imobiliária Campo Grande");
  assert.equal(nomeCurto(""), "");
});

test("9 e detalhes: sem querida e sem letra cirílica", () => {
  assert.equal(tirarQuerida("E com você, querida?"), "E com você?");
  assert.equal(tirarQuerida("Querida, tudo bem?"), "tudo bem?");
  assert.equal(limparCaracteresEstranhos("posso reenviе"), "posso reenvie");
  assert.equal(aplicarTravasDeTexto("Boa tarde, querida! Tudo bem?", MANHA), "Bom dia! Tudo bem?");
});

test("tom: nunca joinha", async () => {
  const { tirarJoinha } = await import("../src/lib/travas.ts");
  assert.equal(tirarJoinha("Combinado! 👍"), "Combinado! 😊");
  assert.equal(tirarJoinha("Combinado 😊 👍"), "Combinado 😊");
  assert.equal(tirarJoinha("Oi 😊"), "Oi 😊");
});

test("Instagram: alimentação e cidade curta", async () => {
  const { palavrasDoNicho, cidadeCurta, veioDoInstagram } = await import("../src/lib/prospeccao.ts").catch(() => ({}) as never);
  if (!palavrasDoNicho) return; // sem @supabase/supabase-js neste ambiente
  assert.equal(palavrasDoNicho("Alimentação").publico, "clientes");
  assert.equal(palavrasDoNicho("Restaurante").plural, "negócios de alimentação");
  assert.equal(cidadeCurta("Brás de Pina, Rio de Janeiro / RJ"), "Rio de Janeiro");
  assert.ok(veioDoInstagram({ place_id: "ig_coxinha" } as never));
});

test("17/11: robô que pede nome, aceite de assistente, nicho pet, reapresentação, recusa", async () => {
  const pr = await import("../src/lib/prospeccao.ts").catch(() => null);
  const { semReapresentacao, recusou } = await import("../src/lib/travas.ts");
  assert.equal(semReapresentacao("Boa tarde! Tudo bem? Aqui é a Gabi, da DemandIA 😊\n\nFico feliz que tenha achado interessante.", true), "Fico feliz que tenha achado interessante.");
  assert.equal(semReapresentacao("Boa tarde\n\nObrigada por avisar.", true), "Obrigada por avisar.");
  assert.equal(semReapresentacao("Boa tarde! 😊\n\nAqui é a Gabi.", false), "Boa tarde! 😊\n\nAqui é a Gabi.");
  assert.ok(recusou("Obrigado estamos satisfeitos com os resultados"));
  assert.ok(recusou("Obrigada pelo contato, mas já temos agência de marketing"));
  assert.ok(!recusou("Sim, pode mandar"));
  if (!pr) return;
  assert.ok(pr.roboPedeNome("Antes de continuarmos, para que eu possa lhe atender melhor, escreva o seu *primeiro nome*:"));
  assert.ok(pr.roboPedeNome("Por favor, como é seu nome? *( Digite só seu nome!)*"));
  assert.ok(pr.roboPedeNome("Como você prefere ser chamado?"));
  assert.ok(!pr.roboPedeNome("Qual o nome do responsável?"));
  assert.ok(!pr.pareceRespostaAutomatica("Bom dia, Gabi. Aqui é a Ana, assistente virtual do Dr. Lucas Tubino. Pode sim — envie o diagnóstico por aqui que eu encaminho para a equipe."));
  assert.equal(pr.opcaoDoMenu("Seu nome é: Marina\nEstá correto ou você deseja corrigir?\n1. Está correto\n2. Corrigir"), "1");
  assert.equal(pr.palavrasDoNicho("Pet shop").plural, "pet shops");
  assert.equal(pr.palavrasDoNicho("Clínica veterinária").plural, "clínicas veterinárias");
});

test("roteiro de restaurante só para alimentação (17/11)", async () => {
  const { ehAlimentacao } = await import("../src/lib/prospeccao.ts");
  const o = (nicho: string | null, empresa: string, observacoes: string | null = null) => ({ nicho, empresa, observacoes });
  assert.equal(ehAlimentacao(o("Restaurantes e alimentação", "Cantina da Nona")), true);
  assert.equal(ehAlimentacao(o(null, "Caipa e Brasa", "[Lista do Instagram] Comentou: \"Cardápio\"")), true);
  assert.equal(ehAlimentacao(o("Clínica médica", "Clínica Check-Up Médico Campinas")), false);
  assert.equal(ehAlimentacao(o("Imobiliária", "Geremias Dias Imóveis")), false);
  assert.equal(ehAlimentacao(o("Odontologia", "Sorriso da Morada", "atende delivery de kit")), false);
  assert.equal(ehAlimentacao(o(null, "Dr. Petrus Teixeira (dermatologia)", "Médico dermatologista")), false);
});

test("semPromessaDeConvite: agenda falhou, não promete convite no e-mail (18/11, Geremias)", async () => {
  const { semPromessaDeConvite } = await import("../src/lib/travas.ts");
  const t = "Perfeito, Geremias 😊\nFicou confirmado para hoje, quarta, 18/11 às 12:30.\nO convite com o link da reunião vai chegar no seu e-mail, e já deixei tudo encaminhado por aqui.";
  const r = semPromessaDeConvite(t);
  assert.ok(!/e-?mail/i.test(r), r);
  assert.ok(r.includes("O link da reunião chega por aqui em seguida."), r);
  assert.ok(r.includes("Ficou confirmado para hoje"), r);
  assert.equal(semPromessaDeConvite("Ficou confirmado para amanhã às 10h."), "Ficou confirmado para amanhã às 10h.");
});

test("aviso de reunião: dia, horário, cliente, telefone e e-mail (18/11, Kelvin)", async () => {
  const { textoReuniao } = await import("../src/lib/aviso-reuniao.ts");
  const t = textoReuniao({
    sdr: "Gabi",
    quando: "quarta, 18/11 às 12:30",
    nome: "Geremias Dias",
    empresa: "Geremias Dias Imóveis | Imobiliária em Indaiatuba - SP",
    phone: "5519991300018",
    emails: ["geremias.deia@gmail.com"],
  });
  assert.match(t, /Reunião agendada pela Gabi/);
  assert.match(t, /Dia e horário: quarta, 18\/11 às 12:30/);
  assert.match(t, /Cliente: Geremias Dias/);
  assert.match(t, /Empresa: Geremias Dias Imóveis$/m);
  assert.match(t, /Telefone: \(19\) 99130-0018/);
  assert.match(t, /E-mail: geremias.deia@gmail.com/);
  assert.match(t, /Link: ainda não criado/);
  assert.ok(!t.includes("—"));
});

test("telefoneBR: fixo e celular", async () => {
  const { telefoneBR } = await import("../src/lib/aviso-reuniao.ts");
  assert.equal(telefoneBR("551156772767"), "(11) 5677-2767");
  assert.equal(telefoneBR("5511977638660"), "(11) 97763-8660");
});

test("cidade para citar: cadastrada, senão região do DDD, senão todo o Brasil (18/11)", async () => {
  const { cidadeParaCitar, regiaoDoTelefone, posicaoDeOutraCidade } = await import("../src/lib/prospeccao.ts");
  assert.equal(cidadeParaCitar({ cidade: "Canoas / RS" }, "5551994178347"), "Canoas");
  assert.equal(cidadeParaCitar({ cidade: null }, "5531984102363"), "Belo Horizonte e região");
  assert.equal(cidadeParaCitar({ cidade: null }, "5511966378046"), "São Paulo e região");
  assert.equal(cidadeParaCitar({ cidade: null }, "123"), "todo o Brasil");
  assert.equal(regiaoDoTelefone("5519991300018"), "Campinas e região");
  assert.equal(posicaoDeOutraCidade({ cidade: "São Carlos", diagnostico: { posicao: { tipo: "busca", termo: "dedetização Indaiatuba SP" } } } as never), true);
  assert.equal(posicaoDeOutraCidade({ cidade: "Indaiatuba", diagnostico: { posicao: { tipo: "busca", termo: "imobiliária Indaiatuba SP" } } } as never), false);
});

test("marca sem logo: nicho certo embaixo do nome (18/11, Beto Hamburgueria e Rayane Doces)", async () => {
  const { marcaCriada } = await import("../src/lib/identidade-nicho.ts");
  const beto = marcaCriada("Beto Hamburgueria & Espetaria", "Restaurante");
  assert.equal(beto.simbolo, "talher");
  assert.ok(!/pet|veterin/i.test(beto.sub), beto.sub);
  const rayane = marcaCriada("Rayane Doces", "Alimentação");
  assert.ok(!/nutri/i.test(rayane.sub), rayane.sub);
  assert.equal(rayane.simbolo, "talher");
  assert.equal(marcaCriada("Caipa e Brasa", "Restaurante").sub, "Gastronomia");
  assert.equal(marcaCriada("Klivex | O Shopping da Limpeza", "Casa de verão").sub, "O Shopping da Limpeza");
  assert.equal(marcaCriada("Limpeza Total", "Casa de verão").sub, "");
  assert.equal(marcaCriada("AGRO VARIEDADES DO JOSÉ", "Pet shop / Veterinária").simbolo, "pata");
});

test("ajustes da auditoria de 18/11", async () => {
  const t = await import("../src/lib/travas.ts");
  const pr = await import("../src/lib/prospeccao.ts");
  // 20 minutinhos sempre
  assert.equal(t.vinteMinutos("um bate-papo de até 30 minutos, sem compromisso"), "um bate-papo de até 20 minutinhos, sem compromisso");
  // não se apresenta de novo
  const r = t.semApresentacaoRepetida("Tudo bem 😊\n\nAqui é a Gabi, da DemandIA. A gente ajuda empresas de Indaiatuba a receber mais clientes pelo Google.\n\nPosso te mandar um diagnóstico?", true);
  assert.ok(!/Aqui é a Gabi/.test(r));
  assert.ok(/Posso te mandar/.test(r));
  // robô: TIM e IA de hotel calam depois do recado; pessoa curta volta a ter resposta
  const h = (d: string, c: string, a = "ia") => ({ direction: d, author: d === "in" ? null : a, content: c, created_at: new Date().toISOString() });
  const tim = [h("in", "[templateMessage]"), h("out", "Boa noite 😊"), h("in", "*Jucelia*, você recebeu uma *oferta exclusiva* no TIM Controle: 43 GB por R$ 30,99")];
  assert.equal(t.deveCalarComRobo(tim), true);
  const hotel = [h("in", "Olá, seja bem vindo. Sou uma assistente virtual do Hotel Viracopos"), h("out", "Oi! Aqui é a Gabi, da DemandIA"), h("in", "Muito obrigada pela compreensão, Gabi! Tenha um excelente dia de trabalho. Se precisar de algo ou quiser se hospedar conosco, conte com a gente! 😊")];
  assert.equal(t.deveCalarComRobo(hotel), true);
  const gente = [...hotel, h("in", "Bom dia, quem fala?")];
  assert.equal(t.deveCalarComRobo(gente), false);
  // nome curto: bairro do endereço não é o nome
  assert.equal(t.nomeCurto("Barão Geraldo -Centro de Oncologia Campinas", "Campinas", "Av. Albino J. B. de Oliveira, 1000 - Barão Geraldo, Campinas - SP, 13084-008"), "Centro de Oncologia");
  // cidade de verdade e apresentação de restaurante
  assert.equal(pr.cidadeReal({ cidade: "Indaiatuba", endereco: "R. Sete de Setembro, 100 - Centro, Americana - SP, 13465-000", place_id: "x", observacoes: null }), "Americana");
  assert.equal(pr.cidadeReal({ cidade: "Indaiatuba", endereco: null, place_id: "ig_bendito", observacoes: null }), "");
  const ap = pr.apresentacaoDoLead({ place_id: "ig_caipa", empresa: "Caipa e Brasa", nicho: "Restaurante", cidade: null, endereco: null, observacoes: null } as never);
  assert.ok(/canal de vendas próprio/.test(ap) && /cardápio digital/.test(ap) && /taxa de aplicativo/.test(ap) && !/ de Indaiatuba/.test(ap));
  const ap2 = pr.apresentacaoDoLead({ place_id: "g1", empresa: "Clínica X", nicho: "Clínica médica", cidade: "Indaiatuba", endereco: "Rua A, 1 - Centro, Salto - SP, 13320-000", observacoes: null } as never);
  assert.ok(ap2.startsWith("A DemandIA coloca um atendente inteligente no WhatsApp de clínicas de Salto:"));
});

test("auditoria 19/11: reação, indicação, robô de pedido, abertura do follow-up, formatação, feriado", async () => {
  const t = await import("../src/lib/travas.ts");
  const sc = await import("../src/lib/schedule.ts");
  assert.equal(t.naoPedeResposta("[reactionMessage]"), true);
  assert.equal(t.naoPedeResposta("ok obrigado"), false);
  assert.deepEqual(t.extrairIndicacao("[contato compartilhado] Cláudia de Sousa +5519991152928"), { nome: "Cláudia de Sousa", telefone: "5519991152928" });
  assert.deepEqual(t.extrairIndicacao("77999710862"), { nome: null, telefone: "5577999710862" });
  assert.equal(t.extrairIndicacao("Tenho uns 20 funcionários"), null);
  assert.equal(t.ehAberturaPadrao("Boa tarde! Tudo bem? Aqui é a Gabi, da DemandIA 😊"), true);
  assert.equal(t.ehAberturaPadrao("Passei para deixar um diagnóstico gratuito que preparei para a Grill House"), false);
  assert.equal(t.limparFormatacao("Vou respeitar o horário de vocês.\n```"), "Vou respeitar o horário de vocês.");
  const h = (d: string, c: string) => ({ direction: d, author: d === "in" ? null : "ia", content: c, created_at: new Date().toISOString() });
  const frangou = [h("in", "Que bom te ver por aqui no Frangou Delivery! Lembrando que só aceitamos pedidos pelo link do cardápio"), h("out", "Hoje vocês vendem mais pelo WhatsApp ou pelo iFood?"), h("in", "Por favor, tente simplificar a sua frase para que eu possa entender melhor.")];
  assert.equal(t.deveCalarComRobo(frangou), true);
  assert.equal(sc.ehFeriado(new Date("2026-11-20T15:00:00Z")), true);
  assert.equal(sc.ehFeriado(new Date("2026-11-23T15:00:00Z")), false);
  const slots = sc.candidateSlots(new Date("2026-11-19T22:00:00Z"));
  assert.ok(slots.length > 0 && !slots.some((s) => sc.ehFeriado(s.start)));
});

test("coleta pela API do Google: lugar vira lead (18/11)", async () => {
  const g = await import("../src/lib/google-places.ts");
  const a = await import("../src/lib/auto.ts");
  const lugar = { id: "ChIJx", displayName: { text: "Clínica Sorriso" }, formattedAddress: "Rua A, 10 - Centro, Salto - SP, 13320-000", addressComponents: [{ longText: "Salto", types: ["administrative_area_level_2", "political"] }], internationalPhoneNumber: "+55 11 99999-1234", websiteUri: "https://x.com.br", rating: 4.8, userRatingCount: 120, businessStatus: "OPERATIONAL", photos: [{}, {}] };
  const [l] = g.leadsDaBusca([lugar, { id: "c", displayName: { text: "Fechada" }, businessStatus: "CLOSED_PERMANENTLY" }], { termo: "clínica odontológica Salto SP", nicho: "Odontologia" });
  assert.equal(l.whatsapp, "5511999991234");
  assert.equal(l.cidade, "Salto");
  assert.equal(l.avaliacoes, 120);
  assert.equal(l.posicao_busca, 1);
  assert.equal(l.total_busca, 1);
  assert.equal(a.nichoNaRotacao("Eventos"), false);
  assert.equal(a.nichoNaRotacao("Restaurantes e alimentação"), true);
  assert.equal(a.nichoNaRotacao("Odontologia"), true);
});
