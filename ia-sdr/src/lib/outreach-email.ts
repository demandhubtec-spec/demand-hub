/**
 * Prospecção ativa · canal de e-mail (seção 7 do handoff).
 * Mesma lógica do antigo email_next do outreach-api, agora enviando direto pela Gmail API.
 * Roda a cada minuto via pg_cron → /api/prospeccao/email-tick.
 */
import { db } from "./db.ts";
import { accessToken } from "./google.ts";
import { render } from "./outreach-render.ts";

export const RODAPE_OPTOUT = "Se não quiser mais receber, é só responder 'sair'.";

interface Config {
  email_enabled: boolean;
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

export function buildMime(to: string, subject: string, body: string) {
  const subj = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  return [
    `To: ${to}`,
    `Subject: ${subj}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf8").toString("base64"),
  ].join("\r\n");
}

export async function gmailSend(to: string, subject: string, body: string) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken("gmail")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(buildMime(to, subject, body)) }),
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

/** Coloca o rodapé de opt-out, a não ser que o template já tenha um. */
export function comRodape(body: string) {
  return /\bsair\b/i.test(body) ? body : `${body}\n\n--\n${RODAPE_OPTOUT}`;
}

export async function runEmailTick(now = new Date()) {
  const { data: cfg, error } = await db().from("outreach_config").select("*").eq("id", 1).single<Config>();
  if (error || !cfg) return { skip: "config não encontrada", error: error?.message };

  if (!cfg.email_enabled) return { skip: "e-mail desligado" };
  if (!dentroDaJanela(cfg, now)) return { skip: "fora da janela" };
  if (cfg.next_email_at && new Date(cfg.next_email_at) > now) return { skip: "aguardando intervalo" };

  const { count: hoje } = await db()
    .from("outreach_leads")
    .select("place_id", { count: "exact", head: true })
    .eq("email_status", "enviado")
    .gte("email_sent_at", inicioDoDiaSP(now));
  if ((hoje ?? 0) >= cfg.email_daily_cap) return { skip: "teto diário atingido", hoje };

  // Próximo lead: e-mail pendente, que não respondeu nem pediu para sair no WhatsApp.
  const { data: fila } = await db()
    .from("outreach_leads")
    .select("place_id, empresa, decisor, cidade, nicho, email, prioridade, created_at, wa_status")
    .eq("email_status", "pendente")
    .not("email", "is", null)
    .not("wa_status", "in", "(respondeu,optout)")
    .order("created_at", { ascending: true })
    .limit(200);
  const ordem: Record<string, number> = { Alta: 0, "Média": 1, Media: 1, Baixa: 2 };
  const lead = (fila ?? []).sort((a, b) => (ordem[a.prioridade ?? ""] ?? 1) - (ordem[b.prioridade ?? ""] ?? 1))[0];
  if (!lead) return { skip: "fila de e-mail vazia" };

  const { data: tpls } = await db().from("outreach_templates").select("*").eq("channel", "email").eq("active", true);
  if (!tpls?.length) return { skip: "nenhum template de e-mail ativo" };
  const tpl = tpls[Math.floor(Math.random() * tpls.length)];

  const subject = render(tpl.subject || "{{empresa}}", lead, Math.random, now);
  const body = comRodape(render(tpl.body, lead, Math.random, now));

  // Agenda o próximo envio antes de enviar (evita dois envios se o cron sobrepor)
  const min = cfg.email_min_interval_sec, max = Math.max(cfg.email_max_interval_sec, min);
  const next = new Date(now.getTime() + (min + Math.random() * (max - min)) * 1000).toISOString();
  await db().from("outreach_config").update({ next_email_at: next }).eq("id", 1);

  if (cfg.dry_run) {
    await log("dry_run", { to: lead.email, subject, text: body }, lead.place_id);
    return { dry_run: true, to: lead.email, subject };
  }

  // Número de teste preenchido = modo ensaio: manda para o próprio Gmail do Kelvin e não mexe no lead.
  if (cfg.test_number) {
    const eu = await gmailRemetente();
    if (!eu) return { skip: "modo ensaio sem Gmail conectado" };
    try {
      await gmailSend(eu, `[TESTE → ${lead.email}] ${subject}`, body);
      await log("sent_test", { to: eu, subject, msg: `Teste de ${lead.empresa} enviado para ${eu}` }, lead.place_id);
      return { test: true, to: eu };
    } catch (e) {
      await log("error", { msg: String(e).slice(0, 300) }, lead.place_id);
      return { error: String(e) };
    }
  }

  try {
    await gmailSend(lead.email!, subject, body);
    await db()
      .from("outreach_leads")
      .update({ email_status: "enviado", email_sent_at: now.toISOString(), email_subject: subject })
      .eq("place_id", lead.place_id);
    await log("sent", { to: lead.email, subject, msg: `${lead.email} · ${subject}` }, lead.place_id);
    return { sent: true, to: lead.email };
  } catch (e) {
    await db().from("outreach_leads").update({ email_status: "erro", email_error: String(e).slice(0, 300) }).eq("place_id", lead.place_id);
    await log("error", { to: lead.email, msg: String(e).slice(0, 300) }, lead.place_id);
    return { error: String(e) };
  }
}
