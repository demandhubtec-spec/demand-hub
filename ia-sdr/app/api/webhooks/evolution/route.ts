/**
 * Webhook do Evolution GO (configurado via POST /instance/connect com webhookUrl):
 *   URL: https://SEU-APP.vercel.app/api/webhooks/evolution?secret=WEBHOOK_SECRET
 *   Evento: MESSAGE
 */
import { waitUntil } from "@vercel/functions";
import { ehDisparoDaProspeccao, pareceRespostaAutomatica, prospeccaoDoTelefone } from "@/src/lib/prospeccao.ts";
import { handleInbound } from "@/src/lib/agent.ts";
import { addMessage, history, leadDoTelefone, logEvent, messageExists, ultimoEvento, updateLead, upsertLeadByPhone } from "@/src/lib/db.ts";
import { detectarOrigemAnuncio, NICHO_LABEL } from "@/src/lib/anuncio.ts";
import { demoAtiva, ehPedidoDeDemo, ehSaidaDaDemo, emTesteDoDono, type DemoEncerrada, type DemoIniciada } from "@/src/lib/demo.ts";
import { env } from "@/src/lib/env.ts";
import { isBlocked } from "@/src/lib/bloqueio.ts";
import { parseWebhook } from "@/src/lib/evolution.ts";
import { interpretarMidia } from "@/src/lib/midia.ts";
import { emailsNoTexto, rascunhoDoEmailPassado } from "@/src/lib/rascunho-email.ts";
import { processarOrientacao, registrar } from "@/src/lib/canal.ts";

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
  // Conversa com o próprio Kelvin não é lead: o que ele escreve para a Ana vira orientação no canal interno
  const doKelvin = (env.ownerPhone && msg.phone === env.ownerPhone) || (env.alertPhone && msg.phone === env.alertPhone);
  // Modo teste do Kelvin: pediu a demo pelo WhatsApp pessoal? Por 30 minutos ele conversa como cliente.
  let testeDoDono = false;
  if (doKelvin && !msg.fromMe) {
    if (ehPedidoDeDemo(msg.text)) testeDoDono = true;
    else {
      const eu = await leadDoTelefone(msg.phone).catch(() => null);
      const ini = eu ? await ultimoEvento<DemoIniciada>(eu.id, "demo_iniciada").catch(() => null) : null;
      testeDoDono = emTesteDoDono(ini, new Date());
    }
  }
  // O que sai do número da Ana para o Kelvin (avisos, respostas do teste) não é conversa de lead
  if (doKelvin && msg.fromMe) return Response.json({ ok: true, ignorado: "mensagem_para_o_kelvin" });
  if (doKelvin && !msg.fromMe && !testeDoDono) {
    waitUntil(
      (async () => {
        const interp = !msg.text && msg.media ? await interpretarMidia(msg.media) : null;
        const conteudo = msg.text ?? interp;
        if (!conteudo) return;
        const tipo = msg.media?.tipo === "audio" ? "audio" : msg.media?.tipo === "imagem" ? "imagem" : "texto";
        await registrar({ autor: "kelvin", tipo, conteudo, origem: "whatsapp" });
        await processarOrientacao({ leadId: null, conteudo, origem: "whatsapp" });
      })().catch((e) => console.error("canal da Ana (WhatsApp) falhou", e)),
    );
    return Response.json({ ok: true, canal: true });
  }
  if (!testeDoDono && env.ownerPhone && msg.phone === env.ownerPhone) return Response.json({ ignored: "owner" });
  // Números da lista de bloqueio: a IA não conversa nem registra como lead
  if (!testeDoDono && isBlocked(msg.phone, msg.jid, ...msg.altPhones)) return Response.json({ ignored: "bloqueado" });

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
        // Disparo da prospecção ativa (mesma instância): registra no histórico sem pausar a IA
        const prospeccao = await prospeccaoDoTelefone(msg.phone).catch(() => null);
        if (ehDisparoDaProspeccao(prospeccao, msg.text!)) {
          await addMessage({ lead_id: lead.id, direction: "out", author: "sistema", content: msg.text!, evolution_message_id: msg.id });
          await logEvent(lead.id, "prospeccao_enviada");
          return;
        }
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
  // Áudio, imagem ou documento: a Ana entende o conteúdo (transcrição / leitura) em vez de pedir texto
  const interpretado = !msg.text && msg.media ? await interpretarMidia(msg.media) : null;
  const content = msg.text ?? interpretado ?? MEDIA_LABEL[msg.messageType] ?? `[${msg.messageType}]`;

  // Prospecção ativa: resposta automática da empresa (boas-vindas, robô, protocolo, menu) não é resposta
  // de verdade. Fica no histórico, mas a cadência segue e a Ana não conversa com o robô.
  let segDoDisparo: number | null = null;
  // Menu de lista ou botões só vem de robô: nunca é a pessoa respondendo
  const MENU = ["listMessage", "buttonsMessage", "templateMessage", "interactiveMessage", "listResponseMessage"];
  if (!msg.text && MENU.includes(msg.messageType)) {
    const prospeccao = await prospeccaoDoTelefone(msg.phone).catch(() => null);
    if (prospeccao) {
      const salvo = await addMessage({ lead_id: lead.id, direction: "in", author: "lead", content: `[resposta automática] [menu do robô]`, evolution_message_id: msg.id });
      if (salvo) await logEvent(lead.id, "resposta_automatica");
      return Response.json({ ok: true, ignorado: "menu_robo" });
    }
  }
  if (msg.text || interpretado) {
    const prospeccao = await prospeccaoDoTelefone(msg.phone).catch(() => null);
    if (prospeccao) {
      const ultimo = prospeccao.ultimo_toque_em ?? prospeccao.wa_sent_at;
      const seg = ultimo ? (Date.now() - new Date(ultimo).getTime()) / 1000 : null;
      segDoDisparo = seg;
      // Mesma mensagem longa que já chegou antes = robô repetindo (em 04/11 a Ana respondeu 4 vezes ao robô do Med Anchieta)
      const norm = (t: string) => t.replace(/^\[resposta automática\]\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();
      const repetida = content.length > 25 && (await history(lead.id, 40).catch(() => []))
        .some((m) => m.direction === "in" && norm(m.content) === norm(content));
      if (repetida || pareceRespostaAutomatica(msg.text ?? interpretado ?? "", seg)) {
        const salvo = await addMessage({
          lead_id: lead.id,
          direction: "in",
          author: "lead",
          content: `[resposta automática] ${content}`,
          evolution_message_id: msg.id,
        });
        if (salvo) await logEvent(lead.id, "resposta_automatica");
        return Response.json({ ok: true, ignorado: "resposta_automatica" });
      }
    }
  }
  const saved = await addMessage({
    lead_id: lead.id,
    direction: "in",
    author: "lead",
    content,
    evolution_message_id: msg.id,
  });
  if (!saved) return Response.json({ duplicate: true });

  // Veio de anúncio de WhatsApp (dados do anúncio ou mensagem pronta)? Registra uma vez por lead.
  const origem = detectarOrigemAnuncio(msg.text, msg.anuncio);
  if (origem && !(await ultimoEvento(lead.id, "origem_anuncio").catch(() => null))) {
    await logEvent(lead.id, "origem_anuncio", { ...origem, url: msg.anuncio?.url ?? null, ctwaClid: msg.anuncio?.ctwaClid ?? null });
    if (origem.nicho && !lead.segmento) await updateLead(lead.id, { segmento: NICHO_LABEL[origem.nicho] });
  }

  // Demo ao vivo da recepcionista (botão "Testar no WhatsApp" do Reels "Comenta DEMO")
  if (msg.text) {
    const ini = await ultimoEvento<DemoIniciada>(lead.id, "demo_iniciada").catch(() => null);
    const fim = await ultimoEvento<DemoEncerrada>(lead.id, "demo_encerrada").catch(() => null);
    const ativa = demoAtiva(ini, fim, new Date()) && (!testeDoDono || emTesteDoDono(ini, new Date()));
    if (!ativa && ehPedidoDeDemo(msg.text)) {
      await logEvent(lead.id, "demo_iniciada", { inicio: new Date().toISOString() });
    } else if (ativa && ehSaidaDaDemo(msg.text)) {
      await logEvent(lead.id, "demo_encerrada", { em: new Date().toISOString(), motivo: "lead pediu para sair" });
    }
  }

  // Lead respondeu: zera a sequência de follow-up
  await updateLead(lead.id, {
    last_inbound_at: new Date().toISOString(),
    followup_attempts: 0,
    next_followup_at: null,
    ...(lead.status === "sem_resposta" ? { status: "em_qualificacao" } : {}),
  });

  // Prospecção: passaram um e-mail na conversa → salva no cadastro e deixa o e-mail da análise pronto para revisão
  const emails = msg.text ? emailsNoTexto(msg.text) : [];
  if (emails.length) {
    waitUntil(
      (async () => {
        const p = await prospeccaoDoTelefone(msg.phone).catch(() => null);
        if (!p?.place_id) return;
        const conversa = (await history(lead.id, 12)).map((m) => `${m.direction === "in" ? "Empresa" : "Ana"}: ${m.content}`).join("\n");
        await rascunhoDoEmailPassado(p as typeof p & { place_id: string }, emails, conversa);
      })().catch((e) => console.error("rascunho de e-mail falhou", e)),
    );
  }

  if (!testeDoDono && (lead.ai_paused || lead.status === "opt_out")) return Response.json({ ok: true, ai: "pausada" });
  // Respondeu enquanto a abordagem ainda está saindo (saudação + apresentação): a apresentação já
  // termina com uma pergunta, então a Ana espera a próxima mensagem em vez de atropelar.
  if (segDoDisparo !== null && segDoDisparo >= 0 && segDoDisparo < 45) return Response.json({ ok: true, ai: "aguardando_abordagem" });

  waitUntil(handleInbound(lead.id, saved.id));
  return Response.json({ ok: true });
}
