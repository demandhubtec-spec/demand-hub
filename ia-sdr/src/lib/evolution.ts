/**
 * Evolution GO — envio de mensagens e parse do webhook.
 *
 * - Envio: POST {EVOLUTION_API_URL}/send/text, header `apikey` = token da INSTÂNCIA.
 * - Webhook: configurado com POST /instance/connect { webhookUrl, subscribe: ["MESSAGE"] }.
 *   Payload: { event: "Message", data: { Info: {...}, Message: {...} }, instanceId, instanceName, instanceToken }
 */
import { isBlocked } from "./bloqueio.ts";
import { env } from "./env.ts";
import type { MidiaRecebida } from "./midia.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendText(number: string, text: string): Promise<string | null> {
  // Trava final: nunca manda mensagem para número bloqueado (exceto avisos para o Kelvin)
  if (number !== env.alertPhone && number !== env.ownerPhone && isBlocked(number)) {
    console.warn("sendText: número bloqueado, envio cancelado", number);
    return null;
  }
  const res = await fetch(`${env.evolutionUrl}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.evolutionInstanceToken },
    // delay em ms: mostra "digitando..." antes de enviar
    body: JSON.stringify({ number, text, delay: Math.min(1200 + text.length * 25, 4000) }),
  });
  if (!res.ok) throw new Error(`Evolution sendText ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: { Info?: { ID?: string } } };
  return json?.data?.Info?.ID ?? null;
}

/** Para onde enviar: número puro, ou o JID quando o contato usa identificador LID do WhatsApp. */
export function destination(lead: { phone: string; whatsapp_jid: string | null }): string {
  return lead.whatsapp_jid && !lead.whatsapp_jid.endsWith("@s.whatsapp.net") ? lead.whatsapp_jid : lead.phone;
}

/**
 * A IA separa os balões com uma linha em branco. Mandamos um de cada vez,
 * como uma pessoa faria no WhatsApp.
 */
export function splitBubbles(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export async function sendBubbles(
  number: string,
  text: string,
  onSent: (content: string, id: string | null) => Promise<void>,
) {
  for (const bubble of splitBubbles(text)) {
    const id = await sendText(number, bubble);
    await onSent(bubble, id);
    await sleep(400);
  }
}

export interface InboundMessage {
  id: string;
  jid: string;
  phone: string;
  fromMe: boolean;
  pushName?: string;
  text: string | null; // null = mídia que não é texto
  messageType: string; // chave do WhatsApp, ex: conversation, audioMessage, imageMessage
  instanceName?: string;
  /** Outros números reais que o WhatsApp manda junto (quando o chat usa LID). */
  altPhones: string[];
  /** Mídia recebida (o Evolution GO manda o arquivo em base64 junto com a mensagem). */
  media?: MidiaRecebida;
}

function extractText(m: any): string | null {
  const t =
    m?.conversation ??
    m?.extendedTextMessage?.text ??
    m?.imageMessage?.caption ??
    m?.videoMessage?.caption ??
    m?.buttonsResponseMessage?.selectedDisplayText ??
    m?.listResponseMessage?.title ??
    m?.ephemeralMessage?.message?.conversation ??
    m?.ephemeralMessage?.message?.extendedTextMessage?.text ??
    null;
  return typeof t === "string" && t.trim() ? t.trim() : null;
}

function messageKind(m: any): string {
  const keys = Object.keys(m || {}).filter((k) => !["messageContextInfo", "base64", "mediaUrl", "mediaKey"].includes(k));
  return keys[0] || "unknown";
}

const TIPOS: Record<string, MidiaRecebida["tipo"]> = {
  audioMessage: "audio",
  pttMessage: "audio",
  imageMessage: "imagem",
  documentMessage: "documento",
  documentWithCaptionMessage: "documento",
  videoMessage: "video",
  stickerMessage: "figurinha",
};

/** Arquivo que veio junto da mensagem (áudio, imagem, documento), quando o webhook manda o base64. */
export function extractMedia(m: any): MidiaRecebida | undefined {
  const kind = messageKind(m);
  const tipo = TIPOS[kind];
  const b64 = m?.base64 ?? m?.[kind]?.base64;
  if (!tipo || typeof b64 !== "string" || !b64) return undefined;
  const inner = kind === "documentWithCaptionMessage" ? m[kind]?.message?.documentMessage : m[kind];
  const padrao = { audio: "audio/ogg", imagem: "image/jpeg", documento: "application/pdf", video: "video/mp4", figurinha: "image/webp" }[tipo];
  return {
    tipo,
    base64: b64,
    mimetype: String(inner?.mimetype || inner?.Mimetype || padrao),
    nome: inner?.fileName || inner?.FileName || inner?.title || undefined,
    legenda: inner?.caption || null,
  };
}

/** Grupos, comunidades, listas de transmissão, status e canais: a IA nunca responde. */
function ignoredJid(jid: string): boolean {
  return (
    jid.endsWith("@g.us") ||
    jid.includes("@broadcast") ||
    jid.endsWith("@newsletter") ||
    jid.endsWith("@call") ||
    /^\d+-\d+@/.test(jid) // formato antigo de grupo
  );
}

/** Números reais (@s.whatsapp.net) citados em qualquer campo do Info. */
function altPhonesFrom(info: any): string[] {
  const out = new Set<string>();
  for (const v of Object.values(info || {})) {
    if (typeof v === "string" && v.includes("@s.whatsapp.net")) out.add(v.split("@")[0].split(":")[0].replace(/\D/g, ""));
  }
  return [...out].filter(Boolean);
}

/** Converte o payload do webhook. Retorna null para o que deve ser ignorado. */
export function parseWebhook(body: any): InboundMessage | null {
  if (!body || typeof body !== "object") return null;

  // ── Evolution GO
  if (body.event === "Message" && body.data?.Info) {
    const info = body.data.Info;
    const jid: string = String(info.Chat || "");
    if (!info.ID || !jid || info.IsGroup || info.IsBroadcast || ignoredJid(jid)) return null;
    const m = body.data.Message || {};
    return {
      id: String(info.ID),
      jid,
      phone: jid.split("@")[0].split(":")[0].replace(/\D/g, ""),
      fromMe: !!info.IsFromMe,
      pushName: info.PushName || undefined,
      text: extractText(m),
      messageType: messageKind(m),
      instanceName: body.instanceName,
      altPhones: altPhonesFrom(info),
      media: extractMedia(m),
    };
  }

  // ── Evolution API v2 (compatibilidade)
  const event = String(body.event || "").toLowerCase().replace("_", ".");
  if (event !== "messages.upsert") return null;
  const data = Array.isArray(body.data) ? body.data[0] : body.data;
  const key = data?.key;
  if (!key?.remoteJid || !key?.id) return null;
  const jid: string = key.remoteJid;
  if (ignoredJid(jid) || (key.participant && !key.fromMe)) return null;
  const m = data.message || {};
  return {
    id: key.id,
    jid,
    phone: jid.split("@")[0].replace(/\D/g, ""),
    fromMe: !!key.fromMe,
    pushName: data.pushName,
    text: extractText(m),
    messageType: data.messageType || messageKind(m),
    instanceName: body.instance,
    altPhones: [key.remoteJidAlt, key.senderPn].filter(Boolean).map((j: string) => j.split("@")[0].replace(/\D/g, "")),
  };
}
