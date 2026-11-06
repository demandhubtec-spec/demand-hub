/**
 * Estúdio · o que a IA escreve: motivo das referências (Curador), pautas do mês (Pauteiro) e copy (Redator).
 * Todas as respostas vêm em JSON e passam pelas regras de marca da DemandIA.
 */
import { callLLM } from "../llm.ts";
import { db } from "../db.ts";
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

/**
 * O que o Kelvin disse ao time no chat da Central (grupo ou individual), últimos 30 dias.
 * Entra no prompt do Pauteiro e do Redator como orientação de prioridade alta.
 */
export async function orientacoesDoKelvin(): Promise<string> {
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await db()
    .from("estudio_mensagens")
    .select("para,texto,created_at")
    .eq("autor", "kelvin")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(15);
  const linhas = ((data ?? []) as { para: string; texto: string }[]).map((m) => `- ${m.para === "time" ? "para o time" : `para ${m.para}`}: ${m.texto.slice(0, 400)}`);
  return linhas.length ? `\n\n## Orientações do Kelvin no chat do time (siga, a mais recente vale mais)\n${linhas.join("\n")}` : "";
}

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
export async function gerarPautas(opts: { vagas: Vaga[]; pilares: Pilar[]; refs: RefResumo[]; temasRecentes: string[]; contexto?: string }): Promise<PautaGerada[]> {
  if (!opts.vagas.length) return [];
  const pilares = opts.pilares.map((p) => `- ${p.nome}: ${p.descricao}`).join("\n");
  const refs = opts.refs
    .slice(0, 15)
    .map((r) => `- id=${r.id} | @${r.conta} | ${r.formato} | nota ${r.nota} | ${r.motivo ?? ""} | "${(r.legenda ?? "").slice(0, 160)}"`)
    .join("\n");
  const vagas = opts.vagas.map((v) => `- ${v.dia} | ${v.formato} | pilar: ${v.pilar}`).join("\n");
  const orientacoes = await orientacoesDoKelvin().catch(() => "");
  const out = await pedirJson<{ pautas: PautaGerada[] }>(
    `Você é o Pauteiro da ${SDR_CONFIG.empresa.nome}, que vende recepcionista de IA, automação de atendimento, diagnóstico gratuito e marketing para donos de clínicas e negócios locais.
Monte uma pauta para cada vaga do calendário: tema (o assunto do post), gancho (a primeira frase, que segura a atenção), palavra_gatilho (uma palavra em maiúsculas para o seguidor comentar e receber algo no Direct, como DEMO, AGENDA, DIAGNOSTICO; use em cerca de metade dos posts, nos de oferta e demonstração; senão null) e referencias (ids das referências que inspiraram, 0 a 2).

${REGRAS_DE_MARCA}

## Pilares
${pilares}

## Não repita estes temas recentes
${opts.temasRecentes.slice(0, 40).map((t) => `- ${t}`).join("\n") || "- (nenhum)"}

O mês precisa ter sequência: os temas conversam entre si (uma semana prepara a outra), sem repetir assunto, e cada semana fecha com um post de oferta.

Responda em JSON: {"pautas":[{"dia":"AAAA-MM-DD","tema":"...","gancho":"...","palavra_gatilho":"DEMO" ou null,"referencias":["id"]}]}${opts.contexto ?? ""}${orientacoes}`,
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
  carrossel: `Carrossel de 7 a 10 lâminas (Kelvin, 05/11: os de 5 ficaram curtos demais). Lâmina 1 = capa com o gancho (titulo até 60 caracteres, texto opcional até 90). Lâmina 2 = o problema com uma cena real do dono. Lâminas do meio = um ponto por lâmina, com exemplo concreto (titulo até 50, texto de 120 a 240 caracteres). Última lâmina = chamada para ação (com a palavra-chave, se houver).
JSON: {"slides":[{"titulo":"...","texto":"..."}],"legenda":"...","hashtags":["...","..."]}`,
  estatico: `Post estático de uma imagem: titulo forte (até 70 caracteres) e subtitulo (até 120).
JSON: {"titulo":"...","subtitulo":"...","legenda":"...","hashtags":["..."]}`,
  reels: `Roteiro de Reels de 20 a 40 segundos, vertical. O vídeo é montado pelo nosso sistema com texto animado na tela (sem pessoa, sem narração), então TUDO precisa estar no texto_tela. De 6 a 9 cenas. Cada cena: tempo ("0-3s", de 2 a 5 segundos cada), texto_tela (uma frase curta e forte, até 70 caracteres; a 1ª cena é o gancho e a última é a chamada com a palavra-chave, se houver), fala (deixe vazio) e imagem (palavra ou número de destaque da cena, até 12 caracteres, opcional). Também: capa_titulo (até 40 caracteres) e prompt_video (uma frase sobre o clima do vídeo).
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
  contexto?: string;
}): Promise<Copy> {
  const refs = opts.refs.map((r) => `- @${r.conta} (${r.formato}): ${r.motivo ?? ""} | "${(r.legenda ?? "").slice(0, 300)}"`).join("\n");
  const ajuste = opts.ajuste
    ? `\n\n## Ajuste pedido pelo Kelvin (prioridade máxima)\n${opts.ajuste.comentario}\n\n## Versão anterior\n${JSON.stringify(opts.ajuste.anterior).slice(0, 4000)}`
    : "";
  const orientacoes = await orientacoesDoKelvin().catch(() => "");
  return pedirJson<Copy>(
    `Você é o Redator da ${SDR_CONFIG.empresa.nome} no Instagram (@demand_ia).

${REGRAS_DE_MARCA}

## Formato
${FORMATO_PEDIDO[opts.formato]}

## Legenda
Até 1.200 caracteres, parágrafos curtos, começa com o gancho, termina com uma pergunta ou com a chamada da palavra-chave. Hashtags: 3 a 5, do nicho, sem #.${opts.contexto ?? ""}${orientacoes}`,
    `Tema: ${opts.tema}
Gancho sugerido: ${opts.gancho ?? "(crie um)"}
Pilar: ${opts.pilar ?? "-"}
Palavra-chave para comentar: ${opts.palavra ?? "nenhuma (não peça comentário com palavra)"}

## Referências (formato e gancho, não copie)
${refs || "- nenhuma"}${ajuste}`,
    5000,
  );
}

/* ---------------- Marca e padrão do perfil ---------------- */

export interface Marca {
  nome?: string;
  cores?: { fundo?: string; fundo2?: string; destaque?: string; destaque2?: string; texto?: string };
  fontes?: { titulo?: string; texto?: string };
  logo_url?: string;
  /** Largura ÷ altura da logo. */
  logo_proporcao?: number;
  manual_url?: string;
  tom?: string;
  regras?: string;
  assinatura?: string;
}

export interface PerfilPadrao {
  resumo?: string;
  visual?: string;
  atualizado_em?: string;
}

/** Bloco que entra nos prompts do time: manual de marca + o que o nosso perfil já faz. */
export function contextoDaMarca(marca: Marca | null | undefined, perfil: PerfilPadrao | null | undefined): string {
  const partes: string[] = [];
  if (marca && (marca.tom || marca.regras || marca.assinatura)) {
    partes.push(
      `## Manual de marca (siga à risca)${marca.nome ? `\nNome da marca: ${marca.nome}` : ""}${marca.tom ? `\nTom de voz: ${marca.tom}` : ""}${marca.regras ? `\nRegras: ${marca.regras}` : ""}${marca.assinatura ? `\nAssinatura: ${marca.assinatura}` : ""}`,
    );
  }
  if (perfil?.resumo) partes.push(`## Padrão do nosso perfil (@demand_ia): continue nessa linha e evolua\n${perfil.resumo}`);
  return partes.length ? `\n\n${partes.join("\n\n")}` : "";
}

/** Chamada com imagens (visão), para o time estudar o visual dos nossos posts. */
async function pedirJsonComImagens<T>(system: string, pedido: string, imagens: string[], maxTokens = 3000): Promise<T> {
  const { env } = await import("../env.ts");
  // O CDN do Instagram não deixa a OpenAI baixar a imagem: baixamos aqui e mandamos o arquivo junto
  const embutidas = (
    await Promise.all(
      imagens.slice(0, 8).map(async (url) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          const tipo = r.headers.get("content-type") || "image/jpeg";
          return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
        } catch {
          return null;
        }
      }),
    )
  ).filter((u): u is string => !!u);
  const conteudo = [{ type: "text", text: pedido }, ...embutidas.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } }))];
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.openaiKey}` },
    body: JSON.stringify({
      model: env.openaiModel,
      messages: [{ role: "system", content: system }, { role: "user", content: conteudo }],
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { choices: { message: { content: string | null } }[] };
  return jsonDe<T>(j.choices[0]?.message?.content);
}

/** Estuda os posts do @demand_ia: formatos, ganchos, legendas, visual e o que deu mais resultado. */
export async function estudarPerfil(posts: { formato: string; legenda: string; curtidas: number; comentarios: number; data: string; slides: number }[], imagens: string[]): Promise<PerfilPadrao> {
  const lista = posts
    .map((p, i) => `${i + 1}. ${p.data} | ${p.formato}${p.slides > 1 ? ` (${p.slides} lâminas)` : ""} | ${p.curtidas} curtidas, ${p.comentarios} comentários\nLegenda: ${p.legenda.slice(0, 400)}`)
    .join("\n\n");
  const out = await pedirJsonComImagens<{ resumo: string; visual: string }>(
    `Você é o time de conteúdo da ${SDR_CONFIG.empresa.nome}. Estude os posts do nosso próprio Instagram (@demand_ia) e as imagens de alguns deles.
