/**
 * Envios programados (17/11, Kelvin): mensagens que o Kelvin revisou e aprovou para sair num horário certo,
 * pelo número da SDR de cada lead. Com PDF: o diagnóstico vai antes do texto.
 * Tabela envios_agendados (lead_id, texto, enviar_em, com_pdf, status, enviado_em, erro).
 */
import { db, getLead, logEvent, updateLead } from "./db.ts";
import { enviarAoLead } from "./canal.ts";
import { runTool } from "./tools.ts";
import { toLocal } from "./time.ts";
import { comRodape, gmailRemetente, gmailSend } from "./outreach-email.ts";

export async function runEnviosAgendados(now = new Date()) {
  // Só em horário comercial (8h às 18h, dias úteis), como os outros envios
  const { h, dow } = toLocal(now);
  if (h < 8 || h >= 18 || dow === 0 || dow === 6) return { pulado: "fora do horário" };
  const { data } = await db()
    .from("envios_agendados")
    .select("id,lead_id,texto,com_pdf,canal,para,assunto,place_id")
    .eq("status", "agendado")
    .lte("enviar_em", now.toISOString())
    .order("enviar_em", { ascending: true })
    .limit(4);
  let enviados = 0;
  for (const e of (data ?? []) as { id: string; lead_id: string | null; texto: string; com_pdf: boolean; canal: string | null; para: string | null; assunto: string | null; place_id: string | null }[]) {
    // Marca antes de mandar: duas rodadas ao mesmo tempo não mandam duas vezes
    const { data: pego } = await db().from("envios_agendados").update({ status: "enviando" }).eq("id", e.id).eq("status", "agendado").select("id");
    if (!pego?.length) continue;
    try {
      // E-mail (do Gmail da DemandIA, com a assinatura de sempre)
      if (e.canal === "email") {
        const enviado = await gmailSend(String(e.para), String(e.assunto), comRodape(e.texto), await gmailRemetente());
        if (e.place_id) await db().from("outreach_log").insert({ channel: "email", event: "sent", place_id: e.place_id, detail: { to: e.para, subject: e.assunto, avulso: true, programado: true, thread: enviado.threadId, msg: `${e.para} · ${e.assunto} (programado)` } });
        await db().from("envios_agendados").update({ status: "enviado", enviado_em: new Date().toISOString() }).eq("id", e.id);
        enviados++;
        continue;
      }
      if (!e.lead_id) throw new Error("sem lead");
      if (e.com_pdf) {
        const out = await runTool("enviar_diagnostico", {}, e.lead_id).catch((x) => `erro: ${String(x)}`);
        if (!out.startsWith("PDF enviado") && !out.includes("já foi enviado")) await logEvent(e.lead_id, "envio_programado_sem_pdf", { out: out.slice(0, 200) });
      }
      await enviarAoLead(e.lead_id, e.texto);
      // O follow-up automático não manda outra mensagem no mesmo dia
      const lead = await getLead(e.lead_id);
      if (lead.next_followup_at && new Date(lead.next_followup_at).getTime() < now.getTime() + 2 * 864e5)
        await updateLead(e.lead_id, { next_followup_at: new Date(now.getTime() + 2 * 864e5).toISOString() });
      await db().from("envios_agendados").update({ status: "enviado", enviado_em: new Date().toISOString() }).eq("id", e.id);
      await logEvent(e.lead_id, "envio_programado", { com_pdf: e.com_pdf });
      enviados++;
    } catch (x) {
      await db().from("envios_agendados").update({ status: "erro", erro: String((x as Error)?.message ?? x).slice(0, 300) }).eq("id", e.id);
    }
  }
  return { enviados };
}
