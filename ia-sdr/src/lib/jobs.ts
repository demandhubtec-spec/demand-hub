/**
 * Rotinas periódicas (rodadas pelo cron a cada 10 min):
 *  - follow-ups com leads parados (só em dia útil, 08–18h de Brasília)
 *  - confirmação e lembrete das reuniões
 */
import { SDR_CONFIG } from "../config/sdr.ts";
import { toChat } from "./chat.ts";
import { callLLM } from "./llm.ts";
import { addMessage, db, getLead, history, logEvent, tryLock, unlock, updateLead, type Lead, type Meeting } from "./db.ts";
import { isBlocked } from "./bloqueio.ts";
import { destination, sendText } from "./evolution.ts";
import { isBusinessTime, nextFollowUpAt } from "./followup.ts";
import { followUpPrompt } from "./prompt.ts";
import { humanizar } from "./estilo.ts";
import { formatBR, toLocal } from "./time.ts";

const MAX = SDR_CONFIG.followUp.maxTentativas;

export async function runFollowUps(now = new Date()) {
  if (!isBusinessTime(now)) return { skipped: "fora do horário comercial" };

  const { data } = await db()
    .from("sdr_leads")
    .select("*")
    .lte("next_followup_at", now.toISOString())
    .eq("ai_paused", false)
    .in("status", ["novo", "em_qualificacao", "qualificado"])
    .lt("followup_attempts", MAX)
    .order("next_followup_at")
    .limit(25);

  let sent = 0;
  for (const lead of (data ?? []) as Lead[]) {
    if (!(await tryLock(lead.id, 60))) continue;
    try {
      const fresh = await getLead(lead.id);
      // Lead respondeu depois do agendamento? O próprio fluxo de conversa reagenda.
      if (!fresh.next_followup_at || new Date(fresh.next_followup_at) > now) continue;
      if (isBlocked(fresh.phone, fresh.whatsapp_jid)) {
        await updateLead(lead.id, { next_followup_at: null, ai_paused: true });
        continue;
      }

      const attempt = fresh.followup_attempts + 1;
      const msgs = toChat(await history(lead.id, 30));
      msgs.push({ role: "user", content: `[Sistema: o lead não respondeu. Escreva o follow-up nº ${attempt}.]` });
      // Garante alternância caso a última mensagem já fosse do usuário
      const merged = msgs.reduce<typeof msgs>((acc, m) => {
        const last = acc[acc.length - 1];
        if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") {
          last.content = `${last.content}\n${m.content}`;
        } else acc.push({ ...m });
        return acc;
      }, []);

      const res = await callLLM({ system: followUpPrompt(fresh, attempt, MAX, now), messages: merged, maxTokens: 1500 });
      const text = humanizar(res.message.content ?? "");
      if (!text) continue;

      const id = await sendText(destination(fresh), text);
      await addMessage({ lead_id: lead.id, direction: "out", author: "ia", kind: "followup", content: text, evolution_message_id: id });

      const next = nextFollowUpAt(now, attempt);
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
    const text = `Daqui a pouco, às ${formatBR(new Date(m.starts_at)).split(" às ")[1]}, começa nossa reunião 🙂\n\nLink do Meet: ${m.meet_link ?? "está no convite do seu e-mail"}`;
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
