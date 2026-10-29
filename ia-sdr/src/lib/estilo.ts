/**
 * Estilo de escrita da Ana: comunicação clara, de gente, sem cara de IA.
 * Vale para a prospecção (WhatsApp e e-mail) e para as respostas da Ana no WhatsApp.
 */

/** Regras que entram nos prompts. */
export const REGRAS_DE_ESTILO = `## Como escrever (obrigatório)
- Escreva como uma pessoa real escreveria: frases curtas, palavras simples, tom próximo e respeitoso.
- NUNCA use travessão (— ou –). Use vírgula, ponto ou dois-pontos.
- Nada de markdown: sem negrito, sem listas, sem tópicos, sem títulos.
- Sem emojis. No máximo um ponto de exclamação na mensagem inteira.
- Não use frases prontas de e-mail corporativo, como "Espero que esteja bem", "Espero que este e-mail te encontre bem", "Venho por meio desta", "Fico à disposição", "Não hesite em", "Qualquer dúvida, estou à disposição".
- Não use palavras de marketing genérico: alavancar, potencializar, impulsionar, otimizar, solução, soluções, jornada, transformar, estratégico, incrível, excelente oportunidade, sinergia, robusto.
- Não comece com elogio exagerado nem com "Olá!". Não repita a mesma abertura em todas as mensagens.
- Não invente dados. Use só o que está no diagnóstico.`;

const PROIBIDAS = [
  "espero que esteja bem",
  "espero que este e-mail",
  "espero que este email",
  "venho por meio desta",
  "fico à disposição",
  "fico a disposição",
  "não hesite",
  "alavancar",
  "potencializar",
  "impulsionar",
  "sinergia",
  "jornada",
  "excelente oportunidade",
];

/** Limpa o que denuncia texto de IA: travessões, markdown, excesso de exclamação. */
export function humanizar(texto: string): string {
  let t = (texto ?? "").replace(/\r/g, "").trim();
  t = t.replace(/^["“”']+|["“”']+$/g, "");
  // Travessão e meia-risca viram vírgula (ou somem no começo da linha)
  t = t.replace(/^[ \t]*[—–][ \t]*/gm, "");
  t = t.replace(/[ \t]*[—–][ \t]*/g, ", ");
  t = t.replace(/,\s*([,.!?:;])/g, "$1");
  // Markdown
  t = t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
  t = t.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  t = t.replace(/^[ \t]*[-•*][ \t]+/gm, "");
  // Exclamação em excesso
  t = t.replace(/!{2,}/g, "!");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  return t.trim();
}

/** Lista o que ainda soa como IA, para pedir uma nova versão. */
export function problemasDeEstilo(texto: string): string[] {
  const low = (texto ?? "").toLowerCase();
  const out = PROIBIDAS.filter((p) => low.includes(p)).map((p) => `usa "${p}"`);
  if (/[—–]/.test(texto)) out.push("tem travessão");
  if ((texto.match(/!/g) || []).length > 1) out.push("mais de um ponto de exclamação");
  if (/\p{Extended_Pictographic}/u.test(texto)) out.push("tem emoji");
  return out;
}
