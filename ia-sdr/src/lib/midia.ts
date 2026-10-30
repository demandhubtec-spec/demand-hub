/**
 * Mídias que o lead manda no WhatsApp (áudio, imagem, documento): a Ana entende o conteúdo
 * em vez de pedir para escrever. Usa a OpenAI (transcrição e leitura de imagem/PDF).
 */
import { env } from "./env.ts";

export interface MidiaRecebida {
  tipo: "audio" | "imagem" | "documento" | "video" | "figurinha";
  base64: string;
  mimetype: string;
  nome?: string;
  legenda?: string | null;
}

const LIMITE = 18 * 1024 * 1024; // ~13 MB de arquivo

function limpo(b64: string) {
  return b64.replace(/^data:[^;]+;base64,/, "");
}

async function transcrever(m: MidiaRecebida): Promise<string | null> {
  const buf = Buffer.from(limpo(m.base64), "base64");
  const ext = m.mimetype.includes("mpeg") ? "mp3" : m.mimetype.includes("mp4") ? "m4a" : m.mimetype.includes("webm") ? "webm" : "ogg"; // webm: áudio gravado no portal
  const form = new FormData();
  form.append("file", new Blob([buf], { type: m.mimetype.split(";")[0] || "audio/ogg" }), `audio.${ext}`);
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  form.append("language", "pt");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.openaiKey}` },
    body: form,
  });
  if (!r.ok) throw new Error(`transcrição ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { text?: string };
  return j.text?.trim() || null;
}

async function ler(m: MidiaRecebida, pedido: string): Promise<string | null> {
  const dado = `data:${m.mimetype.split(";")[0]};base64,${limpo(m.base64)}`;
  const parte =
    m.tipo === "documento"
      ? { type: "file", file: { filename: m.nome || "documento.pdf", file_data: dado } }
      : { type: "image_url", image_url: { url: dado } };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.openaiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || env.openaiModel,
      max_completion_tokens: 600,
      messages: [{ role: "user", content: [{ type: "text", text: pedido }, parte] }],
    }),
  });
  if (!r.ok) throw new Error(`leitura ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * Transforma a mídia em texto para a conversa. Ex.: "[áudio transcrito] Oi Ana, pode mandar".
 * Se não der para interpretar, devolve null e a conversa usa o rótulo simples ("[áudio]").
 */
export async function interpretarMidia(m: MidiaRecebida): Promise<string | null> {
  if (!m.base64 || m.base64.length > LIMITE) return null;
  const legenda = m.legenda ? ` Legenda: "${m.legenda}".` : "";
  try {
    if (m.tipo === "audio") {
      const t = await transcrever(m);
      return t ? `[áudio transcrito] ${t}` : null;
    }
    if (m.tipo === "imagem") {
      const d = await ler(
        m,
        "Descreva em português, em até 3 frases objetivas, o que há nesta imagem enviada por um contato no WhatsApp. Se tiver texto (cartão de visita, print, panfleto, documento), transcreva o essencial: nomes, telefones, e-mails, valores, datas.",
      );
      return d ? `[imagem]${legenda} Conteúdo: ${d}` : null;
    }
    if (m.tipo === "documento" && /pdf/i.test(m.mimetype)) {
      const d = await ler(m, "Resuma em português, em até 4 frases, o que é este documento e as informações principais (nomes, contatos, valores, datas, pedidos).");
      return d ? `[documento: ${m.nome || "PDF"}]${legenda} Resumo: ${d}` : null;
    }
    if (m.tipo === "documento") return `[documento: ${m.nome || "arquivo"}]${legenda}`;
    if (m.tipo === "video") return m.legenda ? `[vídeo] Legenda: "${m.legenda}"` : null;
    return null;
  } catch (e) {
    console.error("interpretarMidia", e);
    return null;
  }
}
