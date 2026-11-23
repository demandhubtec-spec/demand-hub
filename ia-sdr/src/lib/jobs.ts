/**
 * Rotinas periódicas (rodadas pelo cron a cada 10 min):
 *  - follow-ups com leads parados (só em dia útil, 08–18h de Brasília)
 *  - confirmação e lembrete das reuniões
 */
import { carregarPlaybook, manuaisAtuais, playbookAtual } from "./playbook.ts";
import { SDR_CONFIG } from "../config/sdr.ts";
import { toChat } from "./chat.ts";
import { callLLM } from "./llm.ts";
import { addMessage, db, getLead, history, latestInboundId, logEvent, tryLock, ultimoEvento, unlock, updateLead, type Lead, type Meeting } from "./db.ts";
import { isBlocked } from "./bloqueio.ts";
import { destination, sendText } from "./evolution.ts";
import { horarioProspeccaoV2, isBusinessTime, nextFollowUpAt, PROSPECCAO_V2 } from "./followup.ts";
import { followUpPrompt, followUpPromptProspeccaoV2 } from "./prompt.ts";
import { humanizar } from "./estilo.ts";
import { formatBR, toLocal } from "./time.ts";
import { ehFluxoV2, prospeccaoDoTelefone, temSiteProprio } from "./prospeccao.ts";
import { aplicarTravasDeTexto, ehAberturaPadrao, faltaLinkDoModelo, perguntaSeViu, situacaoDaRecusa } from "./travas.ts";
import { encerrarLead } from "./tools.ts";
import { linkPrevia } from "./extras.ts";

const MAX = SDR_CONFIG.followUp.maxTentativas;

/**
 * O follow-up é o retorno que a Ana combinou com o lead (ferramenta combinar_retorno)?
 * Esse sai no dia e hora combinados, mesmo em fim de semana (entre 8h e 20h de Brasília).
 */
export async function ehRetornoCombinado(lead: Pick<Lead, "id" | "next_followup_at">): Promise<boolean> {
  if (!lead.next_followup_at) return false;
  const ev = await ultimoEvento<{ quando?: string }>(lead.id, "tool:combinar_retorno").catch(() => null);
  if (!ev?.quando) return false;
  return Math.abs(new Date(ev.quando).getTime() - new Date(lead.next_followup_at).getTime()) < 10 * 60_000;
}

export function janelaRetornoCombinado(now: Date): boolean {
  const h = toLocal(now).h;
  return h >= 8 && h < 20;
}

