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
