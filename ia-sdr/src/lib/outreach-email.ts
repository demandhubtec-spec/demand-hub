/**
 * Prospecção ativa · canal de e-mail.
 * Manda os toques de e-mail da cadência (D0 tarde e D4) pela Gmail API, assinados pela Ana.
 * Roda a cada minuto via pg_cron → /api/prospeccao/email-tick.
 */
import { db } from "./db.ts";
import { accessToken } from "./google.ts";
import { env } from "./env.ts";
import { sendText } from "./evolution.ts";
import { SDR_CONFIG } from "../config/sdr.ts";

export const RODAPE_OPTOUT = "Se não quiser mais receber, é só responder 'sair'.";

interface Config {
  email_check_at?: string | null;
  optout_words?: string[];
  email_enabled: boolean;
  exigir_aprovacao?: boolean;
  dry_run: boolean;
  test_number: string | null;
  email_daily_cap: number;
  email_min_interval_sec: number;
  email_max_interval_sec: number;
  send_days: number[];
  send_start_hour: number;
  send_end_hour: number;
  next_email_at: string | null;
}

/** Hora e dia da semana em São Paulo. */
export function spNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { dow, hour: Number(get("hour")) % 24, ymd: `${get("year")}-${get("month")}-${get("day")}` };
}

export function dentroDaJanela(cfg: Pick<Config, "send_days" | "send_start_hour" | "send_end_hour">, d = new Date()) {
  const { dow, hour } = spNow(d);
  return (cfg.send_days ?? []).includes(dow) && hour >= cfg.send_start_hour && hour <= cfg.send_end_hour;
}

/** Início do dia de hoje em São Paulo, em UTC. */
function inicioDoDiaSP(d = new Date()) {
  const { ymd } = spNow(d);
  return new Date(`${ymd}T00:00:00-03:00`).toISOString();
}

function b64url(s: string | Uint8Array) {
  return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const enc = (s: string) => `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;

export function buildMime(to: string, subject: string, body: string, from?: string | null) {
  const subj = enc(subject);
  const b = `dh_${Date.now().toString(36)}`;
  const parte = (tipo: string, conteudo: string) =>
    [`--${b}`, `Content-Type: ${tipo}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", Buffer.from(conteudo, "utf8").toString("base64")].join("\r\n");
  return [
    ...(from ? [`From: ${enc(REMETENTE_NOME)} <${from}>`, `List-Unsubscribe: <mailto:${from}?subject=sair>`] : []),
    `To: ${to}`,
    `Subject: ${subj}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${b}"`,
    "",
    parte("text/plain", body),
    parte("text/html", emailHtml(body)),
    `--${b}--`,
    "",
  ].join("\r\n");
}