export async function runFollowUps(now = new Date()) {
  // Sábado de manhã também vale para a prospecção v2 (o filtro fino é por lead, abaixo)
  const comercial = isBusinessTime(now) || horarioProspeccaoV2(now);
  if (!comercial && !janelaRetornoCombinado(now)) return { skipped: "fora do horário comercial" };
  await carregarPlaybook();

  const { data } = await db()
    .from("sdr_leads")
    .select("*")
    .lte("next_followup_at", now.toISOString())
    .eq("ai_paused", false)
    .in("status", ["novo", "em_qualificacao", "qualificado"])
    .lt("followup_attempts", MAX)
    .order("next_followup_at")
    .limit(comercial ? 25 : 100);

  let sent = 0;
  for (const lead of (data ?? []) as Lead[]) {
    if (!(await tryLock(lead.id, 60))) continue;
    try {
      const fresh = await getLead(lead.id);
      // Lead respondeu depois do agendamento? O próprio fluxo de conversa reagenda.
      if (!fresh.next_followup_at || new Date(fresh.next_followup_at) > now) continue;
      // Fora do horário comercial só sai o retorno combinado com o lead
      const combinado = await ehRetornoCombinado(fresh);
      if (!comercial && !combinado) continue;
      if (isBlocked(fresh.phone, fresh.whatsapp_jid)) {
        await updateLead(lead.id, { next_followup_at: null, ai_paused: true });
        continue;
      }
      // Contato da prospecção com a cadência rodando: quem faz o follow-up é a cadência
      // (em 30/10 o AS Odontologia recebeu um "Passando pra retomar" do SDR por cima da cadência).
      const prosp = await prospeccaoDoTelefone(fresh.phone).catch(() => null);
      const v2 = ehFluxoV2(prosp);
      // Prospecção v2: só no horário dela (sábado até meio-dia); inbound: só no comercial normal
      if (!combinado && (v2 ? !horarioProspeccaoV2(now) : !isBusinessTime(now))) continue;
      if (prosp && !v2 && prosp.cadencia === "ativa") {
        await updateLead(lead.id, { next_followup_at: null });
        continue;
      }
      // Conversa da prospecção que parou: a retomada é proposta ao Kelvin (runRetomadas), nunca sai sozinha
      if (prosp?.place_id && !v2 && prosp.cadencia === "respondeu") {
        await updateLead(lead.id, { next_followup_at: null });
        continue;
      }

      // Trava 4 (16/11): a última mensagem de gente foi um "não" → nenhum follow-up; o lead é encerrado
      const hist = await history(lead.id, 30);
      const recusa = situacaoDaRecusa(hist);
      if (recusa.ultimaFoiRecusa) {
        await encerrarLead(fresh, "desqualificado", "não mandou follow-up porque o lead disse que não tem interesse");
        await logEvent(lead.id, "followup_cancelado_recusa", { recusas: recusa.recusas });
        continue;
      }

      // Trava 4b (22/11): a IA que lê a conversa (contexto do card) viu recusa com outras palavras
      // ("recusou no momento", "já possuem agência", "engano de contato")
      const ctx = (fresh as { contexto?: { conversou?: boolean; temperatura?: string; motivo_parou?: string | null; resumo?: string } }).contexto;
      if (ctx?.conversou && ctx.temperatura === "frio" && /recus|n[ãa]o (tem|t[êe]m|quer|precisa)|j[áa] (tem|t[êe]m|possu)|ag[êe]ncia|engano|fornecedor/i.test(`${ctx.motivo_parou ?? ""} ${ctx.resumo ?? ""}`)) {
        await updateLead(lead.id, { next_followup_at: null });
        await logEvent(lead.id, "followup_cancelado_recusa", { motivo: ctx.motivo_parou ?? ctx.resumo ?? "contexto" });
        continue;
      }

      const attempt = fresh.followup_attempts + 1;
      const msgs = toChat(hist);
      msgs.push({ role: "user", content: `[Sistema: o lead não respondeu. Escreva o follow-up nº ${attempt}.]` });
      // Garante alternância caso a última mensagem já fosse do usuário
      const merged = msgs.reduce<typeof msgs>((acc, m) => {
        const last = acc[acc.length - 1];
        if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") {
          last.content = `${last.content}\n${m.content}`;
        } else acc.push({ ...m });
        return acc;
      }, []);

      const pedir = async (extra = "") =>
        humanizar((await callLLM({ system: (v2 ? followUpPromptProspeccaoV2(fresh, attempt, now, prosp) : followUpPrompt(fresh, attempt, MAX, now)) + (playbookAtual() ? `\n\n## Playbook comercial (siga sempre)\n${playbookAtual()}` : "") + (manuaisAtuais("marina") ? `\n\n${manuaisAtuais("marina")}` : "") + extra, messages: merged, maxTokens: 1500 })).message.content ?? "");
      // Nunca manda de novo uma frase que a Ana já mandou nessa conversa
      const jaMandou = new Set(merged.filter((m) => m.role === "assistant").flatMap((m) => String(m.content).split("\n")).map((l) => l.trim().toLowerCase()).filter(Boolean));
      // 17/11: 55 follow-ups adiados por "repetido" só porque "Bom dia! 😊" ou "Tudo bem?" já tinham saído antes.
      // Frase curta (saudação) pode repetir; o que não pode é repetir o conteúdo.
      // 19/11: 95 adiados porque a abertura obrigatória ("Bom dia! Tudo bem? Aqui é a Gabi, da DemandIA 😊") sai igual em todos
      const repetida = (t: string) => t.split(/\n+/).some((l) => l.trim().length >= 30 && !ehAberturaPadrao(l) && jaMandou.has(l.trim().toLowerCase()));
      // A pessoa falou por último e ficou sem resposta (a IA falhou na hora): o "follow-up" responde a ela
      const ultimaDeGente = [...hist].reverse().find((m) => !(m.direction === "in" && String(m.content).startsWith("[resposta automática]")));
      const elaFalouPorUltimo = ultimaDeGente?.direction === "in";
      // 23/11: conversa acontecendo agora (mensagem há menos de 20 min) não recebe follow-up; se foi a pessoa que
      // acabou de falar, quem responde é o fluxo da conversa, não o follow-up
      const ultimaMsg = hist[hist.length - 1];
      const minDesdeUltima = ultimaMsg ? (now.getTime() - new Date(ultimaMsg.created_at).getTime()) / 60e3 : Infinity;
      if (minDesdeUltima < (elaFalouPorUltimo ? 5 : 20)) {
        await updateLead(lead.id, { next_followup_at: new Date(now.getTime() + (elaFalouPorUltimo ? 10 : 60) * 60e3).toISOString() });
        await logEvent(lead.id, "followup_adiado", { motivo: "conversa acontecendo agora" });
        continue;
      }
      const inboundAntes = await latestInboundId(lead.id);
      const extraCombinado = (combinado
        ? "\n\nIMPORTANTE: este é o retorno que você combinou com ele (dia e horário que ele pediu). Abra lembrando com leveza que ficou de falar hoje e retome o assunto de onde parou, com uma pergunta simples. Não diga que ele não respondeu."
        : "") + (elaFalouPorUltimo
        ? "\n\nIMPORTANTE: a última mensagem é DA PESSOA e ficou sem resposta nossa. Não é follow-up: responda ao que ela disse, seguindo a etapa da conversa, e comece com um pedido de desculpa curto pela demora (\"Desculpa a demora!\"). Não se apresente de novo se já se apresentou."
        : "");
      // Trava 6 (16/11): ~15 follow-ups perguntaram "conseguiu dar uma olhadinha?" a quem nunca recebeu o diagnóstico
      const diagNaoFoi = v2 && !!prosp && !prosp.diag_enviado_em;
      const viuSemTerRecebido = (t: string) => diagNaoFoi && perguntaSeViu(t);
      let text = await pedir(extraCombinado);
      if (text && repetida(text)) text = await pedir(extraCombinado + "\n\nATENÇÃO: sua última versão repetia uma mensagem que você já mandou. Escreva algo diferente, com outro ângulo.");
      if (text && viuSemTerRecebido(text)) text = await pedir(extraCombinado + "\n\nATENÇÃO: o diagnóstico NUNCA foi enviado para esta empresa. Não pergunte se viram, se conseguiram olhar nem ofereça reenviar: ofereça mandar pela primeira vez (\"posso te mandar por aqui?\").");
      if (!text || repetida(text) || viuSemTerRecebido(text)) {
        // Não saiu um texto bom: tenta de novo daqui a 2 horas em vez de gastar a IA a cada 10 minutos
        await updateLead(lead.id, { next_followup_at: new Date(now.getTime() + 2 * 3600e3).toISOString() });
        await logEvent(lead.id, "followup_adiado", { motivo: !text ? "vazio" : repetida(text) ? "repetido" : "perguntou se viu sem ter recebido" });
        continue;
      }
      // Trava 1 e detalhes: saudação da hora certa, sem "querida", sem letra de outro alfabeto
      text = aplicarTravasDeTexto(text, now);
      // Trava 2: falou do modelo de site e o link nunca foi mandado nesta conversa
      const link = prosp && !temSiteProprio(prosp) && prosp.site_preview?.token ? linkPrevia(prosp.site_preview.token) : null;
      if (faltaLinkDoModelo(text, link, hist.filter((m) => m.direction === "out").map((m) => m.content))) text = `${text}\n\n${link}`;

      // 23/11: a pessoa escreveu enquanto o follow-up era escrito → não manda; a conversa responde a ela
      if ((await latestInboundId(lead.id)) !== inboundAntes) {
        await updateLead(lead.id, { next_followup_at: null });
        await logEvent(lead.id, "followup_abortado", { motivo: "a pessoa respondeu enquanto o follow-up era escrito" });
        continue;
      }
      const id = await sendText(destination(fresh), text);
      await addMessage({ lead_id: lead.id, direction: "out", author: "ia", kind: "followup", content: text, evolution_message_id: id });

      const next = nextFollowUpAt(now, attempt, v2 ? PROSPECCAO_V2 : undefined);
      await updateLead(lead.id, {
        followup_attempts: attempt,
        next_followup_at: next?.toISOString() ?? null,
        last_outbound_at: now.toISOString(),
        ...(next ? {} : { status: "sem_resposta" }),
      });
      await logEvent(lead.id, "followup_enviado", { tentativa: attempt });
      sent++;
    } catch (e) {
      console.error("follow-up falhou", lead.id, e);
    } finally {
      await unlock(lead.id);
    }
  }
  return { sent };
}