Escreva em português do Brasil, sem travessão, de forma prática para o time seguir:
- resumo: até 900 caracteres. Formatos usados e proporção, tamanho dos carrosséis, como são os ganchos e as legendas, chamadas usadas, temas que mais engajaram e o que evitar.
- visual: até 600 caracteres. Cores, fundo, tipografia (estilo), onde vai a logo, quantidade de texto por lâmina, elementos que se repetem.
Responda em JSON: {"resumo":"...","visual":"..."}`,
    lista || "(sem posts)",
    imagens,
  );
  return { resumo: (out.resumo ?? "").slice(0, 1200), visual: (out.visual ?? "").slice(0, 800), atualizado_em: new Date().toISOString() };
}

/* ---------------- Chat com o time ---------------- */

export const AGENTES_DO_TIME: Record<string, string> = {
  vera: "Vera, coordenadora de social media: organiza o time, responde pelo andamento e distribui as orientações do Kelvin",
  rita: "Rita, pesquisa: roda o Radar nos perfis de referência e explica o que engajou",
  teo: "Téo, estrategista: monta o plano do mês (temas, pilares, formatos, datas)",
  bia: "Bia, redatora: escreve carrossel, estático, roteiro de reels e legenda",
  duda: "Duda, design: faz as artes e os vídeos dos reels seguindo o manual de marca",
  rui: "Rui, revisor: confere cada peça (ortografia, sem travessão, limites do Instagram, fiel à marca) antes de ir para o Kelvin",
  lara: "Lara, publicação: agenda e publica no horário, cria o gatilho da palavra-chave no Direct",
  nina: "Nina, resultados: acompanha o desempenho dos posts publicados",
};

export interface RespostaChat {
  respostas: { agente: string; texto: string }[];
  acoes?: { tipo: "ajustar" | "trocar_tema"; dia: string; comentario: string }[];
}

/** O time responde ao Kelvin de verdade, com o estado real do Estúdio. */
export async function responderNoChat(opts: { para: string; texto: string; historico: string; estado: string }): Promise<RespostaChat> {
  const grupo = opts.para === "time";
  const quem = grupo
    ? "Responda como o time: a Vera sempre responde primeiro; se o assunto for de alguém específico, essa pessoa também responde (no máximo 3 respostas no total)."
    : `Responda só como ${AGENTES_DO_TIME[opts.para] ?? opts.para}.`;
  const out = await pedirJson<RespostaChat>(
    `Você é o Time de Marketing IA da ${SDR_CONFIG.empresa.nome} conversando com o Kelvin (o dono) num chat interno.
