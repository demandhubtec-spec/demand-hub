/**
 * Travas no código para as mensagens da Gabi e da Marina (auditoria de 16/11/2026, Kelvin).
 * Não dependem da IA lembrar de uma regra: o sistema confere o texto antes de mandar.
 */
import { toLocal } from "./time.ts";

const sem = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "bom dia" até 11:59, "boa tarde" até 17:59, depois "boa noite" (horário de Brasília). */
export function saudacaoDaHora(now: Date): "bom dia" | "boa tarde" | "boa noite" {
  const h = toLocal(now).h;
  return h < 12 ? "bom dia" : h < 18 ? "boa tarde" : "boa noite";
}

/**
 * 1. Saudação pela hora certa: troca "Bom dia/Boa tarde/Boa noite" do começo da mensagem pela saudação
 * da hora do envio (16/11: "Boa tarde, Dra. Bárbara!" às 08:33; follow-ups das 8h copiavam a conversa anterior).
 * Só mexe na saudação de abertura (primeiros 60 caracteres), mantendo maiúscula/minúscula.
 */
export function corrigirSaudacao(texto: string, now: Date): string {
  const certa = saudacaoDaHora(now);
  const re = /\b(bom dia|boa tarde|boa noite)\b/i;
  const m = re.exec(texto ?? "");
  if (!m || m.index > 60) return texto;
  if (m[1].toLowerCase() === certa) return texto;
  const nova = m[1][0] === m[1][0].toUpperCase() ? certa[0].toUpperCase() + certa.slice(1) : certa;
  return texto.slice(0, m.index) + nova + texto.slice(m.index + m[1].length);
}

/**
 * 3. A mensagem diz que o diagnóstico foi enviado ("Prontinho, separei aqui!", "te mandei o diagnóstico")?
 * (16/11: Dra. Caroline Cardo recebeu "Prontinho, separei aqui!" e o PDF nunca saiu.)
 */
export function dizQueEnviouDiagnostico(texto: string): boolean {
  const t = sem(texto);
  return (
    /\bseparei (aqui|pra voces|para voces)\b|\bsegue (aqui )?(o |a )?(diagnostico|analise|pdf|relatorio)/.test(t) ||
    /\b(te |lhe |acabei de )?(mandei|enviei|encaminhei)\b.{0,30}\b(diagnostico|analise|pdf|relatorio)/.test(t)
  );
}

/** Link do modelo de site que a ferramenta enviar_diagnostico devolveu. */
export function linkDoModeloNaFerramenta(saidaDaFerramenta: string): string | null {
  const m = /link do modelo de site:\s*(\S+)/i.exec(saidaDaFerramenta ?? "");
  return m ? m[1].replace(/[.,;]+$/, "") : null;
}

/**
 * 2. Link do modelo sempre junto: a mensagem fala do modelo de site, o link existe, não está no texto
 * e nunca foi mandado nesta conversa → precisa ir num balão logo depois.
 * (16/11: Clínica Dr. Rafael, Nutrivale e Casa Rosa ouviram "O que acharam do modelo?" sem link.)
 */
export function faltaLinkDoModelo(texto: string, link: string | null, jaMandado: string[] = [], forcar = false): boolean {
  if (!link) return false;
  if ((texto ?? "").includes(link)) return false;
  if (jaMandado.some((m) => (m ?? "").includes(link))) return false;
  return forcar || /\bmodelo\b|\bprevia\b|\brascunho do site\b/.test(sem(texto));
}

/**
 * 4. O lead disse que não tem interesse? ("não temos interesse", "sem interesse", "não precisamos",
 * "pode tirar meu número"). Uma pergunta de volta é permitida; um segundo "não" encerra.
 */
const RECUSA = [
  /\bnao (temos|tenho|ha|teriamos|tenhamos|estamos com|estou com) (nenhum |mais )?interesse/,
  /\bsem interesse\b/,
  /\bnao (estamos|estou) interessad/,
  /\bnao (e|eh) do (nosso|meu) interesse/,
  /\bnao (queremos|precisamos|pretendemos contratar)\b/,
  /\bnao (quero|preciso)( (nao|disso|desse|nada|agora|no momento|contratar)\b|\s*[.!,]|\s*$)/,
  /\bnao,? obrigad[oa]\b/,
  /\b(dispenso|dispensamos)\b/,
  /\b(pode|podem) (tirar|remover|excluir) (meu|nosso|o) (numero|contato)/,
  /\bnao (me )?(mande|mandem|envie|enviem) mais/,
  /\bpar(e|em) de (mandar|enviar)/,
  /\bja (temos|tenho) (quem|alguem|agencia|empresa)\b.*\bnao\b/,
  // 17/11: Haustier "estamos satisfeitos com os resultados", Dra. Laura "já temos agência de marketing"
  /\bestamos (muito )?satisfeit/,
  /\bja (temos|tenho) (uma |a )?(agencia|empresa de marketing|alguem que cuida|quem cuida)/,
  /\bvamos deixar\b/,
];
export function recusou(texto: string | null | undefined): boolean {
  const t = sem(String(texto ?? "")).replace(/^\[resposta automatica\].*$/s, "");
  if (!t.trim()) return false;
  // "não quero perder" / "não precisamos esperar" não é recusa: o verbo precisa terminar a ideia
  if (/\bnao (queremos|quero|precisamos|preciso)\s+(perder|esperar|deixar|que)\b/.test(t)) return false;
  return RECUSA.some((r) => r.test(t));
}

