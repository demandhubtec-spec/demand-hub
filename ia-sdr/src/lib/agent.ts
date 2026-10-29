/**
 * O "cérebro" da IA SDR: monta o contexto, chama o modelo (OpenAI) com as ferramentas,
 * executa as ferramentas e envia a resposta pelo WhatsApp.
 */
import { isBlocked } from "./bloqueio.ts";
import { SDR_CONFIG } from "../config/sdr.ts";
import { callLLM, parseArgs, type ChatMessage } from "./llm.ts";
import { toChat } from "./chat.ts";
import {
  activeMeeting,
  addMessage,
  getLead,
  history,
  latestInboundId,
  logEvent,
  tryLock,
  unlock,
  updateLead,
} from "./db.ts";
import { destination, sendBubbles } from "./evolution.ts";
import { nextFollowUpAt } from "./followup.ts";
import { systemPrompt } from "./prompt.ts";
import { prospeccaoDoTelefone } from "./prospeccao.ts";
import { runTool, TOOLS } from "./tools.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OPEN_STATUSES = ["novo", "em_qualificacao", "qualificado"];

/**
 * Chamado após cada mensagem recebida. Espera alguns segundos para agrupar
 * mensagens seguidas e só responde se esta ainda for a última mensagem do lead.
 */
export async function handleInbound(leadId: string, messageId: string) {
  await sleep(SDR_CONFIG.debounceMs);
  if ((await latestInboundId(leadId)) !== messageId) return; // chegou mensagem mais nova: ela responde

  if (!(await tryLock(leadId))) return; // outra execução já está respondendo
  try {
    // Responde; se chegar mensagem nova enquanto respondia, responde de novo (até 3x)
    for (let round = 0; round < 3; round++) {
      const before = await latestInboundId(leadId);
      await reply(leadId);
      if ((await latestInboundId(leadId)) === before) break;
    }
  } finally {
    await unlock(leadId);
  }
}

async function reply(leadId: string) {
  let lead = await getLead(leadId);
  if (lead.ai_paused || lead.status === "opt_out" || isBlocked(lead.phone, lead.whatsapp_jid)) return;

  const meeting = await activeMeeting(leadId);
  // Opção C: se o contato veio da prospecção ativa, a Ana continua sabendo disso
  const prospeccao = await prospeccaoDoTelefone(lead.phone).catch(() => null);
  const messages: ChatMessage[] = toChat(await history(leadId));
  if (!messages.length || messages[messages.length - 1].role !== "user") return;

  let finalText = "";
  for (let step = 0; step < 6; step++) {
    lead = await getLead(leadId);
    const res = await callLLM({
      system: systemPrompt(lead, meeting, new Date(), prospeccao),
      messages,
      tools: TOOLS,
    });
    const msg = res.message;
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });

    if (!msg.tool_calls?.length) {
      finalText = (msg.content ?? "").trim();
      break;
    }

    for (const call of msg.tool_calls) {
      let out: string;
      try {
        out = await runTool(call.function.name, parseArgs(call), leadId);
      } catch (e) {
        console.error(`Erro na ferramenta ${call.function.name}:`, e);
        out = `Erro ao executar ${call.function.name}. Siga a conversa sem essa ação ou use encaminhar_humano.`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: out });
    }
  }

  if (!finalText) return;

  lead = await getLead(leadId);
  // Se a IA pausou a si mesma (handoff) ela ainda manda a mensagem de transição.
  await sendBubbles(destination(lead), finalText, async (content, id) => {
    await addMessage({ lead_id: leadId, direction: "out", author: "ia", content, evolution_message_id: id });
  });

  const now = new Date();
  const patch: Record<string, unknown> = { last_outbound_at: now.toISOString() };
  if (lead.status === "novo") patch.status = "em_qualificacao";
  // Agenda o primeiro follow-up caso o lead não responda
  if (!lead.ai_paused && OPEN_STATUSES.includes(lead.status)) {
    patch.followup_attempts = 0;
    patch.next_followup_at = nextFollowUpAt(now, 0)?.toISOString() ?? null;
  }
  await updateLead(leadId, patch);
  await logEvent(leadId, "ia_respondeu", { chars: finalText.length });
}