${Object.values(AGENTES_DO_TIME).map((a) => `- ${a}`).join("\n")}

${quem}
Regras:
- Use SÓ o estado real abaixo. Nunca invente número, post, resultado, prazo ou entrega que não esteja no estado. Se não souber, diga o que vai verificar.
- Português do Brasil, natural, curto (até 4 frases por resposta), sem travessão, sem jargão.
- O que o Kelvin orientar vira regra para as próximas pautas, copies e artes: confirme o que muda na prática.
- Se ele pedir para mudar um post específico, devolva uma ação: "ajustar" (refazer copy ou arte daquele dia com o comentário) ou "trocar_tema" (descartar a pauta do dia para o Téo planejar outra). Use a data AAAA-MM-DD do estado.
Responda em JSON: {"respostas":[{"agente":"vera","texto":"..."}],"acoes":[{"tipo":"ajustar","dia":"AAAA-MM-DD","comentario":"..."}]}

## Estado real do Estúdio agora
${opts.estado}`,
    `## Conversa até aqui\n${opts.historico || "(início)"}\n\n## Kelvin agora\n${opts.texto}`,
    2500,
  );
  const validos = new Set(Object.keys(AGENTES_DO_TIME));
  return {
    respostas: (out.respostas ?? [])
      .filter((r) => validos.has(r.agente) && r.texto)
      .slice(0, grupo ? 3 : 1)
      .map((r) => ({ agente: grupo ? r.agente : opts.para, texto: r.texto.replace(/\s*[—–]\s*/g, ", ").slice(0, 900) })),
    acoes: (out.acoes ?? []).filter((a) => (a.tipo === "ajustar" || a.tipo === "trocar_tema") && /^\d{4}-\d{2}-\d{2}$/.test(a.dia ?? "")).slice(0, 5),
  };
}
