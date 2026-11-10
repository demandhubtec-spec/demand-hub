/**
 * Estúdio · fotos geradas pelo ChatGPT (API de imagens da OpenAI, mesma chave do resto do sistema).
 * A copy traz a cena de cada lâmina/cena ("foto"); aqui ela vira uma foto realista, sem texto, no clima da marca.
 * Se nenhuma foto sair (limite, conta sem acesso ao modelo), a peça não vai para o Kelvin: o erro aparece no chat do time e na pauta.
 *
 * Fotos que o Kelvin faz no ChatGPT dele e sobe no portal (foto_url na copy) têm prioridade e nunca são trocadas.
 *
 * Modelo: tenta o OPENAI_IMAGE_MODEL (se estiver na Vercel) e depois gpt-image-2, gpt-image-1.5, gpt-image-1 e gpt-image-1-mini,
 * guardando o primeiro que a conta aceitar (em 09/11 a conta respondeu que o gpt-image-1 "não existe").
 * Qualidade: OPENAI_IMAGE_QUALITY (low, medium, high; padrão medium). Chave própria das fotos: OPENAI_IMAGE_KEY (opcional).
 */
import { env } from "../env.ts";
import type { Copy, CopyCarrossel, CopyReels } from "./ia.ts";

export type Formato = "retrato" | "vertical";

/** Fotos que o Kelvin fez no ChatGPT dele e subiu no portal (índice da lâmina/cena → link). Têm prioridade sobre a geração. */
export function fotosManuais(copy: Copy): Map<number, string> {
  const itens = ((copy as CopyCarrossel).slides ?? (copy as CopyReels).cenas ?? []) as { foto_url?: string }[];
  const m = new Map<number, string>();
  itens.forEach((x, i) => x?.foto_url && m.set(i, x.foto_url));
  return m;
}

/** Cenas das fotos de cada lâmina/cena. Copy antiga (sem "foto") ganha cenas tiradas do próprio texto. */
export function cenasDasFotos(copy: Copy, formato: "carrossel" | "reels" | "estatico"): (string | null)[] {
  if (formato === "reels") {
    const cenas = ((copy as CopyReels).cenas ?? []).filter((x) => x.texto_tela?.trim()).slice(0, 10);
    return cenas.map((c, i) => c.foto?.trim() || (i === 0 || i % 2 === 1 ? `cena real que represente: "${c.texto_tela.replace(/\*/g, "")}", numa clínica ou pequeno negócio brasileiro` : null));
  }
  const slides = ((copy as CopyCarrossel).slides ?? []).filter((x) => x.titulo).slice(0, 10);
  const comFoto = new Set([0, 1, 3, 5, slides.length - 1]);
  return slides.map((sl, i) => sl.foto?.trim() || (comFoto.has(i) ? `cena real que represente: "${`${sl.titulo} ${sl.texto ?? ""}`.replace(/\*/g, "").trim()}", numa clínica ou pequeno negócio brasileiro` : null));
}

/** Prompt final: a cena da copy + o padrão de foto da DemandIA. Puro, para os testes cobrirem. */
export function promptDaFoto(cena: string, formato: Formato, comReferencia = false): string {
  return [
    comReferencia
      ? "As imagens enviadas são referências de posts que funcionaram: siga o estilo delas (enquadramento, luz, clima, tipo de cena), mas crie pessoas, lugar e composição novos. Não copie rostos, textos nem logos."
      : "",
    `Fotografia realista, estilo editorial de revista de negócios brasileira: ${cena.trim().replace(/\s+/g, " ")}.`,
    "Pessoas brasileiras reais, naturais, com textura de pele e expressão verdadeira; roupas e ambiente do dia a dia de clínicas, academias e pequenos negócios do Brasil.",
    "Câmera full frame, lente 50 mm, profundidade de campo rasa, luz natural suave, cores reais com um toque de luz roxa e violeta no ambiente (cores da marca).",
    formato === "vertical"
      ? "Enquadramento vertical 9:16 com espaço livre no terço de baixo para texto."
      : "Enquadramento vertical 2:3 com o assunto principal no centro e espaço livre na parte de baixo para texto.",
    "Sem nenhum texto, letra, número, logotipo ou marca d'água na imagem. Nada de ilustração, 3D, robô ou aparência de imagem de IA.",
  ]
    .filter(Boolean)
    .join(" ");
}

const qualidade = () => process.env.OPENAI_IMAGE_QUALITY || "medium";
let modeloQueFunciona: string | null = null;

/** Modelos de imagem, na ordem: o que já funcionou, o da Vercel e os atuais da OpenAI. */
export function modelosDeImagem(daVercel = process.env.OPENAI_IMAGE_MODEL, ok = modeloQueFunciona): string[] {
  return [...new Set([ok, daVercel, "gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"].filter(Boolean) as string[])];
}

