/**
 * Envios programados (17/11, Kelvin): mensagens que o Kelvin revisou e aprovou para sair num horário certo,
 * pelo número da SDR de cada lead. Com PDF: o diagnóstico vai antes do texto.
 * Tabela envios_agendados (lead_id, texto, enviar_em, com_pdf, status, enviado_em, erro).
 */
import { db, getLead, logEvent, updateLead } from "./db.ts";
import { enviarAoLead } from "./canal.ts";
import { DIAGNOSTICO_PAUSADO, runTool, TEXTO_PDF_PROMETIDO } from "./tools.ts";
import { prospeccaoDoTelefone } from "./prospeccao.ts";
import { toLocal } from "./time.ts";
import { comRodape, gmailRemetente, gmailSend } from "./outreach-email.ts";

export async function runEnviosAgendados(now = new Date()) {
  // Só em horário comercial: dias úteis das 8h às 18h e sábado das 8h ao meio-dia, como os follow-ups
  // (21/11: os 5 envios aprovados para sábado 9h ficaram parados porque sábado era bloqueado)
  const { h, dow } = toLocal(now);
  if (h < 8 || dow === 0 || (dow === 6 ? h >= 12 : h >= 18)) return { pulado: "fora do horário" };
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
        // 22/11: conversa da Marina → o e-mail sai em nome dela (texto termina com "Marina\nDemandIA")
        const daMarina = /\n\s*Marina\s*\n\s*DemandIA\s*$/i.test(e.texto);
        const enviado = await gmailSend(String(e.para), String(e.assunto), comRodape(e.texto), await gmailRemetente(), daMarina ? "Marina da DemandIA" : undefined);
        if (e.place_id) await db().from("outreach_log").insert({ channel: "email", event: "sent", place_id: e.place_id, detail: { to: e.para, subject: e.assunto, avulso: true, programado: true, thread: enviado.threadId, msg: `${e.para} · ${e.assunto} (programado)` } });
        await db().from("envios_agendados").update({ status: "enviado", enviado_em: new Date().toISOString() }).eq("id", e.id);
        enviados++;
        continue;
      }
      if (!e.lead_id) throw new Error("sem lead");
      // 28/11 (Kelvin): diagnóstico em revisão. Envio antigo com PDF não sai (a RR Lanches recebeu um às 8h02).
      if (e.com_pdf && DIAGNOSTICO_PAUSADO) {
        await db().from("envios_agendados").update({ status: "cancelado", erro: "diagnóstico pausado (consultoria gratuita no lugar)" }).eq("id", e.id);
        await logEvent(e.lead_id, "envio_programado_cancelado", { motivo: "diagnostico_pausado" });
        continue;
      }
      if (e.com_pdf) {
        // 18/11: PDF ainda não ficou pronto? Espera mais 30 minutos (até 3 dias), sem mandar o texto sozinho
        const lead0 = await getLead(e.lead_id);
        const p = await prospeccaoDoTelefone(lead0.phone).catch(() => null);
        const automatico = e.texto === TEXTO_PDF_PROMETIDO;
        if (p?.diag_enviado_em && automatico) {
          await db().from("envios_agendados").update({ status: "cancelado", erro: "diagnóstico já tinha sido enviado" }).eq("id", e.id);
          continue;
        }
        if (!p?.diag_enviado_em && !p?.marca?.pdf) {
          const { data: linha } = await db().from("envios_agendados").select("created_at").eq("id", e.id).maybeSingle();
          const velho = linha?.created_at && now.getTime() - new Date(linha.created_at).getTime() > 3 * 864e5;
          await db().from("envios_agendados").update(velho ? { status: "erro", erro: "PDF não ficou pronto em 3 dias" } : { status: "agendado", enviar_em: new Date(now.getTime() + 30 * 60e3).toISOString() }).eq("id", e.id);
          continue;
        }
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
      // 18/11: o WhatsApp demora a confirmar e o envio sai mesmo assim (Sorriso e Dra. Bárbara responderam):
      // tempo esgotado conta como enviado, para ninguém mandar de novo
      const erro = String((x as Error)?.message ?? x).slice(0, 300);
      const timeout = /timeout|aborted/i.test(erro);
      await db().from("envios_agendados").update(timeout ? { status: "enviado", enviado_em: new Date().toISOString(), erro: `sem confirmação: ${erro}` } : { status: "erro", erro }).eq("id", e.id);
    }
  }
  return { enviados };
}
