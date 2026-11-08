/**
 * Estúdio · fotos geradas pelo ChatGPT (API de imagens da OpenAI, mesma chave do resto do sistema).
 * A copy traz a cena de cada lâmina/cena ("foto"); aqui ela vira uma foto realista, sem texto, no clima da marca.
 * Se a geração falhar (limite, conta sem acesso ao modelo), a peça sai sem foto e o erro aparece no chat do time.
 *
 * Ajustes opcionais na Vercel: OPENAI_IMAGE_MODEL (padrão gpt-image-1) e OPENAI_IMAGE_QUALITY (low, medium, high; padrão medium).
 */
import { env } from "../env.ts";
import type { Copy, CopyCarrossel, CopyReels } from "./ia.ts";

export type Formato = "retrato" | "vertical";

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
export function promptDaFoto(cena: string, formato: Formato): string {
  return [
    `Fotografia realista, estilo editorial de revista de negócios brasileira: ${cena.trim().replace(/\s+/g, " ")}.`,
    "Pessoas brasileiras reais, naturais, com textura de pele e expressão verdadeira; roupas e ambiente do dia a dia de clínicas, academias e pequenos negócios do Brasil.",
    "Câmera full frame, lente 50 mm, profundidade de campo rasa, luz natural suave, cores reais com um toque de luz roxa e violeta no ambiente (cores da marca).",
    formato === "vertical"
      ? "Enquadramento vertical 9:16 com espaço livre no terço de baixo para texto."
      : "Enquadramento vertical 2:3 com o assunto principal no centro e espaço livre na parte de baixo para texto.",
    "Sem nenhum texto, letra, número, logotipo ou marca d'água na imagem. Nada de ilustração, 3D, robô ou aparência de imagem de IA.",
  ].join(" ");
}

/** Gera uma foto e devolve como data URL (JPEG), pronta para a arte. Lança erro com a mensagem da OpenAI. */
export async function gerarFoto(cena: string, formato: Formato = "retrato"): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.openaiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: promptDaFoto(cena, formato),
      size: "1024x1536",
      quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
      output_format: "jpeg",
      output_compression: 85,
      n: 1,
    }),
    signal: AbortSignal.timeout(150_000),
  });
  if (!r.ok) throw new Error(`OpenAI imagem ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { data?: { b64_json?: string }[] };
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI imagem: resposta sem foto");
  return `data:image/jpeg;base64,${b64}`;
}

/**
 * Gera as fotos de várias cenas ao mesmo tempo (até `limite`). Devolve um mapa índice → foto
 * e a primeira mensagem de erro, se alguma falhou.
 */
export async function gerarFotos(cenas: (string | undefined | null)[], formato: Formato, limite = 5): Promise<{ fotos: Map<number, string>; erro: string | null }> {
  const pedidos = cenas
    .map((c, i) => ({ i, c: (c ?? "").trim() }))
    .filter((x) => x.c.length >= 8)
    .slice(0, limite);
  const fotos = new Map<number, string>();
  let erro: string | null = null;
  await Promise.all(
    pedidos.map(async ({ i, c }) => {
      try {
        fotos.set(i, await gerarFoto(c, formato));
      } catch (e) {
        erro ??= String((e as Error).message);
      }
    }),
  );
  return { fotos, erro };
}
