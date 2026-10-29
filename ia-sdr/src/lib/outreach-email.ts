/**
 * Prospecção ativa · canal de e-mail.
 * Manda os toques de e-mail da cadência (D0 tarde e D4) pela Gmail API, assinados pela Ana.
 * Roda a cada minuto via pg_cron → /api/prospeccao/email-tick.
 */
import { db } from "./db.ts";
import { accessToken } from "./google.ts";

export const RODAPE_OPTOUT = "Se não quiser mais receber, é só responder 'sair'.";

interface Config {
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
  return [
    ...(from ? [`From: ${enc(REMETENTE_NOME)} <${from}>`] : []),
    `To: ${to}`,
    `Subject: ${subj}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf8").toString("base64"),
  ].join("\r\n");
}

export const REMETENTE_NOME = "Ana da DemandIA";
export const ASSINATURA = "Ana\nDemandIA";

export async function gmailSend(to: string, subject: string, body: string, from?: string | null) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken("gmail")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(buildMime(to, subject, body, from)) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return (json as { id?: string }).id ?? null;
}

async function gmailRemetente(): Promise<string | null> {
  const row = await db().from("sdr_integrations").select("value").eq("key", "gmail").maybeSingle();
  return (row.data?.value as { email?: string } | undefined)?.email ?? null;
}

const log = (event: string, detail: Record<string, unknown>, place_id: string | null = null) =>
  db().from("outreach_log").insert({ channel: "email", event, detail, place_id });

/** Assinatura da Ana + rodapé de opt-out (a não ser que o texto já fale em "sair"). */
export function comRodape(body: string) {
  const assinado = /\n\s*Ana\s*\n\s*DemandIA\s*$/i.test(body) ? body : `${body.trim()}\n\n${ASSINATURA}`;
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

  if (!cfg.email_enabled) return { skip: "e-mail desligado" };
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
    .select("place_id, empresa, email, email_status, wa_status, sequencia, toque_atual")
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
    await gmailSend(lead.email, subject, comRodape(toque.texto), eu);
    const patch: Record<string, unknown> = { email_subject: subject };
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
