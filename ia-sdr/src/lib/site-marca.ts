/**
 * Identidade do cliente para o site de demonstração da Duda (12/11/2026, pedido do Kelvin: "o site não pode
 * ser genérico, tem que ter a logo e as cores do cliente").
 *  - A IA olha a logo (visão) e diz se é mesmo a logo da empresa e quais são as cores principais.
 *  - Logo e fotos vão para o storage (bucket "materiais"): link do Instagram e de site expira ou bloqueia.
 *  - A paleta do site sai das cores da logo (cor de destaque, tom escuro e tom claro), com contraste garantido.
 */
import { db } from "./db.ts";
import { env } from "./env.ts";

export interface CoresMarca {
  cor: string; // destaque (botões, detalhes)
  escura: string; // títulos e faixas escuras
  clara: string; // fundos suaves
  texto_no_destaque: string; // branco ou quase preto, o que tiver mais contraste em cima da cor
  cor2?: string; // segunda cor da logo, para detalhes (anel, estrelas, pontos)
}

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function hexValido(h: unknown): string | null {
  const m = String(h ?? "").trim().match(HEX);
  if (!m) return null;
  const v = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${v.toUpperCase()}`;
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const paraHex = (c: number[]) => `#${c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** Mistura a cor com outra (t = 0 mantém, t = 1 vira a outra). */
export function misturar(h: string, alvo: string, t: number): string {
  const a = rgb(h);
  const b = rgb(alvo);
  return paraHex(a.map((x, i) => x + (b[i] - x) * t));
}

/** Luminância relativa (0 preto, 1 branco), como no WCAG. */
export function luminancia(h: string): number {
  const [r, g, b] = rgb(h).map((x) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const saturacao = (h: string) => {
  const c = rgb(h).map((x) => x / 255);
  const max = Math.max(...c);
  const min = Math.min(...c);
  return max === 0 ? 0 : (max - min) / max;
};

/**
 * Paleta do site a partir das cores da logo. O destaque é a cor principal da marca (a segunda só entra se a
 * principal for neutra). Cor muito clara (amarelo, bege) escurece um pouco; o texto do botão fica branco ou
 * escuro, o que ler melhor. Logo preta e branca vira grafite com detalhe dourado.
 */
export function paletaDaMarca(primaria: string | null, secundaria?: string | null): CoresMarca | null {
  const cores = [hexValido(primaria), hexValido(secundaria)].filter(Boolean) as string[];
  if (!cores.length) return null;
  const viva = (c: string) => saturacao(c) > 0.18 && luminancia(c) > 0.02 && luminancia(c) < 0.92;
  let cor = cores.find(viva) ?? "#B8892E"; // logo neutra (preto, branco, cinza): destaque dourado discreto
  // Botão com texto branco legível: escurece um pouco cor muito clara (laranja claro, amarelo)
  for (let i = 0; i < 8 && contraste(cor, "#FFFFFF") < 3 && luminancia(cor) > 0.12; i++) cor = misturar(cor, "#000000", 0.1);
  const outra = cores.find((c) => c !== hexValido(primaria) && viva(c)) ?? null;
  const jaEscura = cores.find((c) => luminancia(c) < 0.04);
  // Fundo escuro: a cor escura da logo, ou a segunda cor bem escurecida (fica mais elegante que escurecer o destaque)
  const escura = jaEscura ?? misturar(outra ?? cor, "#05060A", 0.76);
  const clara = misturar(cor, "#FFFFFF", 0.9);
  const texto_no_destaque = contraste(cor, "#FFFFFF") >= 2.6 ? "#FFFFFF" : "#111111";
  return { cor, escura, clara, texto_no_destaque, cor2: outra ?? cor };
}

/** Endereços que nunca são a logo da empresa (capa padrão do Canva, ícone embutido, pixel de rastreio). */
export function pareceLogo(url: string | null | undefined): boolean {
  const u = (url ?? "").trim();
  if (!/^https?:\/\//i.test(u)) return false;
  return !/(static\.canva\.com|fb_cover|gravatar|pixel|1x1|spacer|blank\.(png|gif)|placeholder)/i.test(u);
}

/** A IA olha a imagem: é a logo da empresa? Quais as duas cores principais da marca? */
export async function analisarLogo(url: string, empresa: string): Promise<{ e_logo: boolean; primaria: string | null; secundaria: string | null; fundo: "claro" | "escuro" } | null> {
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.openaiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || env.openaiModel,
        response_format: { type: "json_object" },
        max_completion_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Esta imagem deveria ser a logo da empresa "${empresa}". Responda em JSON: {"e_logo": true se for uma logo ou foto de perfil com a marca (não vale foto genérica, capa padrão, ícone de sistema ou imagem quebrada), "primaria": "#RRGGBB" cor principal da marca (ignore o fundo branco ou transparente), "secundaria": "#RRGGBB" segunda cor da marca ou null, "fundo": "escuro" se a logo for branca ou clara e só aparece bem em fundo escuro, senão "claro"}.`,
              },
              { type: "image_url", image_url: { url, detail: "low" } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const o = JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as { e_logo?: boolean; primaria?: string; secundaria?: string; fundo?: string };
    return { e_logo: !!o.e_logo, primaria: hexValido(o.primaria), secundaria: hexValido(o.secundaria), fundo: o.fundo === "escuro" ? "escuro" : "claro" };
  } catch {
    return null;
  }
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif", "image/avif": "avif" };

/** Copia uma imagem da internet para o storage (bucket público "materiais") e devolve o link novo. */
export async function guardarImagem(url: string, caminhoSemExtensao: string): Promise<string | null> {
  try {
    if (url.includes("/storage/v1/object/public/materiais/")) return url; // já está com a gente
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0 (DemandIA)" } });
    if (!r.ok) return null;
    const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!EXT[tipo]) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 300 || buf.length > 6_000_000) return null;
    const caminho = `${caminhoSemExtensao}.${EXT[tipo]}`;
    const up = await db().storage.from("materiais").upload(caminho, buf, { contentType: tipo, upsert: true });
    if (up.error) return null;
    return db().storage.from("materiais").getPublicUrl(caminho).data.publicUrl;
  } catch {
    return null;
  }
}

/**
 * Logo, cores e fotos para o site: guarda a logo (se a IA confirmar que é logo), tira a paleta dela e
 * guarda até 6 fotos (posts do Instagram). Nada disso é obrigatório: sem logo, o site usa a paleta do segmento.
 */
export async function identidadeDoCliente(
  token: string,
  empresa: string,
  logo: string | null | undefined,
  fotos: string[] = [],
  /** Cores medidas pixel a pixel pelo robô do GitHub (marca.cores) e o fundo que a logo pede. */
  medidas?: { primaria?: string | null; secundaria?: string | null; fundo?: "claro" | "escuro" | null } | null,
): Promise<{ logo: string | null; logo_fundo: "claro" | "escuro"; cores: CoresMarca | null; fotos: string[] }> {
  let logoFinal: string | null = null;
  let logo_fundo: "claro" | "escuro" = "claro";
  let cores: CoresMarca | null = null;
  const nossa = (u: string | null | undefined) => !!u && u.includes("/storage/v1/object/public/materiais/");
  if (medidas?.primaria && nossa(logo)) {
    // Logo capturada (print do site, do Instagram ou do Google) e cores medidas na própria imagem
    logoFinal = logo!;
    cores = paletaDaMarca(medidas.primaria, medidas.secundaria ?? null);
    logo_fundo = medidas.fundo === "escuro" ? "escuro" : "claro";
  } else if (pareceLogo(logo)) {
    // Logo que o Kelvin subiu no portal (pasta logos/) vale sempre; a IA só tira as cores
    const manual = /\/storage\/v1\/object\/public\/materiais\/logos\//.test(logo!);
    const guardada = manual ? logo! : await guardarImagem(logo!, `sites/${token}/logo`);
    const olhar = await analisarLogo(guardada ?? logo!, empresa);
    if (manual || olhar?.e_logo) {
      logoFinal = guardada ?? logo!;
      cores = olhar ? paletaDaMarca(olhar.primaria, olhar.secundaria) : null;
      logo_fundo = olhar?.fundo ?? "claro";
    }
  }
  const guardadas: string[] = [];
  for (const [i, f] of fotos.filter((x) => /^https?:\/\//i.test(x)).slice(0, 6).entries()) {
    const u = await guardarImagem(f, `sites/${token}/foto-${i + 1}`);
    if (u) guardadas.push(u);
  }
  return { logo: logoFinal, logo_fundo, cores, fotos: guardadas };
}
