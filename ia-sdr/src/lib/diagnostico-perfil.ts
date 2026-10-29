/**
 * Mini-diagnóstico do perfil no Google de um lead da prospecção.
 * Tudo aqui é calculado a partir de dados reais (coleta do Google Maps). Nada é inventado:
 * se um sinal não veio na coleta, ele simplesmente não entra no diagnóstico.
 */
import { SDR_CONFIG } from "../config/sdr.ts";

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

/** Instruções para a IA escrever a primeira mensagem de prospecção de um lead. */
export function promptMensagem(lead: LeadPerfil, d: Diagnostico): string {
  const C = SDR_CONFIG;
  const nome = (lead.decisor || "").trim().split(/\s+/)[0] || "";
  return `Você é ${C.nomeAssistente}, da ${C.empresa.nome}, e vai escrever a PRIMEIRA mensagem de WhatsApp para uma empresa que encontramos no Google Maps (prospecção ativa).

## Quem somos
${C.empresa.nome}: ajudamos empresas da região de Campinas e Indaiatuba com marketing, vendas, automação e IA. O ${C.empresa.responsavel} é o especialista responsável pelos diagnósticos. Um dos nossos focos é fazer empresas locais aparecerem melhor no Google e transformarem isso em clientes.

## Empresa
Nome: ${lead.empresa}
Segmento: ${lead.nicho ?? "—"} | Cidade: ${lead.cidade ?? "—"}
Decisor: ${nome || "não sabemos o nome"}

## Diagnóstico do perfil no Google (fatos verificados; use SÓ estes)
${JSON.stringify(d, null, 2)}

## Como escrever
- Exatamente 2 balões, separados por UMA linha em branco.
- Balão 1 (curto): cumprimento ${nome ? `usando o nome "${nome}"` : 'sem nome ("Oi, tudo bem?")'} e apresentação: "aqui é a ${C.nomeAssistente}, da ${C.empresa.nome}", dizendo em poucas palavras que ajudamos empresas da região com marketing, vendas, automação e IA. Não use "bom dia/boa tarde".
- Balão 2: comece por UM fato concreto do diagnóstico, de preferência a posição frente aos concorrentes. Se houver ponto forte, reconheça com sinceridade em poucas palavras. Depois aponte UMA oportunidade, a mais relevante, sem tom de crítica. Termine oferecendo um diagnóstico gratuito e mais completo do perfil no Google, com uma pergunta simples de sim ou não.
- Fale como uma pessoa, não como anúncio. Português do Brasil, tom próximo e respeitoso.
- Máximo de 420 caracteres no total. Sem links, sem preço, sem emojis (no máximo 1), sem travessão (—), sem markdown, sem aspas no começo e no fim.
- Use números exatamente como estão no diagnóstico (formato brasileiro). NUNCA invente posição, nota, concorrente ou qualquer dado. Se o diagnóstico estiver vazio, fale de forma genérica sobre ajudar ${nichoPlural(lead.nicho)} da região a aparecer melhor no Google.
- Não cite o nome de concorrentes.

Responda SOMENTE com o texto da mensagem.`;
}

/** Limpa a resposta da IA: tira aspas, travessões e garante no máximo 3 balões. */
export function limparMensagem(texto: string): string {
  let t = texto.trim().replace(/^["“”']+|["“”']+$/g, "").replace(/\s*[—–]\s*/g, ", ").replace(/\*\*/g, "");
  const baloes = t.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  t = (baloes.length > 3 ? [...baloes.slice(0, 2), baloes.slice(2).join(" ")] : baloes).join("\n\n");
  return t;
}
