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
import { dadosDoAnuncio, type DadosAnuncio } from "./anuncio.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendText(number: string, text: string): Promise<string | null> {
  // Trava final: nunca manda mensagem para número bloqueado (exceto avisos para o Kelvin)
  if (number !== env.alertPhone && number !== env.ownerPhone && isBlocked(number)) {
    console.warn("sendText: número bloqueado, envio cancelado", number);
    return null;
  }
  // delay em ms: mostra "digitando..." antes de enviar
  const body = JSON.stringify({ number, text, delay: Math.min(1200 + text.length * 25, 4000) });
  // Servidor do WhatsApp lento (03/11): uma resposta da Ana se perdeu por falha e outra por "demora = enviado"
  // (a correção da Agrofera não chegou). Agora: demora, 504 ou erro 5xx tenta mais uma vez; se falhar de novo,
  // dá erro (e quem chamou avisa o Kelvin). Só conta como enviada com a confirmação do WhatsApp.
  for (let tentativa = 1; ; tentativa++) {
    let res: Response | null = null;
    let falha = "";
    try {
      res = await fetch(`${env.evolutionUrl}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: env.evolutionInstanceToken },
        body,
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      falha = `${(e as Error)?.name ?? "erro"}: ${String((e as Error)?.message ?? e).slice(0, 120)}`;
    }
    if (res && !res.ok) falha = `${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
    if (falha) {
      if (tentativa < 2) {
        console.warn("sendText: falhou, tentando de novo", number, falha);
        await sleep(4000);
        continue;
      }
      throw new Error(`Evolution sendText ${falha}`);
    }
    if (!res) throw new Error("Evolution sendText: sem resposta");
    const json = (await res.json().catch(() => ({}))) as { data?: { Info?: { ID?: string } } };
    return json?.data?.Info?.ID ?? null;
  }
}

/** Manda um arquivo (PDF) pelo WhatsApp. A URL precisa ser pública (bucket "materiais" do Supabase). */
export async function sendDocument(number: string, url: string, filename: string, caption = ""): Promise<string | null> {
  if (number !== env.alertPhone && number !== env.ownerPhone && isBlocked(number)) {
    console.warn("sendDocument: número bloqueado, envio cancelado", number);
    return null;
  }
  const res = await fetch(`${env.evolutionUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.evolutionInstanceToken },
    body: JSON.stringify({ number, url, type: "document", filename, caption, delay: 1500 }),
  });
  if (!res.ok) throw new Error(`Evolution sendDocument ${res.status}: ${await res.text()}`);
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
  /** Dados do anúncio quando a conversa começou pelo botão de um anúncio (clique para WhatsApp). */
  anuncio?: DadosAnuncio | null;
  /** Cartões de contato compartilhados (ex.: a recepção passando o contato do responsável). */
  contatos?: ContatoCompartilhado[];
}

export interface ContatoCompartilhado {
  nome: string | null;
  telefone: string | null;
}

/** Lê o vCard do cartão de contato: nome e o primeiro telefone (de preferência o do WhatsApp, waid=). */
export function lerVcard(vcard: string | null | undefined, nomePadrao?: string | null): ContatoCompartilhado | null {
  const v = String(vcard ?? "");
  const nome = (v.match(/^FN[^:]*:(.+)$/m)?.[1] ?? nomePadrao ?? "").trim() || null;
  const waid = v.match(/waid=(\d{8,15})/)?.[1];
  const tel = waid ?? v.match(/^(?:item\d+\.)?TEL[^:]*:([+\d\s().-]{8,})$/m)?.[1]?.replace(/\D/g, "");
  if (!nome && !tel) return null;
  return { nome, telefone: tel || null };
}

/** Cartões de contato da mensagem (um ou vários). */
export function extrairContatos(m: any): ContatoCompartilhado[] {
  const um = m?.contactMessage ?? m?.ContactMessage;
  const varios = m?.contactsArrayMessage ?? m?.ContactsArrayMessage;
  const lista: any[] = um ? [um] : Array.isArray(varios?.contacts ?? varios?.Contacts) ? (varios.contacts ?? varios.Contacts) : [];
  return lista
    .map((c) => lerVcard(c?.vcard ?? c?.Vcard, c?.displayName ?? c?.DisplayName))
    .filter((c): c is ContatoCompartilhado => !!c);
}

/** Texto que vai para o histórico no lugar de "[contato]", para a Ana e o Kelvin verem o número. */
export function textoDosContatos(cs: ContatoCompartilhado[]): string | null {
  if (!cs.length) return null;
  return `[contato compartilhado] ${cs.map((c) => [c.nome, c.telefone ? `+${c.telefone}` : null].filter(Boolean).join(" ")).join("; ")}`;
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
      anuncio: dadosDoAnuncio(m),
      contatos: extrairContatos(m),
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
    contatos: extrairContatos(m),
  };
}