export async function runMeetingReminders(now = new Date()) {
  const iso = now.toISOString();
  const sb = db();

  const { data: toConfirm } = await sb
    .from("sdr_meetings")
    .select("*")
    .in("status", ["agendada"])
    .is("confirm_sent_at", null)
    .lte("confirm_at", iso)
    .gt("starts_at", iso)
    .limit(25);

  const { data: toRemind } = await sb
    .from("sdr_meetings")
    .select("*")
    .in("status", ["agendada", "confirmada"])
    .is("reminder_sent_at", null)
    .lte("reminder_at", iso)
    .gt("starts_at", iso)
    .limit(25);

  let confirmations = 0;
  let reminders = 0;

  for (const m of (toConfirm ?? []) as Meeting[]) {
    const lead = await getLead(m.lead_id);
    const quando = formatBR(new Date(m.starts_at));
    const hoje = toLocal(new Date(m.starts_at)).d === toLocal(now).d;
    const nome = lead.nome ? `, ${lead.nome.split(" ")[0]}` : "";
    const text = `Oi${nome}! Passando para confirmar nossa reunião de diagnóstico ${hoje ? "hoje" : "amanhã"} (${quando}) com o nosso especialista.\n\nConsegue confirmar sua presença?`;
    await sendAndLog(lead, text, "confirmacao");
    await sb.from("sdr_meetings").update({ confirm_sent_at: iso }).eq("id", m.id);
    confirmations++;
  }

  for (const m of (toRemind ?? []) as Meeting[]) {
    const lead = await getLead(m.lead_id);
    const text = `Daqui a pouco, às ${formatBR(new Date(m.starts_at)).split(" às ")[1]}, começa nossa reunião 😊\n\nLink do Meet: ${m.meet_link ?? "está no convite do seu e-mail"}`;
    await sendAndLog(lead, text, "lembrete");
    await sb.from("sdr_meetings").update({ reminder_sent_at: iso }).eq("id", m.id);
    reminders++;
  }

  return { confirmations, reminders };
}

async function sendAndLog(lead: Lead, text: string, kind: "confirmacao" | "lembrete") {
  if (isBlocked(lead.phone, lead.whatsapp_jid)) return;
  for (const bubble of text.split("\n\n")) {
    const id = await sendText(destination(lead), bubble);
    await addMessage({ lead_id: lead.id, direction: "out", author: "ia", kind, content: bubble, evolution_message_id: id });
  }
  await logEvent(lead.id, `${kind}_enviado`);
}
