/**
 * Acompanhamento de quem pede a demo da recepcionista (anúncio "Ana Recepcionista IA", 07/11/2026).
 *
 * Em 07 e 08/11 quatro pessoas pediram a demo pelo anúncio, receberam a abertura e ficaram em silêncio.
 * Ninguém voltou a chamar até o dia útil seguinte. Agora, no mesmo dia:
 *  1. Cutucada: 15 minutos depois da abertura, se a pessoa ainda não testou, a recepcionista manda
 *     uma vez um exemplo de pergunta de paciente.
 *  2. Retomada: 2 horas parada depois da demo (testou ou não), a Ana encerra a demo e retoma uma vez,
 *     perguntando o que achou e puxando para o diagnóstico gratuito.
 * Só entre 8h e 21h (Brasília). Roda no cron de 10 em 10 minutos.
 */
import { toChat } from "./chat.ts";
import { callLLM } from "./llm.ts";
import { activeMeeting, addMessage, db, getLead, history, logEvent, tryLock, ultimoEvento, ultimoEventoEm, unlock, updateLead, type Lead } from "./db.ts";
import { isBlocked } from "./bloqueio.ts";
import { destination, sendBubbles } from "./evolution.ts";
import { humanizar } from "./estilo.ts";
import { systemPrompt } from "./prompt.ts";
import { orientacoesPara } from "./canal.ts";
import { toLocal } from "./time.ts";
import type { OrigemAnuncio } from "./anuncio.ts";
import {
  contextoPosDemo,
  CUTUCADA_MIN,
  demoAtiva,
  JANELA_DEMO,
  mensagensDoLeadNaDemo,
  RETOMADA_DEMO_HORAS,
  textoCutucada,
  type DemoEncerrada,
  type DemoIniciada,
} from "./demo.ts";

const ABERTOS = ["novo", "em_qualificacao", "qualificado"];

/** Está dentro da janela do dia para falar com quem pediu a demo? */
export function naJanelaDaDemo(agora: Date): boolean {
  const h = toLocal(agora).h;
  return h >= JANELA_DEMO[0] && h < JANELA_DEMO[1];
}

export type AcaoDemo = "cutucar" | "retomar" | null;

/**
 * Decide o que fazer com quem pediu a demo. Regras puras (testáveis):
 * - nada se a última mensagem foi do lead (a Ana responde pelo fluxo normal);
 * - cutucar: demo ativa, ele ainda não testou, 15+ min da nossa última mensagem, sem cutucada antes;
 * - retomar: 2+ horas da nossa última mensagem, sem retomada antes.
 */
export function decidirAcaoDemo(o: {
  agora: Date;
  ativa: boolean;
  testou: number;
  ultimaFoiDoLead: boolean;
  ultimaNossaEm: Date | null;
  jaCutucou: boolean;
  jaRetomou: boolean;
}): AcaoDemo {
  if (o.ultimaFoiDoLead || !o.ultimaNossaEm) return null;
  const min = (o.agora.getTime() - o.ultimaNossaEm.getTime()) / 60_000;
  if (!o.jaRetomou && min >= RETOMADA_DEMO_HORAS * 60) return "retomar";
  if (o.ativa && o.testou === 0 && !o.jaCutucou && min >= CUTUCADA_MIN) return "cutucar";
  return null;
}

const depois = (em: string | null, ini: DemoIniciada) => !!em && new Date(em).getTime() >= new Date(ini.inicio).getTime() - 120_000;