/** Mensagens que vieram da empresa e não são de robô. */
export function inboundsDeGente<T extends { direction: string; content: string }>(msgs: T[]): T[] {
  return msgs.filter((m) => m.direction === "in" && !String(m.content ?? "").startsWith("[resposta automática]"));
}

/**
 * Situação da recusa no histórico: a última mensagem de gente foi um "não"? Quantos "não" vieram?
 * Encerra quando o lead disse não duas vezes, ou disse não e não respondeu a nossa pergunta depois disso.
 */
export function situacaoDaRecusa(msgs: { direction: string; content: string }[]): { ultimaFoiRecusa: boolean; recusas: number; semRespostaDepoisDoNao: boolean } {
  const gente = inboundsDeGente(msgs);
  const recusas = gente.filter((m) => recusou(m.content)).length;
  const ultima = gente[gente.length - 1];
  const ultimaFoiRecusa = !!ultima && recusou(ultima.content);
  // Depois do último "não" de gente só vieram mensagens nossas (ou de robô): a pessoa não respondeu à pergunta
  let semRespostaDepoisDoNao = false;
  if (ultimaFoiRecusa) {
    const idx = msgs.lastIndexOf(ultima);
    semRespostaDepoisDoNao = msgs.slice(idx + 1).some((m) => m.direction === "out");
  }
  return { ultimaFoiRecusa, recusas, semRespostaDepoisDoNao };
}

/**
 * 6. Follow-up que pergunta se viram algo que nunca foi enviado ("conseguiu dar uma olhadinha?",
 * "chegou a ver?", "posso reenviar?"). Só vale como erro quando o diagnóstico não foi enviado.
 */
export function perguntaSeViu(texto: string): boolean {
  const t = sem(texto);
  return /consegui(u|ram|u dar|ram dar)? (dar )?(uma )?(olhad|olhar|ver)|chegou a (ver|olhar|dar uma olhad)|chegaram a (ver|olhar)|deu (pra|para) (ver|olhar)|\b(o )?que acha(ram|u) do diagnostico|reenvi|mandar de novo|enviar de novo|retomar de onde paramos/.test(t);
}

/**
 * 7. Nome curto da empresa: o nome do Google às vezes vem com especialidade, cidade e bairro
 * ("Dra. Luana Aranha - Geriatria e Clínica Médica em Campinas", "Dra Larissa Avelino SOUSAS").
 */
