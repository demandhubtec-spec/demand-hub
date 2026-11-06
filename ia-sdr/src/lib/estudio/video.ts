/**
 * Estúdio · vídeo dos reels montado pelo sistema: cada cena do roteiro vira um quadro 1080×1920 no visual
 * da marca, com zoom leve e transição suave entre as cenas, e uma faixa de áudio silenciosa (o Instagram
 * aceita melhor vídeo com áudio). Sobe o MP4 e a capa no bucket público "estudio".
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../db.ts";
import { imagensReels } from "./arte.tsx";
import type { CopyReels } from "./ia.ts";
import { argumentosDoVideo } from "./video-args.ts";


async function caminhoFfmpeg(): Promise<string> {
  const m = (await import("ffmpeg-static")) as unknown as { default?: string | null };
  const p = m.default ?? (m as unknown as string);
  if (!p || typeof p !== "string") throw new Error("ffmpeg indisponível no servidor");
  return p;
}

function rodar(bin: string, args: string[]): Promise<void> {
  return new Promise((ok, falha) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err = (err + String(d)).slice(-2000)));
    p.on("error", falha);
    p.on("close", (code) => (code === 0 ? ok() : falha(new Error(`ffmpeg saiu com ${code}: ${err.slice(-400)}`))));
  });
}

/** Monta o MP4 do reels a partir do roteiro aprovado. */
export async function videoDoReels(c: CopyReels, palavra: string | null): Promise<{ video: Buffer; capa: Buffer }> {
  const { quadros, duracoes, capa } = await imagensReels(c, palavra);
  const pasta = await mkdtemp(join(tmpdir(), "reels-"));
  try {
    const arquivos: string[] = [];
    for (let i = 0; i < quadros.length; i++) {
      const f = join(pasta, `q${String(i).padStart(2, "0")}.png`);
      await writeFile(f, quadros[i]);
      arquivos.push(f);
    }
    const saida = join(pasta, "reels.mp4");
    await rodar(await caminhoFfmpeg(), argumentosDoVideo(arquivos, duracoes, saida));
    return { video: await readFile(saida), capa };
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => null);
  }
}

/** Sobe o vídeo e a capa; devolve [vídeo, capa] (o Publicador acha cada um pela extensão). */
export async function subirVideo(pautaId: string, versao: number, video: Buffer, capa: Buffer): Promise<string[]> {
  const sobe = async (nome: string, corpo: Buffer, tipo: string) => {
    const caminho = `pautas/${pautaId}/v${versao}-${nome}`;
    const { error } = await db().storage.from("estudio").upload(caminho, corpo, { contentType: tipo, upsert: true });
    if (error) throw new Error(`upload do vídeo: ${error.message}`);
    return db().storage.from("estudio").getPublicUrl(caminho).data.publicUrl;
  };
  return [await sobe("reels.mp4", video, "video/mp4"), await sobe("capa.png", capa, "image/png")];
}
