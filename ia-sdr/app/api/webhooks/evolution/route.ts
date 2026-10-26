/**
 * Webhook do Evolution GO (configurado via POST /instance/connect com webhookUrl):
 *   URL: https://SEU-APP.vercel.app/api/webhooks/evolution?secret=WEBHOOK_SECRET
 *   Evento: MESSAGE
 */
import { waitUntil } from "@vercel/functions";
import { handleInbound } from "@/src/lib/agent.ts";
import { addMessage, logEvent, messageExists, updateLead, upsertLeadByPhone } from "@/src/lib/db.ts";
import { env } from "@/src/lib/env.ts";
import { parseWebhook } from "@/src/lib/evolution.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

const MEDIA_LABEL: Record<string, string> = {
  audioMessage: "[áudio]",
  imageMessage: "[imagem]",
  videoMessage: "[vídeo]",
  documentMessage: "[documento]",
  stickerMessage: "[figurinha]",
  locationMessage: "[localização]",
  contactMessage: "[contato]",
};

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== env.webhookSecret) {
    return new Response("unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const msg = parseWebhook(body);
  if (!msg) return Response.json({ ignored: true });
  if (env.evolutionInstance && msg.instanceName && msg.instanceName !== env.evolutionInstance) {
    return Response.json({ ignored: "outra instância" });
  }
  // Conversa com o próprio Kelvin (avisos da IA) não é lead
  if (env.ownerPhone && msg.phone === env.ownerPhone) return Response.json({ ignored: "owner" });

  // Mensagem enviada pelo nosso número: foi a IA ou o Kelvin respondendo na mão?
  if (msg.fromMe) {
    if (!msg.text) return Response.json({ ok: true });
    // Aviso de novo cadastro que a própria IA mandou para o Kelvin: não é resposta manual
    if (env.alertPhone && msg.phone === env.alertPhone && msg.text.includes("Novo diagnóstico")) return Response.json({ ok: true });
    waitUntil(
      (async () => {
        await new Promise((r) => setTimeout(r, 5000)); // dá tempo da IA registrar o envio dela
        if (await messageExists(msg.id)) return; // foi a IA
        const lead = await upsertLeadByPhone(msg.phone, msg.jid);
        await addMessage({ lead_id: lead.id, direction: "out", author: "humano", content: msg.text!, evolution_message_id: msg.id });
        if (!lead.ai_paused) {
          await updateLead(lead.id, { ai_paused: true, next_followup_at: null });
          await logEvent(lead.id, "handoff_manual");
        }
      })(),
    );
    return Response.json({ ok: true });
  }

  const lead = await upsertLeadByPhone(msg.phone, msg.jid, msg.pushName);
  const content = msg.text ?? MEDIA_LABEL[msg.messageType] ?? `[${msg.messageType}]`;
  const saved = await addMessage({
    lead_id: lead.id,
    direction: "in",
    author: "lead",
    content,
    evolution_message_id: msg.id,
  });
  if (!saved) return Response.json({ duplicate: true });

  // Lead respondeu: zera a sequência de follow-up
  await updateLead(lead.id, {
    last_inbound_at: new Date().toISOString(),
    followup_attempts: 0,
    next_followup_at: null,
    ...(lead.status === "sem_resposta" ? { status: "em_qualificacao" } : {}),
  });

  if (lead.ai_paused || lead.status === "opt_out") return Response.json({ ok: true, ai: "pausada" });

  waitUntil(handleInbound(lead.id, saved.id));
  return Response.json({ ok: true });
}