export async function runDemoAcompanhamento(agora = new Date()) {
  if (!naJanelaDaDemo(agora)) return { skipped: "fora da janela da demo" };

  // Quem pediu a demo nas últimas 26 horas
  const desde = new Date(agora.getTime() - 26 * 3600e3).toISOString();
  const { data } = await db().from("sdr_events").select("lead_id").eq("type", "demo_iniciada").gte("created_at", desde).limit(100);
  const ids = [...new Set(((data ?? []) as { lead_id: string | null }[]).map((e) => e.lead_id).filter(Boolean))] as string[];

  let cutucadas = 0;
  let retomadas = 0;
  for (const id of ids) {
    if (!(await tryLock(id, 60))) continue;
    try {
      const lead = await getLead(id);
      if (lead.ai_paused || !ABERTOS.includes(lead.status) || isBlocked(lead.phone, lead.whatsapp_jid)) continue;
      const ini = await ultimoEvento<DemoIniciada>(id, "demo_iniciada");
      if (!ini?.inicio) continue;
      const fim = await ultimoEvento<DemoEncerrada>(id, "demo_encerrada");
      const hist = await history(id, 60);
      const ultima = hist[hist.length - 1];
      if (!ultima) continue;
      const ultimaNossa = [...hist].reverse().find((m) => m.direction === "out");
      const acao = decidirAcaoDemo({
        agora,
        ativa: demoAtiva(ini, fim, agora),
        testou: mensagensDoLeadNaDemo(hist, ini),
        ultimaFoiDoLead: ultima.direction === "in",
        ultimaNossaEm: ultimaNossa ? new Date(ultimaNossa.created_at) : null,
        jaCutucou: depois(await ultimoEventoEm(id, "demo_cutucada"), ini),
        jaRetomou: depois(await ultimoEventoEm(id, "demo_retomada"), ini),
      });

      if (acao === "cutucar") {
        await enviar(lead, textoCutucada(), "demo");
        await logEvent(id, "demo_cutucada");
        cutucadas++;
      } else if (acao === "retomar") {
        const texto = await escreverRetomada(lead, agora);
        if (!texto) continue;
        if (demoAtiva(ini, fim, agora)) await logEvent(id, "demo_encerrada", { em: agora.toISOString(), motivo: "retomada da Ana (parado)" });
        await enviar(lead, texto, "followup");
        await logEvent(id, "demo_retomada");
        retomadas++;
      }
    } catch (e) {
      console.error("acompanhamento da demo falhou", id, e);
    } finally {
      await unlock(id);
    }
  }
  return { cutucadas, retomadas };
}

async function enviar(lead: Lead, texto: string, kind: string) {
  await sendBubbles(destination(lead), texto, async (content, msgId) => {
    await addMessage({ lead_id: lead.id, direction: "out", author: "ia", kind, content, evolution_message_id: msgId });
  });
  await updateLead(lead.id, { last_outbound_at: new Date().toISOString() });
}

/** A Ana escreve a retomada de quem parou depois da demo. */
async function escreverRetomada(lead: Lead, agora: Date): Promise<string> {
  const meeting = await activeMeeting(lead.id);
  const orientacoes = await orientacoesPara(lead.id).catch(() => [] as string[]);
  const anuncio = await ultimoEvento<OrigemAnuncio>(lead.id, "origem_anuncio").catch(() => null);
  const msgs = toChat(await history(lead.id, 40));
  msgs.push({
    role: "user",
    content:
      "[Sistema: ele pediu a demo da recepcionista e parou de responder há algumas horas. Agora quem fala é você, a Ana. Escreva UMA retomada curta (1 ou 2 balões): se ele testou, pergunte o que achou e se imagina isso atendendo os pacientes da clínica dele à noite e no fim de semana; se não testou, diga que a demo continua disponível e pergunte se ele tem clínica e como os pacientes chegam hoje. Termine com uma pergunta simples. Não use ferramentas.]",
  });
  const merged = msgs.reduce<typeof msgs>((acc, m) => {
    const last = acc[acc.length - 1];
    if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") last.content = `${last.content}\n${m.content}`;
    else acc.push({ ...m });
    return acc;
  }, []);
  const r = await callLLM({ system: systemPrompt(lead, meeting, agora, null, orientacoes, anuncio, contextoPosDemo(false)), messages: merged, maxTokens: 800 });
  return humanizar(r.message.content ?? "");
}
