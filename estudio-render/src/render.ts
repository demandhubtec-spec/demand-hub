/**
 * Monta as peças com o Remotion (Chrome sem tela): lâminas PNG do carrossel e o MP4 do reels.
 * O pacote do Remotion é montado uma vez por rodada e reaproveitado em todas as peças.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PropsLamina, PropsReels } from "./remotion/tipos.ts";

// Roda sempre de dentro da pasta estudio-render (npm run rodar)
const aqui = join(process.cwd(), "src");
let pacote: Promise<string> | null = null;
const navegador = () => process.env.REMOTION_CHROME || undefined;

/** Fontes padrão (Anton e Inter) vão na pasta pública do pacote. */
async function prepararPublico(): Promise<string> {
  const pub = join(aqui, "..", "public");
  await mkdir(join(pub, "fontes"), { recursive: true });
  const nm = join(aqui, "..", "node_modules", "@fontsource");
  await copyFile(join(nm, "anton", "files", "anton-latin-400-normal.woff2"), join(pub, "fontes", "anton-latin-400-normal.woff2"));
  for (const peso of [400, 600, 700, 800]) await copyFile(join(nm, "inter", "files", `inter-latin-${peso}-normal.woff2`), join(pub, "fontes", `inter-latin-${peso}-normal.woff2`));
  return pub;
}

function servir(): Promise<string> {
  pacote ??= prepararPublico().then((publicDir) => bundle({ entryPoint: join(aqui, "remotion", "index.tsx"), publicDir }));
  return pacote;
}

async function temporaria<T>(fn: (pasta: string) => Promise<T>): Promise<T> {
  const pasta = await mkdtemp(join(tmpdir(), "estudio-"));
  try {
    return await fn(pasta);
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => null);
  }
}

export async function renderLamina(props: PropsLamina): Promise<Buffer> {
  const serveUrl = await servir();
  const composition = await selectComposition({ serveUrl, id: "Lamina", inputProps: props as unknown as Record<string, unknown>, browserExecutable: navegador() });
  return temporaria(async (pasta) => {
    const output = join(pasta, "lamina.png");
    await renderStill({ serveUrl, composition, output, inputProps: props as unknown as Record<string, unknown>, browserExecutable: navegador(), imageFormat: "png", timeoutInMilliseconds: 120_000 });
    return readFile(output);
  });
}

export async function renderReels(props: PropsReels): Promise<{ video: Buffer; capa: Buffer }> {
  const serveUrl = await servir();
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "Reels", inputProps, browserExecutable: navegador() });
  return temporaria(async (pasta) => {
    const saida = join(pasta, "reels.mp4");
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      crf: 20,
      outputLocation: saida,
      enforceAudioTrack: true, // faixa de áudio silenciosa: o Instagram aceita melhor
      browserExecutable: navegador(),
      timeoutInMilliseconds: 180_000,
      concurrency: 2,
    });
    const capaArq = join(pasta, "capa.png");
    await renderStill({ serveUrl, composition, output: capaArq, inputProps, frame: Math.min(45, composition.durationInFrames - 1), browserExecutable: navegador(), imageFormat: "png" });
    return { video: await readFile(saida), capa: await readFile(capaArq) };
  });
}