export const REMETENTE_NOME = "Ana da DemandIA";
/** Foto da assinatura (hospedada no portal; troque o arquivo para mudar a foto). */
export const FOTO_ASSINATURA = "https://portal.demandhub.com.br/brand/ana-email.jpg";
export const CARGO_ASSINATURA = SDR_CONFIG.cargoAssistente;
export const SITE_ASSINATURA = "demandhub.com.br";
const WA = SDR_CONFIG.whatsapp;
export const ASSINATURA = `Ana\n${CARGO_ASSINATURA} · DemandIA\nWhatsApp: ${WA.exibicao}\n${SITE_ASSINATURA}`;
const ehAssinatura = (b: string) => b.trim() === ASSINATURA || /^Ana\s*\n\s*DemandIA$/i.test(b.trim());

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Assinatura em HTML: foto, nome, cargo e site, no padrão de um e-mail profissional. */
export function assinaturaHtml() {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-top:1px solid #E6E3F0;padding-top:14px;font-family:Arial,Helvetica,sans-serif">
<tr><td style="padding-right:12px;vertical-align:middle"><img src="${FOTO_ASSINATURA}" width="64" height="64" alt="Ana" style="display:block;width:64px;height:64px;border-radius:50%;object-fit:cover"></td>
<td style="vertical-align:middle;font-size:13px;line-height:18px;color:#3A3550">
<div style="font-size:15px;font-weight:bold;color:#1B1530">Ana</div>
<div>${CARGO_ASSINATURA} &middot; <span style="color:#5A28E0;font-weight:bold">DemandIA</span></div>
<div style="margin-top:2px">WhatsApp: <a href="https://wa.me/${WA.numero}" style="color:#1B1530;text-decoration:none;font-weight:bold">${WA.exibicao}</a> &middot; <a href="https://${SITE_ASSINATURA}" style="color:#5A28E0;text-decoration:none">${SITE_ASSINATURA}</a></div>
<div style="margin-top:8px"><a href="https://wa.me/${WA.numero}" style="display:inline-block;background:#1FA855;color:#ffffff;text-decoration:none;font-weight:bold;font-size:12px;padding:6px 12px;border-radius:14px">Chamar no WhatsApp</a></div>
</td></tr></table>`;
}

/** Versão HTML do e-mail: parágrafos simples, a assinatura com foto e o aviso de saída discreto. */
export function emailHtml(texto: string) {
  const blocos = texto.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const html = blocos
    .map((b) => {
      if (ehAssinatura(b)) return assinaturaHtml();
      if (b === RODAPE_OPTOUT) return `<p style="margin:16px 0 0;font-size:11px;color:#9A96A8">${esc(b)}</p>`;
      return `<p style="margin:0 0 12px">${esc(b).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#1B1530;max-width:560px">\n${html}\n</div>`;
}

export async function gmailSend(to: string, subject: string, body: string, from?: string | null) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken("gmail")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(buildMime(to, subject, body, from)) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  const r = json as { id?: string; threadId?: string };
  return { id: r.id ?? null, threadId: r.threadId ?? null };
}

