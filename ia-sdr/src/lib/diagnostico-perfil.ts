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
      "Primeira abordagem no WhatsApp. Exatamente 2 balões separados por uma linha em branco. Balão 1 (curto): \"Oi, {nome}, tudo bem?\" (ou \"Oi, tudo bem?\" sem nome) e \"aqui é a Ana, da DemandIA\", dizendo em poucas palavras que ajudamos empresas da região com marketing, vendas, automação e IA. Balão 2: um fato concreto do diagnóstico (de preferência a posição frente aos concorrentes), reconhecendo um ponto forte se houver, UMA oportunidade, e a oferta de um diagnóstico gratuito e mais completo do perfil no Google, terminando com uma pergunta simples e natural (ex.: \"Posso te mandar?\", \"Faz sentido?\"), nunca \"responde sim ou não\". Não use quebras de linha dentro de um balão. Máximo de 420 caracteres no total.",
  },
  {
    dia: 0, periodo: "tarde", canal: "email",
    objetivo:
      "E-mail no mesmo dia, para quem prefere e-mail. Diga logo no começo que mandou uma mensagem no WhatsApp mais cedo. Corpo com 3 parágrafos curtos: quem é a Ana e a DemandIA em uma frase; o que viu no perfil (1 ponto forte e até 2 oportunidades do diagnóstico, explicando em palavras simples por que isso pesa na escolha do cliente); o convite para o diagnóstico gratuito de 30 minutos com um dos nossos especialistas, sem compromisso, pedindo para responder o e-mail ou chamar no WhatsApp. Assunto curto, sem cara de propaganda, citando a empresa (ex.: \"Perfil da {empresa} no Google\"). Entre 70 e 140 palavras. Não assine: a assinatura entra sozinha.",
  },
  {
    dia: 2, periodo: "manha", canal: "whatsapp",
    objetivo:
      "Follow-up curto no WhatsApp, 1 balão só, no máximo 200 caracteres. Outro ângulo: traga um fato do diagnóstico diferente do toque 1 (ou, se só houver um, o efeito prático dele para quem procura {nicho_plural} em {cidade}). Sem cobrar resposta. Não comece com \"passando\" e não diga \"só para lembrar\". Termine com uma pergunta simples.",
  },
  {
    dia: 4, periodo: "manha", canal: "email",
    objetivo:
      "Segundo e-mail. Traga UM ponto concreto do diagnóstico, dito com todas as letras (nada de \"um detalhe\" ou \"um ponto\" sem dizer qual), e explique em 2 ou 3 frases o efeito disso para quem procura {nicho_plural} em {cidade} no Google. Feche com o convite para o diagnóstico gratuito. Assunto diferente do primeiro, curto. Entre 60 e 120 palavras. Não assine.",
  },
  {
    dia: 7, periodo: "manha", canal: "whatsapp",
    objetivo:
      "Follow-up no WhatsApp com UMA dica prática, específica e gratuita que a pessoa consegue aplicar sozinha hoje no perfil do Google, ligada a uma oportunidade do diagnóstico (ex.: pedir avaliação ao fim do atendimento com o link direto, responder as avaliações recentes, subir fotos novas, completar a descrição). Nada genérico como \"mantenha o perfil atualizado\". Depois ofereça o diagnóstico completo. 1 ou 2 balões, até 350 caracteres.",
  },
  {
    dia: 10, periodo: "manha", canal: "whatsapp",
    objetivo:
      "Despedida educada no WhatsApp, 1 balão, até 220 caracteres. Diga que não vai insistir mais, deixe a porta aberta e pergunte se pode procurar mais para frente. Sem drama e sem culpa.",
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
    t.replace(/\{nome\}/g, nome || "").replace(/\{empresa\}/g, empresa).replace(/\{nicho_plural\}/g, nichoPlural(lead.nicho)).replace(/\{cidade\}/g, lead.cidade ?? "sua cidade");
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
- O balão 1 do toque 1 sempre apresenta: "aqui é a Ana, da DemandIA".${semSite ? `
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
    const texto = p.canal === "whatsapp" ? limparMensagem(t.texto ?? "", n === 0 ? 2 : 3) : humanizar(t.texto ?? "");
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
  return out;
}

/** Limpa uma mensagem de WhatsApp: tira cara de IA e garante no máximo 3 balões. */
export function limparMensagem(texto: string, maxBaloes = 3): string {
  const t = humanizar(texto);
  const baloes = t.split(/\n\s*\n/).map((b) => b.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  return (baloes.length > maxBaloes ? [...baloes.slice(0, maxBaloes - 1), baloes.slice(maxBaloes - 1).join(" ")] : baloes).join("\n\n");
}
