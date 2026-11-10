/**
 * Narração do reels: a fala de cada cena vira voz (OpenAI, a mesma chave das fotos), sobe no bucket "estudio"
 * e volta com a duração, para a cena durar o tempo da fala. Se a voz falhar, o vídeo sai só com o texto na tela.
 */
import { db } from "../../ia-sdr/src/lib/db.ts";

const INSTRUCOES =
  "Fale em português do Brasil, com sotaque neutro. Tom de anúncio de rede social: confiante, próximo e animado, sem exagero. Ritmo ágil, pausas curtas entre as frases.";

/** Duração de um WAV PCM pelo cabeçalho (bytes por segundo) e pelo tamanho real dos dados. */
export function segundosDoWav(wav: Buffer): number {
  const byteRate = wav.readUInt32LE(28);
  const dados = wav.indexOf("data");
  if (!byteRate || dados < 0) return 0;
  return (wav.length - (dados + 8)) / byteRate;
}

/**
 * Deixa a voz no volume de rede social: leva o volume médio para perto de -18 dB (fala clara no celular),
 * sem passar do teto (nada estoura). Só mexe em WAV de 16 bits, que é o que a OpenAI devolve.
 */
export function normalizarWav(wav: Buffer, alvo = 0.12, teto = 0.97): Buffer {
  const dados = wav.indexOf("data");
  if (dados < 0 || wav.readUInt16LE(34) !== 16) return wav;
  const ini = dados + 8;
  const n = Math.floor((wav.length - ini) / 2);
  if (n < 100) return wav;
  let soma = 0;
  let pico = 0;
  for (let i = 0; i < n; i++) {
    const v = wav.readInt16LE(ini + i * 2) / 32768;
    soma += v * v;
    if (Math.abs(v) > pico) pico = Math.abs(v);
  }
  const rms = Math.sqrt(soma / n);
  if (!rms || !pico) return wav;
  const ganho = Math.min(alvo / rms, teto / pico);
  if (ganho <= 1.05) return wav;
  const out = Buffer.from(wav);
  for (let i = 0; i < n; i++) {
    const v = Math.round(wav.readInt16LE(ini + i * 2) * ganho);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), ini + i * 2);
  }
  return out;
}

async function falar(texto: string): Promise<Buffer> {
  const chave = process.env.OPENAI_IMAGE_KEY || process.env.OPENAI_API_KEY;
  const tentativas = [
    { model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice: process.env.OPENAI_TTS_VOZ || "coral", instructions: INSTRUCOES },
    { model: "tts-1-hd", voice: "nova" },
    { model: "tts-1", voice: "nova" },
  ];
  let ultimo = "";
  for (const t of tentativas) {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...t, input: texto, response_format: "wav" }),
      signal: AbortSignal.timeout(60_000),
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    ultimo = `${r.status}: ${(await r.text()).slice(0, 160)}`;
  }
  throw new Error(`voz indisponível (${ultimo})`);
}

/** Narra uma fala e devolve o link público e quantos segundos ela dura. */
export async function narrar(texto: string, nome: string): Promise<{ url: string; segundos: number } | null> {
  const limpo = texto.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (!limpo) return null;
  try {
    const wav = normalizarWav(await falar(limpo));
    const caminho = `audio/${nome}.wav`;
    const { error } = await db().storage.from("estudio").upload(caminho, wav, { contentType: "audio/wav", upsert: true });
    if (error) throw new Error(error.message);
    return { url: db().storage.from("estudio").getPublicUrl(caminho).data.publicUrl, segundos: segundosDoWav(wav) };
  } catch (e) {
    console.error("Narração falhou:", String((e as Error).message ?? e).slice(0, 200));
    return null;
  }
}
