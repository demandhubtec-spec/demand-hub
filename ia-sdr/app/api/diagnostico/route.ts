/**
 * Formulário da landing page /diagnostico.
 * 1. Salva as respostas + UTMs em sdr_diagnosticos (é o que alimenta a planilha).
 * 2. Cria ou atualiza o lead em sdr_leads com os dados do BANT.
 * 3. Grava na planilha do Google (que manda o aviso por e-mail) e avisa o Kelvin no WhatsApp.
 * 4. A IA SDR abre a conversa no WhatsApp do lead.
 */
import { waitUntil } from "@vercel/functions";
import { handleInbound } from "@/src/lib/agent.ts";
import { addMessage, db, logEvent, type Lead } from "@/src/lib/db.ts";
import { aberturaParaIA, avisoKelvin, diagRow, leadPatch, origemTxt, parseForm, phoneVariants, sheetRow } from "@/src/lib/diagnostico.ts";
import { env } from "@/src/lib/env.ts";
import { isBlocked } from "@/src/lib/bloqueio.ts";
import { sendText } from "@/src/lib/evolution.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

const CLOSED = ["agendado", "humano", "opt_out", "cliente"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parseForm(body);
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  const f = parsed.form;
  if (f.honeypot) return Response.json({ ok: true }); // robô: finge que deu certo

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const ua = req.headers.get("user-agent");

  // Mesmo WhatsApp em menos de 10 min = clique duplo / reenvio: não duplica
  const recent = await db()
    .from("sdr_diagnosticos")
    .select("id")
    .in("whatsapp", phoneVariants(f.whatsapp))
    .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(1);
  if (recent.data?.length) return Response.json({ ok: true, duplicate: true });

  // Lead: procura pelas duas formas do número (com e sem o 9)
  const { patch, bant } = leadPatch(f);
  const found = await db().from("sdr_leads").select("*").in("phone", phoneVariants(f.whatsapp)).limit(1).maybeSingle();
  let lead = found.data as Lead | null;
  let isNew = false;
  if (lead) {
    const upd: Record<string, unknown> = { ...patch };
    if (!CLOSED.includes(lead.status)) {
      upd.status = bant.qualificado ? "qualificado" : "em_qualificacao";
      upd.followup_attempts = 0;
      upd.next_followup_at = null;
    }
    await db().from("sdr_leads").update(upd).eq("id", lead.id);
  } else {
    const ins = await db()
      .from("sdr_leads")
      .insert({ phone: f.whatsapp, origem: "lp_diagnostico", ...patch, status: bant.qualificado ? "qualificado" : "novo" })
      .select("*")
      .single();
    if (ins.error) {
      console.error("diagnostico: erro ao criar lead", ins.error);
      return Response.json({ ok: false, error: "db" }, { status: 500 });
    }
    lead = ins.data as Lead;
    isNew = true;
  }

  const saved = await db().from("sdr_diagnosticos").insert(diagRow(f, lead.id, ip, ua)).select("id").single();
  if (saved.error) {
    console.error("diagnostico: erro ao salvar", saved.error);
    return Response.json({ ok: false, error: "db" }, { status: 500 });
  }
  await logEvent(lead.id, "diagnostico_lp", { diagnostico_id: saved.data.id, novo_lead: isNew, utm: f.utm, bant: bant.score });

  const leadId = lead.id;
  const aiOff = lead.ai_paused || CLOSED.includes(lead.status) || isBlocked(f.whatsapp);
  waitUntil(
    (async () => {
      // Planilha do Google + e-mail de aviso (Apps Script)
      if (env.sheetWebhookUrl) {
        try {
          const data = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
          const res = await fetch(env.sheetWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              secret: env.sheetWebhookSecret,
              row: sheetRow(f, { id: saved.data.id, bant: bant.score, data }),
              origem: origemTxt(f),
            }),
            redirect: "follow",
          });
          if (!res.ok) console.error("diagnostico: planilha respondeu", res.status);
        } catch (e) {
          console.error("diagnostico: planilha falhou", e);
        }
      }
      // Aviso para o Kelvin no WhatsApp
      const alertPhone = env.alertPhone;
      if (alertPhone) {
        try {
          await sendText(alertPhone, avisoKelvin(f, bant.score) + (aiOff ? "\n\n⚠️ A IA está pausada para este contato: responda você." : ""));
        } catch (e) {
          console.error("diagnostico: aviso falhou", e);
        }
      }
      if (aiOff) return;
      // A IA abre a conversa
      const msg = await addMessage({ lead_id: leadId, direction: "in", author: "sistema", content: aberturaParaIA(f, bant.desqualificado) });
      if (msg) await handleInbound(leadId, msg.id);
    })(),
  );

  return Response.json({ ok: true });
}