export function nomeCurto(empresa: string | null | undefined, cidade?: string | null, endereco?: string | null): string {
  let n = String(empresa ?? "").trim();
  if (!n) return n;
  const pedacos = n.split(/\s+[-–—|]\s+|\s*\|\s*|\s+-(?=\S)|(?<=\S)[-–—]\s+/).map((x) => x.trim()).filter(Boolean);
  n = pedacos[0] ?? n;
  // 18/11: "Barão Geraldo -Centro de Oncologia Campinas" virava "Barão Geraldo" (é o bairro, está no endereço)
  const end = (endereco ?? "").toLowerCase();
  if (pedacos.length > 1 && end && n.length >= 4 && end.includes(n.toLowerCase())) n = pedacos[1];
  n = n.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const c = (cidade ?? "").trim();
  if (c) n = n.replace(new RegExp(`\\s+(em|de|-)?\\s*${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "").trim();
  // Palavra final toda em maiúscula colada no nome (bairro): "Dra Larissa Avelino SOUSAS"
  const partes = n.split(/\s+/);
  if (partes.length >= 3 && /^[A-ZÀ-Ú]{4,}$/.test(partes[partes.length - 1]) && partes.slice(0, -1).some((p) => /[a-zà-ú]/.test(p))) partes.pop();
  return partes.join(" ").replace(/[,;:]+$/, "").trim() || String(empresa).trim();
}

/** Tira caracteres de outro alfabeto que parecem latinos (16/11: "reenviе" com "е" cirílico). */
export function limparCaracteresEstranhos(texto: string): string {
  const mapa: Record<string, string> = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "А": "A", "Е": "E", "О": "O", "Р": "P", "С": "C", "Х": "X" };
  return (texto ?? "").replace(/[аеорсухіАЕОРСХ]/g, (ch) => mapa[ch] ?? ch);
}

/** "querida"/"querido" para desconhecido soa forçado e erra o gênero (16/11: "E com você, querida?" para o Marcelo). */
export function tirarQuerida(texto: string): string {
  return (texto ?? "")
    .replace(/,\s*querid[oa]\b(?=[\s?!.,]|$)/gi, "")
    .replace(/\bquerid[oa],\s*/gi, "")
    .replace(/[ \t]{2,}/g, " ");
}

/**
 * 17/11 (IPA, Portrait): no meio de uma conversa a SDR abria de novo com "Boa tarde! Tudo bem? Aqui é a Gabi,
 * da DemandIA". Se já está conversando, tira o balão que é só saudação ou apresentação.
 */
export function semReapresentacao(texto: string, jaConversando: boolean): string {
  if (!jaConversando) return texto;
  const baloes = (texto ?? "").split(/\n\s*\n/);
  if (baloes.length < 2) return texto;
  const primeiro = sem(baloes[0]).replace(/[^\p{L}\p{N}\s,!?.]/gu, "").trim();
  const soSaudacao = /^(oi|ola|bom dia|boa tarde|boa noite)\b[\s\S]{0,25}$/.test(primeiro) || /^(oi|ola|bom dia|boa tarde|boa noite)\b.{0,30}aqui e a (gabi|marina),? da demandia\.?$/.test(primeiro);
  return soSaudacao ? baloes.slice(1).join("\n\n") : texto;
}

/** Todas as travas de texto que valem para qualquer mensagem da SDR. */
export function aplicarTravasDeTexto(texto: string, now: Date): string {
  return limparFormatacao(vinteMinutos(tirarJoinha(tirarQuerida(limparCaracteresEstranhos(corrigirSaudacao(texto, now))))));
}

/** 19/11: saiu "```" no fim de uma mensagem da Marina e "Pasei" no lugar de "Passei". Limpa antes de mandar. */
export function limparFormatacao(texto: string): string {
  return (texto ?? "")
    .replace(/`{1,3}/g, "")
    .replace(/\bPasei\b/g, "Passei")
    .replace(/\bpasei\b/g, "passei")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Mensagem que não pede resposta (19/11: a Gabi respondeu a reações de emoji na Life Sorrisos e na GP Clean):
 * reação, aviso de protocolo, mensagem apagada, figurinha.
 */
export function naoPedeResposta(texto: string | null | undefined): boolean {
  return /^\s*\[(reactionMessage|protocolMessage|ephemeralMessage|stickerMessage|messageContextInfo|editedMessage)\]\s*$/i.test(texto ?? "");
}

/** O abre-follow-up obrigatório ("Bom dia! Tudo bem? Aqui é a Gabi, da DemandIA 😊") não conta como repetição. */
export function ehAberturaPadrao(linha: string): boolean {
  return /^\s*(?:oi,?\s*)?(?:bom dia|boa tarde|boa noite)[^.!?\n]{0,20}[!.,]?\s*(?:tudo bem\??\s*)?(?:aqui (?:é|e) a (?:gabi|marina),? da demandia\s*[😊🥰✨]?\s*[.!]?)?\s*$/iu.test(linha ?? "");
}

/**
 * Contato indicado na conversa (19/11: Moleka Fest passou o contato da Cláudia; Cerrado Burger o número da responsável).
 * Lê o cartão de contato ou um número de telefone solto na mensagem.
 */
export function extrairIndicacao(texto: string | null | undefined): { nome: string | null; telefone: string } | null {
  const t = texto ?? "";
  const cartao = t.match(/^\[contato compartilhado\]\s*([^;+\d][^;+]*?)?\s*\+?(\d{10,13})/i);
  if (cartao) return { nome: cartao[1]?.trim() || null, telefone: normalizarFone(cartao[2]) };
  const solto = t.replace(/[\s().-]/g, "").match(/(?:\+?55)?(\d{2}9?\d{8})(?!\d)/);
  if (solto && /^\s*[+\d(][\d\s().+-]{9,}\s*$|contato|n[uú]mero|whats|fala com|chama|liga/i.test(t)) return { nome: null, telefone: normalizarFone(solto[1]) };
  return null;
}

function normalizarFone(d: string): string {
  const s = d.replace(/\D/g, "");
  return s.startsWith("55") && s.length >= 12 ? s : `55${s}`;
}

/** A conversa é sempre de 20 minutinhos (18/11: a Gabi alternava 20 e 30 no mesmo dia). */
export function vinteMinutos(texto: string): string {
  return (texto ?? "").replace(/\b(?:30|trinta)\s+(minutos|minutinhos|min)\b/gi, "20 minutinhos");
}

/**
 * Já se apresentou nesta conversa (nas últimas 48 horas)? Então tira o "Aqui é a Gabi, da DemandIA..." da resposta
 * (18/11: Chico Fogão ouviu a apresentação duas vezes em 3 minutos; SR Elétrica de novo à tarde).
 */
export function semApresentacaoRepetida(texto: string, jaSeApresentou: boolean): string {
  if (!jaSeApresentou) return texto;
  const baloes = (texto ?? "").split(/\n\s*\n/);
  const re = /^\s*(?:(?:oi|ol[aá]|bom dia|boa tarde|boa noite)[^.!?\n]{0,25}[.!?]?\s*)?(?:tudo bem\??\s*)?aqui (?:é|e) a (?:gabi|marina),? da demandia[^.!?\n]*[.!?😊\s]*(?:a gente ajuda[^.!?\n]*[.!?]\s*)?/i;
  const novos = baloes.map((b) => b.replace(re, "").trim()).filter(Boolean);
  return novos.length ? novos.join("\n\n") : texto;
}

const RE_ROBO = /assistente virtual|atendente virtual|sou (?:a|o|uma|um) [^.\n]{0,30}(?:virtual|assistente|rob[oô])|🤖|oferta exclusiva|digite (?:o|a|apenas)|escolha uma (?:das )?op[cç][aã]o|op[cç][aã]o v[aá]lida|protocolo|\[templateMessage\]|\[buttonsMessage\]|\[listMessage\]|tim controle|n[aã]o consigo avaliar propostas|tente simplificar|frases muito longas|n[aã]o sou capaz de compreender|n[aã]o posso responder a isso|estou aqui para (?:te )?ajudar com|minha fun[cç][aã]o [eé]|n[aã]o consigo (?:encaminhar|repassar|fornecer)|s[oó] aceitamos pedidos|link do card[aá]pio|acesse nosso (?:link|card[aá]pio)|fa[cç]a seu pedido|fazer seu pedido|ainda n[aã]o fez seu pedido|exclusivo para tratar|limite de tentativas|atendimento encaminhado|loja est[aá] fechada/i;
const RE_GENTE = /\b(me chamo|meu nome [eé]|aqui (?:é|e) (?:o|a) [A-ZÀ-Ú]|sou (?:o|a) [A-ZÀ-Ú][a-zà-ú]+\b(?! virtual))/;

/**
 * Conversa com robô (18/11: 9 mensagens trocadas com a oferta da TIM; despedidas sem fim com a IA do Hotel Viracopos).
 * Quando um robô ou atendente virtual apareceu e a SDR já respondeu depois disso, ela só volta a falar quando uma
 * PESSOA escrever: mensagem curta sem cara de robô, ou alguém que se apresenta pelo nome.
 */
export function deveCalarComRobo(hist: { direction: string; author?: string | null; content: string | null; created_at: string }[], agora = new Date()): boolean {
  const recentes = hist.filter((m) => agora.getTime() - new Date(m.created_at).getTime() < 24 * 3600e3);
  const iRobo = recentes.findIndex((m) => m.direction === "in" && (RE_ROBO.test(m.content ?? "") || (m.content ?? "").length > 320));
  if (iRobo < 0) return false;
  const ultima = recentes[recentes.length - 1];
  if (!ultima || ultima.direction !== "in") return false;
  const t = (ultima.content ?? "").trim();
  const pareceGente = (t.length <= 80 && !RE_ROBO.test(t) && !/^\[/.test(t)) || RE_GENTE.test(t);
  if (pareceGente) return false;
  const respondeuDepois = recentes.slice(iRobo + 1).some((m) => m.direction === "out" && m.author !== "sistema");
  return respondeuDepois;
}

/** Nunca emoji de joinha (Kelvin, 16/11): soa seco. Sai do texto (e, se era o único emoji, entra um 😊 no lugar). */
export function tirarJoinha(texto: string): string {
  if (!/👍/u.test(texto ?? "")) return texto;
  const sem = texto.replace(/\s?👍[\u{1F3FB}-\u{1F3FF}]?\uFE0F?/gu, "");
  return /\p{Extended_Pictographic}/u.test(sem) ? sem.trim() : `${sem.trim()} 😊`;
}

/**
 * A Google Agenda falhou ao marcar: o convite NÃO saiu. Troca a frase que promete convite/link no
 * e-mail por "o link chega por aqui", que é o que o Kelvin faz à mão.
 */
export function semPromessaDeConvite(texto: string): string {
  const frase = /[^.!?\n]*\b(convite|link)\b[^.!?\n]*\be-?mail\b[^.!?\n]*[.!?]?/gi;
  if (!frase.test(texto)) return texto;
  let trocou = false;
  return texto
    .replace(frase, (m) => {
      if (trocou) return "";
      trocou = true;
      const ini = m.match(/^\s*/)?.[0] ?? "";
      return `${ini}O link da reunião chega por aqui em seguida.`;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