interface GmailMsg {
  id: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

const BOUNCE = /mailer-daemon|postmaster|mail delivery|delivery status/i;

/** Uma mensagem de outra pessoa na conversa: resposta, ou aviso de que o e-mail voltou. */
export function classificarThread(msgs: GmailMsg[], optoutWords: string[] = []) {
  const deles = msgs.filter((m) => !(m.labelIds ?? []).includes("SENT"));
  if (!deles.length) return null;
  const m = deles[0];
  const from = m.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
  const subject = m.payload?.headers?.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
  if (BOUNCE.test(from) || BOUNCE.test(subject)) return { tipo: "bounce" as const, texto: m.snippet ?? "", de: from };
  const texto = (m.snippet ?? "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const low = texto.toLowerCase();
  const optout = /\bsair\b/.test(low) || optoutWords.some((w) => w && low.includes(w.toLowerCase()));
  return { tipo: optout ? ("optout" as const) : ("resposta" as const), texto, de: from, em: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null };
}

/**
 * Olha as conversas dos e-mails enviados (a cada 10 minutos) e marca quem respondeu,
 * quem pediu para sair e quem teve o e-mail devolvido. Avisa o Kelvin no WhatsApp quando alguém responde.
 */
export async function checarRespostasEmail(cfg: { email_check_at?: string | null; optout_words?: string[] }, now = new Date()) {
  if (cfg.email_check_at && new Date(cfg.email_check_at) > now) return { email_check: "aguardando" };
  await db().from("outreach_config").update({ email_check_at: new Date(now.getTime() + 10 * 60_000).toISOString() }).eq("id", 1);
  let token: string;
  try {
    token = await accessToken("gmail");
  } catch {
    return { email_check: "gmail não conectado" };
  }
  const { data: leads } = await db()
    .from("outreach_leads")
    .select("place_id, empresa, email, email_threads, toque_atual, cadencia, wa_status")
    .eq("email_status", "enviado")
    .not("email_threads", "is", null)
    .order("email_sent_at", { ascending: false })
    .limit(60);
  let respostas = 0;
  for (const l of leads ?? []) {
    for (const threadId of (l.email_threads ?? []) as string[]) {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!r.ok) continue;
      const t = (await r.json()) as { messages?: GmailMsg[] };
      const c = classificarThread(t.messages ?? [], cfg.optout_words);
      if (!c) continue;
      if (c.tipo === "bounce") {
        await db().from("outreach_leads").update({ email_status: "erro", email_error: "o e-mail voltou: endereço inválido" }).eq("place_id", l.place_id);
        await log("bounce", { msg: `${l.empresa}: o e-mail voltou (${l.email})` }, l.place_id);
        break;
      }
      const parar = !["respondeu", "parada"].includes(l.cadencia ?? "");
      await db()
        .from("outreach_leads")
        .update({
          email_status: c.tipo === "optout" ? "optout" : "respondeu",
          replied_at: c.em ?? now.toISOString(),
          reply_text: c.texto.slice(0, 1000),
          ...(parar
            ? { cadencia: c.tipo === "optout" ? "parada" : "respondeu", respondeu_no_toque: l.toque_atual || 1, proximo_toque_em: null, proximo_canal: null }
            : {}),
        })
        .eq("place_id", l.place_id);
      await log(c.tipo === "optout" ? "optout" : "reply", { text: c.texto.slice(0, 300), toque: l.toque_atual, msg: `${l.empresa} respondeu o e-mail` }, l.place_id);
      if (c.tipo === "resposta" && env.ownerPhone) {
        await sendText(
          env.ownerPhone,
          `*${l.empresa}* respondeu o e-mail da prospecção:\n"${c.texto.slice(0, 300)}"\n\nResponda pelo Gmail da DemandIA. A cadência dessa empresa foi parada.`,
        ).catch(() => null);
      }
      respostas++;
      break;
    }
  }
  return { email_check: "ok", respostas };
}

async function gmailRemetente(): Promise<string | null> {
  const row = await db().from("sdr_integrations").select("value").eq("key", "gmail").maybeSingle();
  return (row.data?.value as { email?: string } | undefined)?.email ?? null;
}

const log = (event: string, detail: Record<string, unknown>, place_id: string | null = null) =>
  db().from("outreach_log").insert({ channel: "email", event, detail, place_id });

/** Assinatura da Ana + rodapé de opt-out (a não ser que o texto já fale em "sair"). */
export function comRodape(body: string) {
  const assinado = body.includes(ASSINATURA) || /\n\s*Ana\s*\n\s*DemandIA\s*$/i.test(body) ? body : `${body.trim()}\n\n${ASSINATURA}`;
  return /\bsair\b/i.test(body) ? assinado : `${assinado}\n\n${RODAPE_OPTOUT}`;
}

interface ToqueEmail {
  n: number;
  canal: string;
  assunto?: string;
  texto: string;
}

export async function runEmailTick(now = new Date()) {
  const { data: cfg, error } = await db().from("outreach_config").select("*").eq("id", 1).single<Config>();
  if (error || !cfg) return { skip: "config não encontrada", error: error?.message };

  // Respostas e devoluções de e-mail (roda mesmo com o envio desligado)
  const check = await checarRespostasEmail(cfg, now).catch((e) => ({ email_check: String(e).slice(0, 200) }));

  if (!cfg.email_enabled) return { ...check, skip: "e-mail desligado" };
  if (!dentroDaJanela(cfg, now)) return { skip: "fora da janela" };
  if (cfg.next_email_at && new Date(cfg.next_email_at) > now) return { skip: "aguardando intervalo" };

  // Teto do dia: conta os e-mails que saíram hoje (reais e de teste)
  const { count: hoje } = await db()
    .from("outreach_log")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .in("event", ["sent", "sent_test"])
    .gte("created_at", inicioDoDiaSP(now));
  if ((hoje ?? 0) >= cfg.email_daily_cap) return { skip: "teto diário atingido", hoje };

  const agendar = async () => {
    const min = cfg.email_min_interval_sec, max = Math.max(cfg.email_max_interval_sec, min);
    const next = new Date(now.getTime() + (min + Math.random() * (max - min)) * 1000).toISOString();
    await db().from("outreach_config").update({ next_email_at: next }).eq("id", 1);
  };
  const eu = await gmailRemetente();

  if (cfg.dry_run) return { skip: "modo teste: nada sai" };

  // Número de teste preenchido: manda o 1º e-mail da sequência de um lead aprovado
  // para o próprio Gmail, sem mexer no lead. Um por lead por dia.
  if (cfg.test_number) {
    if (!eu) return { skip: "modo teste sem Gmail conectado" };
    const { data: testados } = await db()
      .from("outreach_log")
      .select("place_id")
      .eq("channel", "email")
      .eq("event", "sent_test")
      .gte("created_at", inicioDoDiaSP(now));
    const ja = new Set((testados ?? []).map((x) => x.place_id));
    const { data: aprovados } = await db()
      .from("outreach_leads")
      .select("place_id, empresa, email, sequencia")
      .eq("msg_status", "aprovada")
      .not("sequencia", "is", null)
      .order("msg_aprovada_em", { ascending: true })
      .limit(50);
    const lead = (aprovados ?? []).find((l) => !ja.has(l.place_id));
    if (!lead) return { skip: "nenhum lead aprovado para testar" };
    const toque = ((lead.sequencia ?? []) as ToqueEmail[]).find((t) => t.canal === "email");
    if (!toque) return { skip: "sequência sem e-mail" };
    await agendar();
    try {
      await gmailSend(eu, `[TESTE para ${lead.email ?? "lead sem e-mail"}] ${toque.assunto ?? lead.empresa}`, comRodape(toque.texto), eu);
      await log("sent_test", { to: eu, subject: toque.assunto, msg: `Teste do e-mail de ${lead.empresa} enviado para ${eu}` }, lead.place_id);
      return { test: true, to: eu };
    } catch (e) {
      await log("error", { msg: String(e).slice(0, 300) }, lead.place_id);
      return { error: String(e) };
    }
  }

  // Toque de e-mail devido na cadência
  const { data: fila } = await db()
    .from("outreach_leads")
    .select("place_id, empresa, email, email_status, email_threads, wa_status, sequencia, toque_atual")
    .eq("cadencia", "ativa")
    .eq("proximo_canal", "email")
    .lte("proximo_toque_em", now.toISOString())
    .order("proximo_toque_em", { ascending: true })
    .limit(1);
  const lead = fila?.[0];
  if (!lead) return { skip: "nenhum e-mail devido" };

  const toque = ((lead.sequencia ?? []) as ToqueEmail[])[lead.toque_atual];
  const pular = async (motivo: string) => {
    await log("pulado", { msg: `${lead.empresa}: e-mail pulado (${motivo})`, toque: lead.toque_atual + 1 }, lead.place_id);
    await db().rpc("outreach_avancar_cadencia", { p_place_id: lead.place_id, p_resultado: "pulado" });
    return { skip: "pulado", motivo };
  };
  if (!lead.email || !toque?.texto) return pular("sem e-mail ou sem texto");
  if (["respondeu", "optout"].includes(lead.wa_status ?? "")) return pular("lead já respondeu");

  await agendar();
  const subject = toque.assunto || lead.empresa;
  try {
    const enviado = await gmailSend(lead.email, subject, comRodape(toque.texto), eu);
    const patch: Record<string, unknown> = {
      email_subject: subject,
      email_threads: [...((lead.email_threads ?? []) as string[]), ...(enviado.threadId ? [enviado.threadId] : [])],
    };
    if (lead.email_status !== "enviado") {
      patch.email_status = "enviado";
      patch.email_sent_at = now.toISOString();
    }
    await db().from("outreach_leads").update(patch).eq("place_id", lead.place_id);
    await log("sent", { to: lead.email, subject, toque: lead.toque_atual + 1, msg: `${lead.email} · ${subject}` }, lead.place_id);
    await db().rpc("outreach_avancar_cadencia", { p_place_id: lead.place_id, p_resultado: "enviado" });
    return { sent: true, to: lead.email };
  } catch (e) {
    await db().from("outreach_leads").update({ email_status: "erro", email_error: String(e).slice(0, 300) }).eq("place_id", lead.place_id);
    await log("error", { to: lead.email, msg: String(e).slice(0, 300) }, lead.place_id);
    await db().rpc("outreach_avancar_cadencia", { p_place_id: lead.place_id, p_resultado: "pulado" });
    return { error: String(e) };
  }
}
