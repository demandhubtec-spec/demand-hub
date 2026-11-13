/**
 * Abordagem v2 (13/11/2026, Kelvin): o 1º contato é só "Oi, boa tarde! 😊 / Tudo bem?". Se ninguém responder
 * em 1 hora (seg a sex 8h às 18h, sábado até meio-dia), a Gabi manda UMA cutucada: "Oi! Fico no aguardo do atendimento por aqui 😊".
 * Depois disso, quem cuida são os follow-ups (7 em até 14 dias, só WhatsApp).
 */
import { addMessage, db, leadDoTelefone, logEvent, ultimoEvento, updateLead, upsertLeadByPhone } from "./db.ts";
import { destination, sendText } from "./evolution.ts";
import { horarioProspeccaoV2, nextFollowUpAt, PROSPECCAO_V2 } from "./followup.ts";
import { FLUXO_V2_DESDE } from "./prospeccao.ts";

export const TEXTO_CUTUCADA = "Oi! Fico no aguardo do atendimento por aqui 😊";

export async function runCutucadas(now = new Date()) {
  if (!horarioProspeccaoV2(now)) return { skipped: "fora do horário" };
  const umaHora = new Date(now.getTime() - 60 * 60_000).toISOString();
  const seisHoras = new Date(now.getTime() - 6 * 60 * 60_000).toISOString();
  const { data } = await db()
    .from("outreach_leads")
    .select("place_id,empresa,whatsapp,wa_sent_at")
    .eq("wa_status", "enviado")
    .gte("wa_sent_at", FLUXO_V2_DESDE)
    .lte("wa_sent_at", umaHora)
    .gte("wa_sent_at", seisHoras)
    .limit(30);
  let enviadas = 0;
  for (const o of (data ?? []) as { place_id: string; empresa: string; whatsapp: string; wa_sent_at: string }[]) {
    // Quem nunca respondeu pode não ter ficha na Gabi: o WhatsApp devolve o envio como LID e o registro
    // caía num número interno (13/11: Clínica Ito, Baronesa, Ivone... ficaram sem cutucada). Cria pela ficha do disparo.
    const tel = (o.whatsapp ?? "").replace(/\D/g, "");
    const lead = (await leadDoTelefone(o.whatsapp).catch(() => null)) ?? (tel ? await upsertLeadByPhone(tel, `${tel}@s.whatsapp.net`).catch(() => null) : null);
    if (!lead || lead.ai_paused || lead.status === "opt_out") continue;
    if (await ultimoEvento(lead.id, "cutucada").catch(() => null)) continue;
    // Respondeu depois do 1º contato (gente de verdade, não robô)? Não cutuca
    const { count } = await db()
      .from("sdr_messages")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id)
      .eq("direction", "in")
      .gte("created_at", o.wa_sent_at)
      .not("content", "like", "[resposta automática]%");
    if (count) continue;
    // Marca antes de enviar: o webhook reconhece o envio como nosso e não pausa a Gabi
    await db().from("outreach_leads").update({ ultimo_toque_em: now.toISOString() }).eq("place_id", o.place_id);
    const id = await sendText(destination(lead), TEXTO_CUTUCADA);
    await addMessage({ lead_id: lead.id, direction: "out", author: "ia", kind: "followup", content: TEXTO_CUTUCADA, evolution_message_id: id });
    await logEvent(lead.id, "cutucada", { place_id: o.place_id });
    // A partir daqui, os follow-ups da Gabi (7 em até 14 dias)
    await updateLead(lead.id, {
      followup_attempts: 0,
      next_followup_at: nextFollowUpAt(now, 0, PROSPECCAO_V2)?.toISOString() ?? null,
      last_outbound_at: now.toISOString(),
    });
    enviadas++;
  }
  return { enviadas };
}
