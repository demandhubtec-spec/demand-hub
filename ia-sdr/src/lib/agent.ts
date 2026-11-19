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
import { nextFollowUpAt, PROSPECCAO_V2 } from "./followup.ts";
import { systemPrompt } from "./prompt.ts";
import { ehFluxoV2, prospeccaoDoTelefone, temSiteProprio } from "./prospeccao.ts";
import { encerrarLead, runTool, TOOLS } from "./tools.ts";
import { aplicarTravasDeTexto, deveCalarComRobo, dizQueEnviouDiagnostico, faltaLinkDoModelo, linkDoModeloNaFerramenta, semApresentacaoRepetida, semPromessaDeConvite, semReapresentacao, situacaoDaRecusa } from "./travas.ts";
import { linkPrevia } from "./extras.ts";
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
    // 17/11: AMG, Inset Clean, Said & Said e Service Ar ficaram sem resposta (IA sem crédito, WhatsApp lento).
    // Tenta de novo sozinha em 10 minutos pelo follow-up, que responde ao que a pessoa disse.
    await updateLead(leadId, { next_followup_at: new Date(Date.now() + 10 * 60e3).toISOString() }).catch(() => null);
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
  // 18/11: robô ou atendente virtual do outro lado e a SDR já mandou o recado: espera uma pessoa escrever
  if (!emDemo && !doDono && deveCalarComRobo(hist)) {
    await logEvent(leadId, "robo_ignorado", { ultima: String(hist[hist.length - 1]?.content ?? "").slice(0, 120) }).catch(() => null);
    return;
  }
  // Pediu para sair da demo na última mensagem (o webhook já registrou): a Ana faz a virada agora
  if (!emDemo && demoIni && demoFim && Date.now() - new Date(demoFim.em).getTime() < 120_000) demoAcabouAgora = true;

  // Trava 4 (16/11): o lead disse "não". Uma pergunta leve é permitida; no segundo "não", só agradece e encerra.
  const recusa = !emDemo && !doDono ? situacaoDaRecusa(hist) : { ultimaFoiRecusa: false, recusas: 0, semRespostaDepoisDoNao: false };
  const avisoRecusa = recusa.ultimaFoiRecusa
    ? recusa.recusas >= 2
      ? "\n\n## ATENÇÃO: recusa repetida\nO lead já disse mais de uma vez que não tem interesse. Agradeça com carinho em UMA frase curta, deixe a porta aberta, NÃO faça pergunta nenhuma e chame encerrar_contato com motivo \"desqualificado\" (ou \"opt_out\" se pediu para não mandar mais mensagem)."
      : "\n\n## ATENÇÃO: o lead acabou de dizer que não tem interesse\nAcolha e faça no máximo UMA pergunta leve (o que pesa mais: o momento ou já têm alguém cuidando). Não ofereça horário, não mande diagnóstico e não insista. Se ele pediu para não mandar mais mensagem, agradeça e chame encerrar_contato com motivo \"opt_out\"."
    : "";

  let finalText = "";
  // Travas 2 e 3 (16/11): o que a ferramenta do diagnóstico fez nesta resposta
  let diagChamado = false;
  let linkModelo: string | null = null;
  let reescreveuEnvio = false;
  // A Ana combinou um dia e horário para retomar: o follow-up padrão não pode passar por cima
  let retornoCombinado = false;
  let semConvite = false;
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
          system: systemPrompt(lead, meeting, agora, prospeccao, orientacoes, anuncio, (demoIni ? contextoPosDemo(demoAcabouAgora) : "") + avisoRecusa),
          messages,
          // encerrar_demo fica na lista para o histórico da virada continuar válido
          tools: demoIni ? [...TOOLS, TOOL_ENCERRAR_DEMO] : TOOLS,
        });
    const msg = res.message;
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });

    if (!msg.tool_calls?.length) {
      const texto = humanizar(msg.content ?? "");
      // Trava 3: disse que mandou o diagnóstico sem chamar a ferramenta → o sistema chama antes de mandar o texto
      if (!emDemo && prospeccao && !diagChamado && !reescreveuEnvio && dizQueEnviouDiagnostico(texto)) {
        diagChamado = true;
        let out = "";
        try {
          out = await runTool("enviar_diagnostico", {}, leadId);
        } catch (e) {
          console.error("trava do diagnóstico: envio falhou", e);
        }
        if (out.startsWith("PDF enviado") || out.includes("já foi enviado")) {
          linkModelo = linkDoModeloNaFerramenta(out);
          await logEvent(leadId, "trava_diagnostico", { acao: "enviou_antes_do_texto" });
          finalText = texto;
          break;
        }
        // Não deu para mandar: pede para reescrever sem dizer que enviou
        reescreveuEnvio = true;
        await logEvent(leadId, "trava_diagnostico", { acao: "reescrever", motivo: out.slice(0, 160) });
        messages.push({ role: "user", content: `[Sistema: sua mensagem diz que o diagnóstico foi enviado, mas ele NÃO foi. ${out || "O envio falhou."} Reescreva a resposta sem dizer que enviou nem que separou.]` });
        continue;
      }
      finalText = texto;
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
        if (call.function.name === "agendar_reuniao" && out.includes("NÃO foi enviado")) semConvite = true;
        if (call.function.name === "enviar_diagnostico") {
          diagChamado = true;
          linkModelo = linkDoModeloNaFerramenta(out) ?? linkModelo;
        }
      } catch (e) {
        console.error(`Erro na ferramenta ${call.function.name}:`, e);
        // 18/11 (Pizza do Crispim): o PDF não saiu e a Gabi parou para pedir orientação ao Kelvin
        out = call.function.name === "enviar_diagnostico"
          ? "O PDF não saiu agora (WhatsApp instável). Não diga que enviou nem que separou. Se o lead ainda não aceitou, pergunte se pode mandar o diagnóstico por aqui; se já aceitou, diga que manda em instantes. Não peça orientação por isso."
          : `Erro ao executar ${call.function.name}. Siga a conversa sem essa ação ou use encaminhar_humano.`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: out });
    }
  }

  if (!finalText) return;

  // Trava 1 (e detalhes): saudação pela hora certa, sem "querida", sem letra de outro alfabeto
  if (!emDemo) finalText = aplicarTravasDeTexto(finalText, new Date());
  // 17/11: já está conversando (mensagem nossa nas últimas 6 horas): nada de se apresentar de novo
  const jaConversando = hist.some((m) => m.direction === "out" && m.author === "ia" && m.kind !== "followup" && Date.now() - new Date(m.created_at).getTime() < 6 * 3600e3);
  if (!emDemo) finalText = semReapresentacao(finalText, jaConversando);
  // 18/11 (Geremias): a agenda falhou e mesmo assim ela disse que o convite ia chegar no e-mail
  if (semConvite) finalText = semPromessaDeConvite(finalText);
  // 18/11: já se apresentou nesta conversa (48 horas): nada de "Aqui é a Gabi, da DemandIA" de novo
  const jaSeApresentou = hist.some((m) => m.direction === "out" && m.author !== "sistema" && /aqui (é|e) a (gabi|marina),? da demandia/i.test(m.content ?? "") && Date.now() - new Date(m.created_at).getTime() < 48 * 3600e3);
  if (!emDemo && prospeccao) finalText = semApresentacaoRepetida(finalText, jaSeApresentou);
  // Trava 2: falou do modelo de site (ou acabou de mandar o diagnóstico de quem não tem site) e o link não foi junto
  if (!emDemo && prospeccao) {
    const link = linkModelo ?? (!temSiteProprio(prospeccao) && prospeccao.site_preview?.token ? linkPrevia(prospeccao.site_preview.token) : null);
    const jaMandado = hist.filter((m) => m.direction === "out").map((m) => m.content);
    if (faltaLinkDoModelo(finalText, link, jaMandado, !!linkModelo)) {
      finalText = `${finalText}\n\n${link}`;
      await logEvent(leadId, "trava_link_modelo", { link });
    }
  }

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
  // Trava 4: depois de um "não", nenhum follow-up. Segundo "não" (ou a IA não encerrou) → lead encerrado.
  if (recusa.ultimaFoiRecusa && !doDono) {
    patch.next_followup_at = null;
    await logEvent(leadId, "recusa_detectada", { recusas: recusa.recusas });
    if (recusa.recusas >= 2 && OPEN_STATUSES.includes(lead.status)) {
      await updateLead(leadId, patch);
      await encerrarLead(lead, "desqualificado", "agradeceu e encerrou depois do segundo \"não\"");
      await logEvent(leadId, "ia_respondeu", { chars: finalText.length });
      return;
    }
  } else if (!doDono && !lead.ai_paused && OPEN_STATUSES.includes(lead.status) && !retornoCombinado) {
    patch.followup_attempts = 0;
    // Prospecção v2: follow-ups no ritmo dela (7 em até 14 dias)
    patch.next_followup_at = nextFollowUpAt(now, 0, ehFluxoV2(prospeccao) ? PROSPECCAO_V2 : undefined)?.toISOString() ?? null;
  }
  await updateLead(leadId, patch);
  await logEvent(leadId, "ia_respondeu", { chars: finalText.length });
}
