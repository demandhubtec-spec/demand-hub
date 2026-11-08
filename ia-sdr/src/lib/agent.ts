/**
 * O "cérebro" da IA SDR: monta o contexto, chama o modelo (OpenAI) com as ferramentas,
 * executa as ferramentas e envia a resposta pelo WhatsApp.
 */
import { humanizar } from "./estilo.ts";
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
  ultimoEvento,
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
import { avisarFalha, orientacoesPara } from "./canal.ts";
import type { OrigemAnuncio } from "./anuncio.ts";
import {
  contextoPosDemo,
  demoAtiva,
  demoEsgotada,
  ehNumeroDoDono,
  emTesteDoDono,
  mensagensDaDemo,
  promptDemo,
  TOOL_ENCERRAR_DEMO,
  type DemoEncerrada,
  type DemoIniciada,
} from "./demo.ts";

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
  } catch (e) {
    // A resposta não saiu: registra e avisa o Kelvin no canal, para ninguém ficar sem resposta
    const erro = String((e as Error)?.message ?? e).slice(0, 300);
    console.error("Ana não conseguiu responder", leadId, erro);
    await logEvent(leadId, "ia_erro", { erro }).catch(() => null);
    await avisarFalha(leadId, erro).catch(() => null);
  } finally {
    await unlock(leadId);
  }
}

async function reply(leadId: string) {
  let lead = await getLead(leadId);
  // Modo teste do Kelvin: só no número dele e só nos 30 minutos depois de pedir a demo
  const doDono = ehNumeroDoDono(lead.phone);
  const testeIni = doDono ? await ultimoEvento<DemoIniciada>(leadId, "demo_iniciada").catch(() => null) : null;
  if (doDono && !emTesteDoDono(testeIni, new Date())) return;
  if (!doDono && (lead.ai_paused || lead.status === "opt_out" || isBlocked(lead.phone, lead.whatsapp_jid))) return;

  const meeting = await activeMeeting(leadId);
  // Opção C: se o contato veio da prospecção ativa, a Ana continua sabendo disso
  const prospeccao = await prospeccaoDoTelefone(lead.phone).catch(() => null);
  const orientacoes = await orientacoesPara(leadId).catch(() => [] as string[]);
  // Veio de anúncio de WhatsApp? A Ana segue a linha do anúncio a conversa toda
  const anuncio = await ultimoEvento<OrigemAnuncio>(leadId, "origem_anuncio").catch(() => null);
  const hist = await history(leadId);
  // Demo ao vivo da recepcionista (Reels "Comenta DEMO"): enquanto valer, quem responde é ela
  const demoIni = await ultimoEvento<DemoIniciada>(leadId, "demo_iniciada").catch(() => null);
  const demoFim = await ultimoEvento<DemoEncerrada>(leadId, "demo_encerrada").catch(() => null);
  let emDemo = demoAtiva(demoIni, demoFim, new Date()) && (!doDono || emTesteDoDono(demoIni, new Date()));
  let demoAcabouAgora = false;
  if (emDemo && demoIni && demoEsgotada(hist, demoIni)) {
    await logEvent(leadId, "demo_encerrada", { em: new Date().toISOString(), motivo: "limite de mensagens" });
    emDemo = false;
    demoAcabouAgora = true;
  }
  // No teste do Kelvin, só conta o que veio depois do pedido (o histórico dele tem avisos antigos do canal)
  const messages: ChatMessage[] = toChat(
    emDemo && demoIni ? mensagensDaDemo(hist, demoIni) : doDono && testeIni ? mensagensDaDemo(hist, testeIni) : hist,
  );
  if (!messages.length || messages[messages.length - 1].role !== "user") return;
  // Pediu para sair da demo na última mensagem (o webhook já registrou): a Ana faz a virada agora
  if (!emDemo && demoIni && demoFim && Date.now() - new Date(demoFim.em).getTime() < 120_000) demoAcabouAgora = true;

  let finalText = "";
  // A Ana combinou um dia e horário para retomar: o follow-up padrão não pode passar por cima
  let retornoCombinado = false;
  for (let step = 0; step < 6; step++) {
    lead = await getLead(leadId);
    const agora = new Date();
    const res = emDemo && demoIni
      ? await callLLM({
          system: promptDemo(agora, demoIni, mensagensDaDemo(hist, demoIni).filter((m) => m.direction === "in").length),
          messages,
          tools: [TOOL_ENCERRAR_DEMO],
        })
      : await callLLM({
          system: systemPrompt(lead, meeting, agora, prospeccao, orientacoes, anuncio, demoIni ? contextoPosDemo(demoAcabouAgora) : ""),
          messages,
          // encerrar_demo fica na lista para o histórico da virada continuar válido
          tools: demoIni ? [...TOOLS, TOOL_ENCERRAR_DEMO] : TOOLS,
        });
    const msg = res.message;
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });

    if (!msg.tool_calls?.length) {
      finalText = humanizar(msg.content ?? "");
      break;
    }

    for (const call of msg.tool_calls) {
      let out: string;
      if (call.function.name === TOOL_ENCERRAR_DEMO.name) {
        if (emDemo) {
          await logEvent(leadId, "demo_encerrada", { em: new Date().toISOString(), motivo: String(parseArgs(call).motivo ?? "") });
          emDemo = false;
          demoAcabouAgora = true;
          out = "Demo encerrada. Agora quem responde é a Ana: faça a virada para o dono, sem repetir o que a recepcionista já disse.";
        } else {
          out = "A demo já terminou. Siga a conversa normalmente.";
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: out });
        continue;
      }
      try {
        out = await runTool(call.function.name, parseArgs(call), leadId);
        if (call.function.name === "combinar_retorno" && out.startsWith("Retorno guardado")) retornoCombinado = true;
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
  // No teste do Kelvin não tem follow-up
  // (em 06/11 a Ana combinou "domingo à tarde" com um lead e o follow-up jogou para segunda às 8h)
  if (!doDono && !lead.ai_paused && OPEN_STATUSES.includes(lead.status) && !retornoCombinado) {
    patch.followup_attempts = 0;
    patch.next_followup_at = nextFollowUpAt(now, 0)?.toISOString() ?? null;
  }
  await updateLead(leadId, patch);
  await logEvent(leadId, "ia_respondeu", { chars: finalText.length });
}
