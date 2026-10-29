/**
 * Prospecção ativa · extras de cada lead:
 * - Direct do Instagram: texto pronto para o Kelvin copiar e colar (envio manual).
 * - Prévia de site grátis: uma página curta (3 seções) de como ficaria o site da empresa,
 *   usada como isca para quem não tem site próprio.
 */
import { randomBytes } from "node:crypto";
import { SDR_CONFIG } from "../config/sdr.ts";
import { callLLM } from "./llm.ts";
import { REGRAS_DE_ESTILO, humanizar } from "./estilo.ts";
import { type Diagnostico, type LeadPerfil, nomeCurto } from "./diagnostico-perfil.ts";

/** Sites que não são da empresa (diretórios, redes, link na bio): contam como "sem site próprio". */
const NAO_E_SITE = /(mechameaqui|guiamais|apontador|telelistas|solutudo|facebook\.com|instagram\.com|linktr\.ee|wa\.me|whatsapp\.com|negocio\.site|business\.site|google\.com|goo\.gl|ifood|doctoralia|booksy|kiwify)/i;

export function semSiteProprio(site: string | null | undefined): boolean {
  const s = (site ?? "").trim();
  return !s || NAO_E_SITE.test(s);
}

/** @handle a partir da URL ou do texto do Instagram. */
export function handleInstagram(ig: string | null | undefined): string | null {
  const s = (ig ?? "").trim();
  if (!s) return null;
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i) ?? s.match(/^@?([A-Za-z0-9._]+)$/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- Direct do Instagram

export function promptDirect(lead: LeadPerfil, d: Diagnostico): string {
  const C = SDR_CONFIG;
  const nome = (lead.decisor || "").trim().split(/\s+/)[0] || "";
  const empresa = nomeCurto(lead.empresa);
  return `Você é ${C.nomeAssistente}, da ${C.empresa.nome}. Escreva UMA mensagem de Direct do Instagram para a ${empresa} (${lead.nicho ?? "empresa local"}, ${lead.cidade ?? ""}). Quem vai enviar é a nossa equipe, copiando e colando, pelo Instagram da ${C.empresa.nome}.

Fatos verificados do perfil no Google (use só estes): ${JSON.stringify(d)}
${nome ? `Nome do decisor: ${nome} (só use se soar natural; no Instagram quem lê pode ser outra pessoa).` : ""}
${semSiteProprio(lead.site) ? "A empresa não tem site próprio: ofereça também uma prévia grátis de como ficaria o site deles." : ""}

Como escrever:
- Direct é mais informal que e-mail: 2 parágrafos curtos, no máximo 380 caracteres no total.
- Abra com "Oi, tudo bem?" e "aqui é a Ana, da DemandIA". Mostre que olhou o perfil: um fato concreto do diagnóstico.
- Reciprocidade: ofereça o diagnóstico gratuito do perfil no Google, feito pelo nosso especialista em presença digital.
- Termine com uma pergunta fácil de responder ("Posso te mandar por aqui?").
- Nunca cite o nome de ninguém da equipe. Sem links, sem preço, sem hashtag.

${REGRAS_DE_ESTILO}

Responda só com o texto da mensagem.`;
}

export async function gerarDirect(lead: LeadPerfil, d: Diagnostico): Promise<string> {
  const r = await callLLM({ system: promptDirect(lead, d), messages: [{ role: "user", content: "Escreva o Direct." }], maxTokens: 1500 });
  return humanizar(r.message.content ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------- Prévia de site

export const PALETAS = {
  azul: { cor: "#1F5EFF", escura: "#0B1B4D", clara: "#EAF0FF" },
  verde: { cor: "#14946B", escura: "#0A3A2B", clara: "#E6F6EF" },
  roxo: { cor: "#6B3CE6", escura: "#22104F", clara: "#F0EAFF" },
  terracota: { cor: "#C8553D", escura: "#3D1A12", clara: "#FBEDE8" },
  grafite: { cor: "#B8892E", escura: "#16181D", clara: "#F5F1E8" },
  rosa: { cor: "#D6457A", escura: "#3F1024", clara: "#FCEAF1" },
} as const;
export type Paleta = keyof typeof PALETAS;

export interface SitePreview {
  token: string;
  empresa: string;
  nicho: string | null;
  cidade: string | null;
  endereco: string | null;
  nota: number | null;
  avaliacoes: number | null;
  titulo: string;
  subtitulo: string;
  cta: string;
  sobre: string;
  servicos: { titulo: string; texto: string }[];
  diferenciais: string[];
  paleta: Paleta;
  gerado_em: string;
}

export function promptSite(lead: LeadPerfil & { endereco?: string | null }): string {
  const empresa = nomeCurto(lead.empresa);
  return `Você é redator de sites para pequenas empresas no Brasil. Escreva o conteúdo de uma PRÉVIA curta de site (3 seções) para a ${empresa}, ${lead.nicho ?? "empresa local"} em ${lead.cidade ?? "sua cidade"}.
Dados reais que podem aparecer: nome "${empresa}", cidade, ${lead.nota ? `nota ${String(lead.nota).replace(".", ",")} no Google` : ""} ${lead.avaliacoes ? `com ${lead.avaliacoes} avaliações` : ""}.

Regras:
- Não invente fatos sobre a empresa: nada de anos de experiência, número de clientes, prêmios, nomes de pessoas, depoimentos ou preços.
- Fale do que esse tipo de negócio costuma oferecer e do que o cliente da região quer (resultado, confiança, praticidade), com palavras simples.
- Título com no máximo 8 palavras. Subtítulo com no máximo 22 palavras. Botão (cta) com 2 a 4 palavras.
- "sobre": 2 frases sobre como a empresa atende, sem inventar dados.
- 3 serviços típicos do segmento, cada um com título curto e 1 frase.
- 3 diferenciais curtos (até 6 palavras cada), sem números inventados.
- Escolha a paleta que combina com o segmento: azul, verde, roxo, terracota, grafite ou rosa.
- Sem travessão, sem emoji, sem palavras de marketing genérico (soluções, potencializar, jornada).

Responda SOMENTE com JSON:
{"titulo": "...", "subtitulo": "...", "cta": "...", "sobre": "...", "servicos": [{"titulo": "...", "texto": "..."}], "diferenciais": ["..."], "paleta": "azul"}`;
}

export function montarSite(lead: LeadPerfil & { endereco?: string | null }, raw: string, token = novoToken()): SitePreview {
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    throw new Error("a IA não devolveu o conteúdo do site em JSON");
  }
  const txt = (x: unknown, max = 240) => humanizar(String(x ?? "")).slice(0, max);
  const servicos = (Array.isArray(j.servicos) ? j.servicos : [])
    .slice(0, 3)
    .map((s: { titulo?: unknown; texto?: unknown }) => ({ titulo: txt(s?.titulo, 60), texto: txt(s?.texto, 200) }))
    .filter((s) => s.titulo);
  if (!txt(j.titulo) || servicos.length < 2) throw new Error("conteúdo do site incompleto");
  const paleta = (Object.keys(PALETAS) as Paleta[]).includes(j.paleta as Paleta) ? (j.paleta as Paleta) : "azul";
  return {
    token,
    empresa: nomeCurto(lead.empresa),
    nicho: lead.nicho,
    cidade: lead.cidade,
    endereco: lead.endereco ?? null,
    nota: lead.nota,
    avaliacoes: lead.avaliacoes,
    titulo: txt(j.titulo, 90),
    subtitulo: txt(j.subtitulo, 200),
    cta: txt(j.cta, 30) || "Fale com a gente",
    sobre: txt(j.sobre, 360),
    servicos,
    diferenciais: (Array.isArray(j.diferenciais) ? j.diferenciais : []).slice(0, 3).map((x) => txt(x, 60)).filter(Boolean),
    paleta,
    gerado_em: new Date().toISOString(),
  };
}

export function novoToken() {
  return randomBytes(6).toString("base64url");
}

export async function gerarSite(lead: LeadPerfil & { endereco?: string | null }, tokenAtual?: string | null): Promise<SitePreview> {
  const r = await callLLM({ system: promptSite(lead), messages: [{ role: "user", content: "Escreva o conteúdo." }], maxTokens: 3000, json: true });
  return montarSite(lead, r.message.content ?? "", tokenAtual || novoToken());
}

/** Link público da prévia (fica no app da IA SDR). */
export function linkPrevia(token: string, base = process.env.APP_URL || "https://demandia-sdr.vercel.app") {
  return `${base.replace(/\/$/, "")}/previa/${token}`;
}
