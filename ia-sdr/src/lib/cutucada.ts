/**
 * Abordagem v2 (13/11/2026, Kelvin): o 1º contato é só "Oi, boa tarde! 😊 / Tudo bem?". Se ninguém responder
 * em 1 hora (seg a sex 8h às 18h, sábado até meio-dia), a Gabi manda UMA cutucada: "Oi! Fico no aguardo do atendimento por aqui 😊".
 * Depois disso, quem cuida são os follow-ups (7 em até 14 dias, só WhatsApp).
 *
 * 16/11 (Kelvin): antes só entrava quem recebeu o 1º contato entre 1 e 6 horas atrás. Quem recebeu o "Oi" depois
 * das ~17h (ou sábado depois das ~11h) caía fora da janela, nunca recebia a cutucada e, sem ela, nunca entrava nos
 * follow-ups. Agora entra todo mundo da v2 que ainda não foi cutucado e não respondeu (até 5 dias depois do 1º
 * contato), e a cutucada sai no próximo horário permitido.
 */
import { db, leadDoTelefone, logEvent, ultimoEvento, updateLead, upsertLeadByPhone } from "./db.ts";
import { horarioProspeccaoV2, nextFollowUpAt, PROSPECCAO_V2 } from "./followup.ts";
import { FLUXO_V2_DESDE } from "./prospeccao.ts";
import { sdrValida } from "./sdrs.ts";
import { CUTUCADA_ATE_DIAS, CUTUCADAS_POR_RODADA, type CandidatoCutucada, ordenarCandidatos } from "./cutucada-fila.ts";

export { CUTUCADA_ATE_DIAS, CUTUCADAS_POR_RODADA, ordenarCandidatos };

export const TEXTO_CUTUCADA = "Oi! Fico no aguardo do atendimento por aqui 😊";

export async function runCutucadas(now = new Date()) {
  if (!horarioProspeccaoV2(now)) return { skipped: "fora do horário" };
  const umaHora = new Date(now.getTime() - 60 * 60_000).toISOString();
  const limite = new Date(Math.max(new Date(FLUXO_V2_DESDE).getTime(), now.getTime() - CUTUCADA_ATE_DIAS * 86_400_000)).toISOString();
  const { data } = await db()
    .from("outreach_leads")
    .select("place_id,empresa,whatsapp,wa_sent_at,ultimo_toque_em,agente")
    .eq("wa_status", "enviado")
    .gte("wa_sent_at", limite)
    .lte("wa_sent_at", umaHora)
    .order("wa_sent_at", { ascending: true })
    .limit(500);
  const fila = ordenarCandidatos((data ?? []) as CandidatoCutucada[], now, FLUXO_V2_DESDE);
  let enviadas = 0;
  for (const o of fila) {
    if (enviadas >= CUTUCADAS_POR_RODADA) break;
    // Quem nunca respondeu pode não ter ficha na Gabi: o WhatsApp devolve o envio como LID e o registro
    // caía num número interno (13/11: Clínica Ito, Baronesa, Ivone... ficaram sem cutucada). Cria pela ficha do disparo.
    const tel = (o.whatsapp ?? "").replace(/\D/g, "");
    // A ficha nasce com a SDR que mandou o "Oi" (Gabi ou Marina): a cutucada sai pelo mesmo número
    const lead = (await leadDoTelefone(o.whatsapp).catch(() => null)) ?? (tel ? await upsertLeadByPhone(tel, `${tel}@s.whatsapp.net`, undefined, sdrValida(o.agente)).catch(() => null) : null);
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
    // 18/11 (Kelvin): "Oi! Fico no aguardo do atendimento por aqui" soava ansioso e estranho. Não manda mais nada:
    // só passa o lead para os follow-ups (o 1º já chega com apresentação e motivo do contato).
    await logEvent(lead.id, "cutucada", { place_id: o.place_id, sem_mensagem: true, atrasada: new Date(o.wa_sent_at).getTime() < now.getTime() - 6 * 3600_000 });
    // A partir daqui, os follow-ups da Gabi (7 em até 14 dias)
    await updateLead(lead.id, {
      followup_attempts: 0,
      next_followup_at: nextFollowUpAt(now, 0, PROSPECCAO_V2)?.toISOString() ?? null,
      last_outbound_at: now.toISOString(),
    });
    enviadas++;
  }
  return { enviadas, pendentes: Math.max(fila.length - enviadas, 0) };
}
