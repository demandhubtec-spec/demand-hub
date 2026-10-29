/**
 * Mini-diagnóstico do perfil no Google de um lead da prospecção.
 * Tudo aqui é calculado a partir de dados reais (coleta do Google Maps). Nada é inventado:
 * se um sinal não veio na coleta, ele simplesmente não entra no diagnóstico.
 */
import { SDR_CONFIG } from "../config/sdr.ts";
import { REGRAS_DE_ESTILO, humanizar, problemasDeEstilo } from "./estilo.ts";
import { ANGULOS, GUIA_COPY, promptRevisao } from "./copy.ts";

export interface LeadPerfil {
  place_id: string;
  empresa: string;
  nicho: string | null;
  cidade: string | null;
  decisor: string | null;
  avaliacoes: number | null;
  nota: number | null;
  site: string | null;
  instagram: string | null;
  fotos: number | null;
  tem_descricao: boolean | null;
  tem_horario: boolean | null;
  responde_avaliacoes: number | null;
  termo_busca: string | null;
  posicao_busca: number | null;
  total_busca: number | null;
}

export interface Concorrente {
  place_id: string;
  empresa: string;
  avaliacoes: number | null;
  nota: number | null;
}

export interface Diagnostico {
  posicao:
    | { tipo: "busca"; posicao: number; total: number | null; termo: string }
    | { tipo: "avaliacoes"; posicao: number; total: number; nicho: string; cidade: string; lider: { empresa: string; avaliacoes: number } | null }
    | null;
  pontos_fortes: string[];
  oportunidades: string[];
  dados: { avaliacoes: number | null; nota: number | null; site: boolean; instagram: boolean; fotos: number | null };
}

const NICHO_PLURAL: Record<string, string> = {
  "Clínica médica": "clínicas médicas",
  "Advocacia": "escritórios de advocacia",
  "Odontologia": "clínicas odontológicas",
  "Imobiliária": "imobiliárias",
  "Pet shop / Veterinária": "pet shops e clínicas veterinárias",
  "Endocrinologia": "consultórios de endocrinologia",
};

export function nichoPlural(nicho: string | null): string {
  return (nicho && NICHO_PLURAL[nicho]) || "empresas do segmento";
}

