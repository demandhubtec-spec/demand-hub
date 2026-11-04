/**
 * Estúdio · o que a IA escreve: motivo das referências (Curador), pautas do mês (Pauteiro) e copy (Redator).
 * Todas as respostas vêm em JSON e passam pelas regras de marca da DemandIA.
 */
import { callLLM } from "../llm.ts";
import { SDR_CONFIG } from "../../config/sdr.ts";
import type { Formato, Pilar, Vaga } from "./regras.ts";

export const REGRAS_DE_MARCA = `## Regras de marca da ${SDR_CONFIG.empresa.nome} (valem para tudo que você escreve)
- Fale direto com o dono do negócio (clínicas de estética, odontologia, academias e serviços locais). Venda faturamento, agenda cheia e tempo de volta, nunca "leads".
- Português do Brasil, frases curtas, sem travessão (— ou –), sem jargão (nada de funil, SDR, BANT, alavancar, potencializar, solução, jornada).
- Nada com cara de texto feito por IA: sem frase genérica, sem lista de clichês, no máximo 1 emoji por bloco.
- Gancho forte na primeira frase (é o que segura nos primeiros 3 segundos).
- Quando houver oferta: "diagnóstico gratuito", "demo ao vivo", ou a palavra-chave para comentar. O corte é faturamento acima de R$ 30 mil por mês (academias: R$ 100 mil).
- Assinatura da marca, quando couber: "A DemandIA trabalha. Você fatura."
- Nunca invente número de cliente, depoimento, nome de cliente ou resultado. Use números só como exemplo ilustrativo e deixe isso claro.
- Use a referência como formato e tipo de gancho, nunca copie o texto dela.`;