/** A conta não tem esse modelo (ou ele saiu do ar)? Aí tenta o próximo. */
export const semModelo = (status: number, corpo: string) =>
  status === 404 || ((status === 400 || status === 403) && /model|does not exist|not found|verif/i.test(corpo));

class ErroModelo extends Error {}

async function lerResposta(r: Response): Promise<string> {
  if (!r.ok) {
    const corpo = (await r.text()).slice(0, 300);
    if (semModelo(r.status, corpo)) throw new ErroModelo(`OpenAI imagem ${r.status}: ${corpo}`);
    throw new Error(`OpenAI imagem ${r.status}: ${corpo}`);
  }
  const j = (await r.json()) as { data?: { b64_json?: string }[] };
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI imagem: resposta sem foto");
  return `data:image/jpeg;base64,${b64}`;
}

/**
 * Gera uma foto (modelo de imagem do ChatGPT) e devolve como data URL (JPEG), pronta para a arte.
 * Com referências, manda as imagens dos posts de referência junto para a foto seguir o estilo delas.
 */
export async function gerarFoto(cena: string, formato: Formato = "retrato", referencias: Blob[] = []): Promise<string> {
  let ultimo: unknown = null;
  for (const m of modelosDeImagem()) {
    try {
      const foto = await gerarFotoCom(m, cena, formato, referencias);
      modeloQueFunciona = m;
      return foto;
    } catch (e) {
      ultimo = e;
      if (!(e instanceof ErroModelo)) throw e;
    }
  }
  throw new Error(
    `nenhum modelo de imagem liberado nesta chave da OpenAI (${modelosDeImagem().join(", ")}). Pode ser preciso verificar a organização em platform.openai.com > Settings > Organization. Último erro: ${String((ultimo as Error)?.message ?? ultimo).slice(0, 160)}`,
  );
}

async function gerarFotoCom(modelo: string, cena: string, formato: Formato, referencias: Blob[]): Promise<string> {
  // Chave só das fotos (conta do Kelvin na OpenAI), se estiver na Vercel; senão a chave de sempre
  const h = { Authorization: `Bearer ${process.env.OPENAI_IMAGE_KEY || env.openaiKey}` };
  if (referencias.length) {
    try {
      const f = new FormData();
      f.append("model", modelo);
      f.append("prompt", promptDaFoto(cena, formato, true));
      f.append("size", "1024x1536");
      f.append("quality", qualidade());
      f.append("output_format", "jpeg");
      f.append("n", "1");
      referencias.forEach((b, i) => f.append("image[]", b, `referencia-${i + 1}.jpg`));
      return await lerResposta(await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: h, body: f, signal: AbortSignal.timeout(170_000) }));
    } catch (e) {
      if (e instanceof ErroModelo) throw e;
      console.error("Estúdio: foto com referência falhou, gerando sem referência", e);
    }
  }
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelo, prompt: promptDaFoto(cena, formato), size: "1024x1536", quality: qualidade(), output_format: "jpeg", output_compression: 85, n: 1 }),
    signal: AbortSignal.timeout(150_000),
  });
  return lerResposta(r);
}

/** Baixa as imagens de referência (no máximo 2, até 8 MB cada). */
export async function baixarReferencias(urls: string[]): Promise<Blob[]> {
  const out: Blob[] = [];
  for (const u of urls.slice(0, 2)) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) continue;
      const b = await r.blob();
      if (b.size > 0 && b.size < 8_000_000) out.push(new Blob([await b.arrayBuffer()], { type: b.type || "image/jpeg" }));
    } catch {
      /* referência fora do ar: segue sem ela */
    }
  }
  return out;
}

/** Foto que o Kelvin subiu (link público) em data URL, para a arte. */
async function baixarComoDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    return `data:${r.headers.get("content-type") || "image/jpeg"};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Gera as fotos de várias cenas ao mesmo tempo (até `limite`). Devolve um mapa índice → foto
 * e a primeira mensagem de erro, se alguma falhou.
 */
export async function gerarFotos(
  cenas: (string | undefined | null)[],
  formato: Formato,
  limite = 5,
  opts: { referencias?: Blob[]; manuais?: Map<number, string> } = {},
): Promise<{ fotos: Map<number, string>; erro: string | null }> {
  const fotos = new Map<number, string>();
  // Primeiro as fotos que o Kelvin fez no ChatGPT dele: essas nunca são trocadas
  for (const [i, url] of opts.manuais ?? []) {
    const d = await baixarComoDataUrl(url);
    if (d) fotos.set(i, d);
  }
  const pedidos = cenas
    .map((c, i) => ({ i, c: (c ?? "").trim() }))
    .filter((x) => x.c.length >= 8 && !fotos.has(x.i))
    .slice(0, limite);
  let erro: string | null = null;
  await Promise.all(
    pedidos.map(async ({ i, c }) => {
      try {
        fotos.set(i, await gerarFoto(c, formato, opts.referencias ?? []));
      } catch (e) {
        erro ??= String((e as Error).message);
      }
    }),
  );
  return { fotos, erro };
}
