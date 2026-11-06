/** Estúdio · montagem do comando do ffmpeg para o vídeo dos reels (puro, sem rede, para os testes cobrirem). */

const FPS = 30;
const TRANSICAO = 0.4;

/** Argumentos do ffmpeg: zoom leve em cada quadro + transição entre eles + áudio mudo.  */
export function argumentosDoVideo(quadros: string[], duracoes: number[], saida: string): string[] {
  const args: string[] = ["-y"];
  quadros.forEach((q, i) => args.push("-loop", "1", "-t", String(duracoes[i]), "-i", q));
  const total = duracoes.reduce((a, b) => a + b, 0) - TRANSICAO * (quadros.length - 1);
  args.push("-f", "lavfi", "-t", total.toFixed(2), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  const filtros: string[] = [];
  quadros.forEach((_, i) => {
    const frames = Math.round(duracoes[i] * FPS);
    filtros.push(
      `[${i}:v]scale=1188:2112,zoompan=z='min(zoom+0.0006,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${FPS},setsar=1,format=yuv420p[v${i}]`,
    );
  });
  let atual = "v0";
  let offset = 0;
  for (let i = 1; i < quadros.length; i++) {
    offset += duracoes[i - 1] - TRANSICAO;
    const saidaF = i === quadros.length - 1 ? "vout" : `x${i}`;
    filtros.push(`[${atual}][v${i}]xfade=transition=fade:duration=${TRANSICAO}:offset=${offset.toFixed(2)}[${saidaF}]`);
    atual = saidaF;
  }
  if (quadros.length === 1) filtros.push(`[v0]null[vout]`);
  args.push(
    "-filter_complex", filtros.join(";"),
    "-map", "[vout]", "-map", `${quadros.length}:a`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart",
    saida,
  );
  return args;
}

/** Segundos de uma cena a partir do "0-3s" do roteiro (entre 2 e 5). */
export function duracaoDaCena(tempo: string | undefined): number {
  const n = (tempo ?? "").match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
  const d = n ? Number(n[2].replace(",", ".")) - Number(n[1].replace(",", ".")) : 3;
  return Math.min(5, Math.max(2, Number.isFinite(d) && d > 0 ? d : 3));
}