function jsonDe<T>(txt: string | null | undefined): T {
  const t = (txt ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  return JSON.parse(t) as T;
}

async function pedirJson<T>(system: string, pedido: string, maxTokens = 4000): Promise<T> {
  const r = await callLLM({ system, messages: [{ role: "user", content: pedido }], maxTokens, json: true });
  return jsonDe<T>(r.message.content);
}

export interface RefResumo {
  id: string;
  conta: string | null;
  formato: string | null;
  legenda: string | null;
  curtidas: number | null;
  comentarios: number | null;
  views: number | null;
  nota: number | null;
  motivo?: string | null;
}

/** Curador: por que cada referência funcionou (gancho, formato, tema), em uma linha. */
export async function motivosDasReferencias(refs: RefResumo[]): Promise<Record<string, string>> {
  if (!refs.length) return {};
  const lista = refs
    .map((r, i) => `${i + 1}. id=${r.id} | @${r.conta} | ${r.formato} | ${r.curtidas ?? 0} curtidas, ${r.comentarios ?? 0} comentários${r.views ? `, ${r.views} views` : ""}\nLegenda: ${(r.legenda ?? "").slice(0, 500)}`)
    .join("\n\n");
  const out = await pedirJson<{ itens: { id: string; motivo: string }[] }>(
    `Você é o Curador de conteúdo da ${SDR_CONFIG.empresa.nome}. Para cada post de concorrente, explique em UMA frase curta (até 140 caracteres) por que ele engajou: o tipo de gancho, o formato e o tema. Português do Brasil, sem travessão.
Responda em JSON: {"itens":[{"id":"...","motivo":"..."}]}`,
    lista,
    3000,
  );
  return Object.fromEntries((out.itens ?? []).filter((i) => i.id && i.motivo).map((i) => [i.id, i.motivo.slice(0, 200)]));
}

export interface PautaGerada {
  dia: string;
  tema: string;
  gancho: string;
  palavra_gatilho: string | null;
  referencias: string[];
}

/** Pauteiro: uma pauta por vaga do calendário, inspirada nas melhores referências e sem repetir temas. */
export async function gerarPautas(opts: { vagas: Vaga[]; pilares: Pilar[]; refs: RefResumo[]; temasRecentes: string[] }): Promise<PautaGerada[]> {
  if (!opts.vagas.length) return [];
  const pilares = opts.pilares.map((p) => `- ${p.nome}: ${p.descricao}`).join("\n");
  const refs = opts.refs
    .slice(0, 15)
    .map((r) => `- id=${r.id} | @${r.conta} | ${r.formato} | nota ${r.nota} | ${r.motivo ?? ""} | "${(r.legenda ?? "").slice(0, 160)}"`)
    .join("\n");
  const vagas = opts.vagas.map((v) => `- ${v.dia} | ${v.formato} | pilar: ${v.pilar}`).join("\n");
  const out = await pedirJson<{ pautas: PautaGerada[] }>(
    `Você é o Pauteiro da ${SDR_CONFIG.empresa.nome}, que vende recepcionista de IA, automação de atendimento, diagnóstico gratuito e marketing para donos de clínicas e negócios locais.
Monte uma pauta para cada vaga do calendário: tema (o assunto do post), gancho (a primeira frase, que segura a atenção), palavra_gatilho (uma palavra em maiúsculas para o seguidor comentar e receber algo no Direct, como DEMO, AGENDA, DIAGNOSTICO; use em cerca de metade dos posts, nos de oferta e demonstração; senão null) e referencias (ids das referências que inspiraram, 0 a 2).

${REGRAS_DE_MARCA}

## Pilares
${pilares}

## Não repita estes temas recentes
${opts.temasRecentes.slice(0, 40).map((t) => `- ${t}`).join("\n") || "- (nenhum)"}

Responda em JSON: {"pautas":[{"dia":"AAAA-MM-DD","tema":"...","gancho":"...","palavra_gatilho":"DEMO" ou null,"referencias":["id"]}]}`,
    `## Vagas\n${vagas}\n\n## Referências que mais engajaram\n${refs || "- (ainda sem referências)"}`,
    6000,
  );
  return (out.pautas ?? []).filter((p) => p.dia && p.tema);
}

export interface CopyCarrossel {
  slides: { titulo: string; texto?: string }[];
  legenda: string;
  hashtags?: string[];
}
export interface CopyEstatico {
  titulo: string;
  subtitulo?: string;
  legenda: string;
  hashtags?: string[];
}
export interface CopyReels {
  cenas: { tempo: string; texto_tela: string; fala?: string; imagem?: string }[];
  legenda: string;
  capa_titulo: string;
  prompt_video: string;
  hashtags?: string[];
}
export type Copy = CopyCarrossel | CopyEstatico | CopyReels;

const FORMATO_PEDIDO: Record<Formato, string> = {
  carrossel: `Carrossel de 5 a 8 lâminas. Lâmina 1 = capa com o gancho (titulo até 60 caracteres, texto opcional até 90). Lâminas do meio = um ponto por lâmina (titulo até 50, texto até 220). Última lâmina = chamada para ação (com a palavra-chave, se houver).
JSON: {"slides":[{"titulo":"...","texto":"..."}],"legenda":"...","hashtags":["...","..."]}`,
  estatico: `Post estático de uma imagem: titulo forte (até 70 caracteres) e subtitulo (até 120).
JSON: {"titulo":"...","subtitulo":"...","legenda":"...","hashtags":["..."]}`,
  reels: `Roteiro de Reels de 20 a 45 segundos, vertical, com cenas curtas. Cada cena: tempo ("0-3s"), texto_tela (curto, em caixa alta funciona), fala (opcional) e imagem (o que aparece, em uma frase). Também: capa_titulo (até 40 caracteres) e prompt_video (descrição em português para gerar o vídeo numa ferramenta de IA: estilo, cenas, ritmo, cores roxo escuro da marca, sem rosto de pessoa real).
JSON: {"cenas":[{"tempo":"0-3s","texto_tela":"...","fala":"...","imagem":"..."}],"legenda":"...","capa_titulo":"...","prompt_video":"...","hashtags":["..."]}`,
};

/** Redator: copy completa no formato da pauta. Se veio ajuste do Kelvin, refaz seguindo o comentário. */
export async function redigir(opts: {
  formato: Formato;
  tema: string;
  gancho: string | null;
  pilar: string | null;
  palavra: string | null;
  refs: RefResumo[];
  ajuste?: { comentario: string; anterior: unknown } | null;
}): Promise<Copy> {
  const refs = opts.refs.map((r) => `- @${r.conta} (${r.formato}): ${r.motivo ?? ""} | "${(r.legenda ?? "").slice(0, 300)}"`).join("\n");
  const ajuste = opts.ajuste
    ? `\n\n## Ajuste pedido pelo Kelvin (prioridade máxima)\n${opts.ajuste.comentario}\n\n## Versão anterior\n${JSON.stringify(opts.ajuste.anterior).slice(0, 4000)}`
    : "";
  return pedirJson<Copy>(
    `Você é o Redator da ${SDR_CONFIG.empresa.nome} no Instagram (@demand_ia).

${REGRAS_DE_MARCA}

## Formato
${FORMATO_PEDIDO[opts.formato]}

## Legenda
Até 1.200 caracteres, parágrafos curtos, começa com o gancho, termina com uma pergunta ou com a chamada da palavra-chave. Hashtags: 3 a 5, do nicho, sem #.`,
    `Tema: ${opts.tema}
Gancho sugerido: ${opts.gancho ?? "(crie um)"}
Pilar: ${opts.pilar ?? "-"}
Palavra-chave para comentar: ${opts.palavra ?? "nenhuma (não peça comentário com palavra)"}

## Referências (formato e gancho, não copie)
${refs || "- nenhuma"}${ajuste}`,
    5000,
  );
}