/** Nome da ficha recheado de palavras-chave (ex.: "Clínica X | Dentista | Implante | Bairro - SP"). */
export function nomeComPalavrasChave(nome: string): boolean {
  const separadores = (nome.match(/\s[|•–-]\s|\s\|\s?|\|/g) || []).length;
  return separadores >= 2;
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

export function diagnosticar(lead: LeadPerfil, concorrentes: Concorrente[]): Diagnostico {
  const fortes: string[] = [];
  const oport: string[] = [];

  // Posição frente aos concorrentes: a posição real na busca do Google vale mais;
  // sem ela, usamos a posição em avaliações entre os concorrentes que mapeamos.
  let posicao: Diagnostico["posicao"] = null;
  if (lead.posicao_busca && lead.termo_busca) {
    posicao = { tipo: "busca", posicao: lead.posicao_busca, total: lead.total_busca, termo: lead.termo_busca };
    if (lead.posicao_busca <= 3) fortes.push(`aparece em ${lead.posicao_busca}º no Google Maps para "${lead.termo_busca}"`);
    else oport.push(`está em ${lead.posicao_busca}º no Google Maps para "${lead.termo_busca}", fora do top 3 (onde fica a maior parte dos cliques)`);
  } else {
    const grupo = [...concorrentes.filter((c) => c.place_id !== lead.place_id), { place_id: lead.place_id, empresa: lead.empresa, avaliacoes: lead.avaliacoes, nota: lead.nota }]
      .filter((c) => c.avaliacoes !== null)
      .sort((a, b) => (b.avaliacoes ?? 0) - (a.avaliacoes ?? 0));
    const idx = grupo.findIndex((c) => c.place_id === lead.place_id);
    if (idx >= 0 && grupo.length >= 3 && lead.nicho && lead.cidade) {
      const lider = idx === 0 ? null : { empresa: grupo[0].empresa, avaliacoes: grupo[0].avaliacoes ?? 0 };
      posicao = { tipo: "avaliacoes", posicao: idx + 1, total: grupo.length, nicho: lead.nicho, cidade: lead.cidade, lider };
      if (idx === 0) fortes.push(`é a que mais tem avaliações entre as ${grupo.length} ${nichoPlural(lead.nicho)} que mapeamos em ${lead.cidade}`);
      else if (idx <= 2) fortes.push(`está em ${idx + 1}º em avaliações entre as ${grupo.length} ${nichoPlural(lead.nicho)} que mapeamos em ${lead.cidade}`);
      else oport.push(`está em ${idx + 1}º em avaliações entre as ${grupo.length} ${nichoPlural(lead.nicho)} que mapeamos em ${lead.cidade}`);
    }
  }

  // Avaliações e nota
  const meds = mediana(concorrentes.map((c) => c.avaliacoes ?? 0).filter((n) => n > 0));
  if (lead.avaliacoes !== null) {
    if (lead.avaliacoes >= 500) fortes.push(`tem ${fmt(lead.avaliacoes)} avaliações no Google`);
    else if (meds && lead.avaliacoes < meds * 0.6) oport.push(`tem ${fmt(lead.avaliacoes)} avaliações, bem abaixo da média dos concorrentes (${fmt(Math.round(meds))})`);
  }
  if (lead.nota !== null) {
    if (lead.nota >= 4.8) fortes.push(`nota ${String(lead.nota).replace(".", ",")} no Google`);
    else if (lead.nota < 4.5) oport.push(`nota ${String(lead.nota).replace(".", ",")}, que pesa na escolha de quem compara no Google`);
  }

  // Estrutura da ficha
  if (!lead.site) oport.push("o perfil não tem site ligado, o que costuma tirar posição e deixar o cliente sem para onde ir");
  if (lead.fotos !== null && lead.fotos < 20) oport.push(`só ${lead.fotos} fotos na ficha, quando os primeiros colocados costumam ter dezenas`);
  if (lead.tem_descricao === false) oport.push("a ficha está sem descrição");
  if (lead.tem_horario === false) oport.push("a ficha está sem horário de funcionamento");
  if (lead.responde_avaliacoes !== null && lead.responde_avaliacoes < 50) oport.push(`responde só ${Math.round(lead.responde_avaliacoes)}% das avaliações, e o Google valoriza quem responde`);
  if (nomeComPalavrasChave(lead.empresa)) oport.push("o nome da ficha está com várias palavras-chave, prática que o Google pode punir ou suspender");
  if (!lead.instagram) oport.push("não encontramos Instagram ligado ao perfil");

  return {
    posicao,
    pontos_fortes: fortes,
    oportunidades: oport,
    dados: { avaliacoes: lead.avaliacoes, nota: lead.nota, site: !!lead.site, instagram: !!lead.instagram, fotos: lead.fotos },
  };
}

/** Os 6 toques da cadência (D0 = dia da primeira mensagem no WhatsApp). */
export interface PassoCadencia {
  dia: number;
  periodo: "manha" | "tarde";
  canal: "whatsapp" | "email";
  objetivo: string;
}

export const CADENCIA: PassoCadencia[] = [
  {
    dia: 0, periodo: "manha", canal: "whatsapp",
    objetivo:
      "Primeira abordagem no WhatsApp, como uma pessoa simpática e carismática escreveria. A saudação (\"Oi, {nome}, boa tarde! 🙂\") já vai sozinha antes e a Ana espera uns segundos, então NÃO repita \"oi\" nem \"boa tarde\". Exatamente 3 balões separados por uma linha em branco. Balão 1 (curto, uma ou duas frases): \"Tudo bem? Aqui é a Ana, da DemandIA 😊\" e o motivo do contato de forma bem enxuta (ex.: \"A gente ajuda empresas de {cidade} a atrair mais clientes pelo Google, e fiz uma análise rápida da presença digital de vocês.\"). Balão 2 (uma ou duas frases, objetivo): o que a pré-análise mostrou, com números do Google Meu Negócio (posição frente aos concorrentes, avaliações) e, se couber, site ou Instagram: 1 ponto forte e 1 oportunidade. Balão 3: SÓ a pergunta, curta e fácil de responder (ex.: \"Posso te mandar a análise completa por aqui?\"). Sem quebras de linha dentro de um balão. Máximo de 480 caracteres no total.",
  },
  {
    dia: 0, periodo: "tarde", canal: "email",
    objetivo:
      "Primeiro e-mail, no mesmo dia do WhatsApp. Bem enxuto e direto ao ponto: 1 frase de apresentação (\"Sou a Ana, da DemandIA. Te chamei no WhatsApp hoje cedo.\"), depois o achado mais forte do diagnóstico com o número exato e o que ele causa na prática (clientes escolhendo o concorrente no Google), depois a oferta: diagnóstico gratuito de 30 minutos com um dos nossos especialistas, sem compromisso. Termine com UMA chamada para ação clara e fácil, por exemplo: \"Quer que eu reserve um horário? É só responder este e-mail com um sim ou me chamar no WhatsApp {whatsapp}.\" Entre 50 e 100 palavras, parágrafos de no máximo 2 linhas. ASSUNTO: chama atenção pela curiosidade e pela especificidade, com 3 a 7 palavras, com o nome curto da empresa ou um número real do diagnóstico (ex.: \"{empresa} x concorrentes no Google\", \"O que separa a {empresa} do 1º lugar\"). Sem cara de propaganda, sem ponto de exclamação, sem as palavras grátis, promoção ou oferta no assunto. Não assine: a assinatura entra sozinha.",
  },
  {
    dia: 2, periodo: "manha", canal: "whatsapp",
    objetivo:
      "Follow-up curto no WhatsApp, 2 balões: o primeiro com um fato do diagnóstico diferente do toque 1 (ou o efeito prático dele para quem procura {nicho_plural} em {cidade}), em uma frase; o segundo SÓ com uma pergunta simples. No máximo 220 caracteres no total. Sem cobrar resposta. Não comece com \"passando\" e não diga \"só para lembrar\".",
  },
  {
    dia: 4, periodo: "manha", canal: "email",
    objetivo:
      "Segundo e-mail, com outro ângulo. Traga UM ponto concreto do diagnóstico diferente do primeiro e-mail, dito com todas as letras, e explique em 2 frases o custo de deixar como está para quem procura {nicho_plural} em {cidade} no Google. Depois uma mini prévia do que o diagnóstico mostra (o que olhamos e o que a empresa leva de presente: um plano simples do que ajustar primeiro). Feche com UMA chamada para ação clara: responder este e-mail ou chamar no WhatsApp {whatsapp}. ASSUNTO diferente do primeiro, 3 a 7 palavras, curioso e específico. Entre 60 e 110 palavras. Não assine.",
  },
  {
    dia: 7, periodo: "manha", canal: "whatsapp",
    objetivo:
      "Follow-up no WhatsApp com UMA dica prática, específica e gratuita que a pessoa consegue aplicar sozinha hoje no perfil do Google, ligada a uma oportunidade do diagnóstico (ex.: pedir avaliação ao fim do atendimento com o link direto, responder as avaliações recentes, subir fotos novas, completar a descrição). Nada genérico como \"mantenha o perfil atualizado\". 2 balões: a dica no primeiro; no segundo, SÓ a pergunta oferecendo o diagnóstico completo. Até 350 caracteres.",
  },
  {
    dia: 10, periodo: "manha", canal: "whatsapp",
    objetivo:
      "Despedida educada no WhatsApp, 2 balões curtos: no primeiro, diga que não vai insistir mais e deixe a porta aberta; no segundo, SÓ a pergunta se pode procurar mais para frente. Até 220 caracteres. Sem drama e sem culpa.",
  },
];

export interface Toque extends PassoCadencia {
  n: number;
  assunto?: string;
  texto: string;
}

/** Nome da ficha sem as palavras-chave ("Clínica X | Dentista | Implante" → "Clínica X"). */
export function nomeCurto(nome: string): string {
  return (nome || "").split(/\s+[|\-–•]\s+|\s*\|\s*/)[0].trim() || nome;
}

/** Instruções para a IA escrever a sequência inteira (os 6 toques) de um lead. */
export function promptSequencia(lead: LeadPerfil & { tentativa?: number | null }, d: Diagnostico): string {
  const C = SDR_CONFIG;
  const nome = (lead.decisor || "").trim().split(/\s+/)[0] || "";
  const empresa = nomeCurto(lead.empresa);
  const troca = (t: string) =>
    t.replace(/\{nome\}/g, nome || "").replace(/\{empresa\}/g, empresa).replace(/\{nicho_plural\}/g, nichoPlural(lead.nicho)).replace(/\{cidade\}/g, lead.cidade ?? "sua cidade").replace(/\{whatsapp\}/g, C.whatsapp.exibicao);
  const semSite = !lead.site || /(mechameaqui|guiamais|apontador|telelistas|solutudo|facebook\.com|instagram\.com|linktr\.ee|wa\.me|negocio\.site|business\.site)/i.test(lead.site);
  const passos = CADENCIA.map(
    (p, i) => `${i + 1}. Dia ${p.dia}, ${p.periodo === "manha" ? "manhã" : "tarde"}, ${p.canal === "email" ? "E-MAIL" : "WHATSAPP"}. Ângulo: ${ANGULOS[i]} Forma: ${troca(p.objetivo)}`,
  ).join("\n");
  return `Você é ${C.nomeAssistente}, da ${C.empresa.nome}, e vai escrever a sequência de prospecção ativa para uma empresa que encontramos no Google Maps. São ${CADENCIA.length} toques; cada toque só sai se a pessoa ainda não respondeu, então cada um precisa fazer sentido sozinho e não repetir o anterior.

## Quem somos
${C.empresa.nome}: ajudamos empresas da região de Campinas e Indaiatuba com marketing, vendas, automação e IA. Quem faz os diagnósticos é ${C.empresa.especialista}. Nunca cite o nome de ninguém da equipe. Um dos nossos focos é fazer empresas locais aparecerem melhor no Google e transformarem isso em clientes.

## Empresa
Nome: ${empresa}${empresa !== lead.empresa ? ` (nome completo da ficha: ${lead.empresa})` : ""}
Segmento: ${lead.nicho ?? "não informado"} | Cidade: ${lead.cidade ?? "não informada"}
Decisor: ${nome || "não sabemos o nome"}
${(lead.tentativa ?? 1) > 1 ? `\nATENÇÃO: já falamos com essa empresa há uns meses e ela não respondeu. Esta é uma nova tentativa: não finja que é o primeiro contato, mencione de leve que falamos antes.\n` : ""}
## Diagnóstico do perfil no Google (fatos verificados; use SÓ estes)
${JSON.stringify(d, null, 2)}
Sobre a posição: se "tipo" for "avaliacoes", é a posição em número de avaliações entre as empresas do segmento que mapeamos na cidade. Diga isso com clareza (ex.: "10º em avaliações entre 13 escritórios de Campinas"). Nunca diga que é a posição na busca do Google. Se "tipo" for "busca", aí sim é a posição real no Google Maps para o termo.

## Sequência
${passos}

${GUIA_COPY}

${REGRAS_DE_ESTILO}
- Chame a empresa de "${empresa}" na primeira menção de cada mensagem; depois use "vocês". Não cite o nome de concorrentes. Sem links e sem preço.
- Nunca seja vago ou misterioso ("tem um ponto que...", "um detalhe que muita gente esquece"): diga o fato.
- Não trate como ponto forte algo que está em "oportunidades" (ex.: se o número de avaliações está abaixo da média, não diga "já tem X avaliações" como elogio).
- Os toques precisam ser diferentes entre si: não repita a mesma frase, o mesmo fato com as mesmas palavras ou a mesma abertura.
- No WhatsApp, quando quiser mais de um balão, separe por uma linha em branco.
- O toque 1 NÃO repete "oi"/"boa tarde" (a saudação vai sozinha antes): o balão 1 começa com "Tudo bem? Aqui é a Ana, da DemandIA".
- No WhatsApp, a pergunta (chamada para ação) vai SEMPRE sozinha no último balão, curta.
- E-mails: assunto que dá vontade de abrir (curioso e específico, nunca genérico como "Perfil da empresa no Google"), corpo enxuto e SEMPRE uma chamada para ação clara no fim (responder o e-mail ou chamar no WhatsApp ${C.whatsapp.exibicao}).${semSite ? `
- A empresa NÃO tem site próprio. No toque 5, depois da dica, ofereça montar de graça uma prévia de como ficaria o site de vocês, sem compromisso (é a isca de reciprocidade). Não prometa prazo nem mande link.` : ""}

## Formato da resposta
Responda SOMENTE com um JSON assim, com os ${CADENCIA.length} toques na ordem:
{"toques": [{"texto": "..."}, {"assunto": "...", "texto": "..."}, {"texto": "..."}, {"assunto": "...", "texto": "..."}, {"texto": "..."}, {"texto": "..."}]}`;
}

/** Prompt da segunda etapa (revisor de copy), com o contexto do lead. */
export function promptRevisaoSequencia(lead: LeadPerfil & { tentativa?: number | null }, d: Diagnostico, seq: Toque[]): string {
  const nome = (lead.decisor || "").trim().split(/\s+/)[0] || "";
  const contexto = `Empresa: ${nomeCurto(lead.empresa)} | Segmento: ${lead.nicho ?? "não informado"} | Cidade: ${lead.cidade ?? "não informada"} | Decisor: ${nome || "não sabemos o nome"}${(lead.tentativa ?? 1) > 1 ? " | Segunda tentativa: já falamos antes e não houve resposta" : ""}
Diagnóstico: ${JSON.stringify(d)}`;
  const json = JSON.stringify({ toques: seq.map((t) => (t.canal === "email" ? { assunto: t.assunto, texto: t.texto } : { texto: t.texto })) }, null, 2);
  return promptRevisao(contexto, json);
}

/** Junta a resposta da IA com a cadência, já limpando o texto. */
export function montarSequencia(resposta: string): Toque[] {
  const m = resposta.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("a IA não devolveu a sequência");
  const json = JSON.parse(m[0]) as { toques?: { assunto?: string; texto?: string }[] };
  const toques = json.toques ?? [];
  if (toques.length < CADENCIA.length) throw new Error(`a IA devolveu ${toques.length} toques`);
  return CADENCIA.map((p, n) => {
    const t = toques[n] ?? {};
    const texto = p.canal === "whatsapp" ? limparMensagem(t.texto ?? "", 3) : humanizar(t.texto ?? "");
    if (!texto) throw new Error(`toque ${n + 1} veio vazio`);
    const toque: Toque = { n, ...p, texto };
    if (p.canal === "email") toque.assunto = humanizar(t.assunto ?? "").replace(/\n/g, " ") || "Perfil no Google";
    return toque;
  });
}

/** Problemas de estilo na sequência inteira (para pedir uma nova versão). */
export function problemasDaSequencia(seq: Toque[]): string[] {
  const out = seq.flatMap((t) => problemasDeEstilo(`${t.assunto ?? ""}\n${t.texto}`).map((p) => `toque ${t.n + 1}: ${p}`));
  if (seq[0] && !/\bAna\b/.test(seq[0].texto)) out.push('toque 1: falta se apresentar ("aqui é a Ana, da DemandIA")');
  if (seq[0] && /^\s*(oi|olá|ola|bom dia|boa tarde)\b/i.test(seq[0].texto)) out.push("toque 1: não repita oi/boa tarde, a saudação já vai sozinha antes; comece com \"Tudo bem? Aqui é a Ana, da DemandIA\"");
  for (const t of seq) {
    if (t.canal !== "whatsapp") continue;
    const b = t.texto.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    const ultimo = b[b.length - 1] ?? "";
    if (b.length < 2 || !ultimo.includes("?") || ultimo.length > 140) out.push(`toque ${t.n + 1}: a pergunta tem que ir sozinha no último balão, curta`);
  }
  if (seq[0] && seq[0].texto.split(/\n\s*\n/).filter((x) => x.trim()).length !== 3) out.push("toque 1: precisa de exatamente 3 balões (apresentação, análise, pergunta)");
  for (const t of seq) if (t.canal === "email" && /\p{Extended_Pictographic}/u.test(`${t.assunto ?? ""} ${t.texto}`)) out.push(`toque ${t.n + 1}: e-mail sem emoji`);
  return out;
}

/** Limpa uma mensagem de WhatsApp: tira cara de IA e garante no máximo 3 balões. */
export function limparMensagem(texto: string, maxBaloes = 3): string {
  const t = humanizar(texto);
  const baloes = t.split(/\n\s*\n/).map((b) => b.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  return (baloes.length > maxBaloes ? [...baloes.slice(0, maxBaloes - 1), baloes.slice(maxBaloes - 1).join(" ")] : baloes).join("\n\n");
}
