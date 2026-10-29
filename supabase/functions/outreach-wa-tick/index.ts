import { createClient } from "npm:@supabase/supabase-js@2";
// ---- render de templates (spintax + variáveis) ----
// Mantenha igual a src/lib/outreach-render.ts (prévia do portal) e ia-sdr/src/lib/outreach-render.ts (e-mail).
const NICHO_PLURAL: Record<string, string> = {
  "Clínica médica": "clínicas",
  "Advocacia": "escritórios de advocacia",
  "Odontologia": "clínicas odontológicas",
  "Imobiliária": "imobiliárias",
  "Pet shop / Veterinária": "pet shops e clínicas veterinárias",
  "Endocrinologia": "consultórios de endocrinologia",
};
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
function spHour(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(new Date()));
}
function spWeekday(): number {
  const d = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(d);
}
function spTodayStartISO(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${p}T00:00:00-03:00`).toISOString();
}
function saudacao() {
  const h = spHour();
  if (h < 12) return pick(["Bom dia", "Olá, bom dia"]);
  if (h < 18) return pick(["Boa tarde", "Olá, boa tarde"]);
  return "Boa noite";
}
function primeiroNome(d?: string | null) {
  if (!d) return "";
  const n = d.trim().split(/\s+/)[0];
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}
function limpaEmpresa(n: string) {
  return (n || "").split(/\s+[|\-–•]\s+/)[0].trim();
}
function spin(t: string) {
  const re = /\{([^{}]*\|[^{}]*)\}/;
  while (re.test(t)) t = t.replace(re, (_m, g) => pick(g.split("|")));
  return t;
}
function render(text: string, lead: any) {
  const pn = primeiroNome(lead.decisor);
  const vars: Record<string, string> = {
    "saudacao": saudacao(),
    ", primeiro_nome": pn ? `, ${pn}` : "",
    "primeiro_nome": pn,
    "empresa": limpaEmpresa(lead.empresa),
    "cidade": lead.cidade || "",
    "nicho": lead.nicho || "",
    "nicho_plural": NICHO_PLURAL[lead.nicho] || "empresas",
  };
  for (const [k, v] of Object.entries(vars)) text = text.split(`{{${k}}}`).join(v);
  return spin(text).trim();
}
const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Quebra o texto em balões nas linhas em branco (no máximo 3), como uma pessoa mandaria no WhatsApp. */
function baloes(t: string): string[] {
  const parts = t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 3 ? [...parts.slice(0, 2), parts.slice(2).join("\n\n")] : parts;
}
/** Envia balão por balão, com "digitando..." e uma pausa natural entre eles. */
async function enviarBaloes(path: string, to: string, text: string): Promise<{ ok: boolean; status: number; body: string }> {
  const parts = baloes(text);
  let last = { ok: true, status: 200, body: "" };
  for (let i = 0; i < parts.length; i++) {
    const r = await fetch(`${EVO_URL}${path}`, {
      method: "POST",
      headers: { apikey: EVO_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ number: to, text: parts[i], delay: Math.min(1200 + parts[i].length * 25, 4000) }),
    });
    last = { ok: r.ok, status: r.status, body: await r.text() };
    if (!r.ok) return last;
    if (i < parts.length - 1) await sleep(rand(2500, 5000));
  }
  return last;
}
// Chamada pelo pg_cron a cada minuto. Envia no máximo 1 WhatsApp por chamada,
// respeitando janela, teto diário e intervalo aleatório. Também detecta respostas
// lendo (somente leitura) as tabelas do SDR, que recebe o webhook do Evolution.

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const EVO_URL = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/$/, "");
const EVO_TOKEN = Deno.env.get("EVOLUTION_INSTANCE_TOKEN") || "";
const CRON_SECRET = Deno.env.get("OUTREACH_CRON_SECRET") || "";

const log = (place_id: string | null, event: string, detail: any = {}) =>
  sb.from("outreach_log").insert({ place_id, channel: "whatsapp", event, detail });

async function detectReplies(cfg: any) {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: sent } = await sb.from("outreach_leads")
    .select("place_id, empresa, whatsapp, wa_sent_at, email_status")
    .eq("wa_status", "enviado").gte("wa_sent_at", since).limit(500);
  let n = 0;
  for (const l of sent || []) {
    const tail = (l.whatsapp || "").slice(-8);
    if (!tail) continue;
    const { data: sl } = await sb.from("sdr_leads").select("id, last_inbound_at")
      .like("phone", `%${tail}`).gt("last_inbound_at", l.wa_sent_at).limit(1);
    if (!sl?.length) continue;
    // sdr_messages.direction é 'in' | 'out' (antes buscava 'inbound' e nunca achava o texto)
    const { data: msg } = await sb.from("sdr_messages").select("content")
      .eq("lead_id", sl[0].id).eq("direction", "in").gt("created_at", l.wa_sent_at)
      .order("created_at", { ascending: true }).limit(1);
    const text = msg?.[0]?.content || "";
    const optout = (cfg.optout_words || []).some((w: string) => text.toLowerCase().includes(w));
    await sb.from("outreach_leads").update({
      wa_status: optout ? "optout" : "respondeu",
      replied_at: sl[0].last_inbound_at, reply_text: text.slice(0, 1000),
      email_status: l.email_status === "pendente" ? "ignorado" : l.email_status,
      updated_at: new Date().toISOString(),
    }).eq("place_id", l.place_id);
    await log(l.place_id, optout ? "optout" : "reply", { text: text.slice(0, 300) });
    n++;
  }
  return n;
}

async function checkNumber(num: string): Promise<{ ok: boolean; jid?: string; name?: string } | null> {
  try {
    const r = await fetch(`${EVO_URL}/user/check`, {
      method: "POST", headers: { apikey: EVO_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ number: [num] }),
    });
    const u = (await r.json())?.data?.Users?.[0];
    if (!u) return null;
    return { ok: !!u.IsInWhatsapp, jid: u.JID, name: u.VerifiedName };
  } catch { return null; }
}

async function instanceOk() {
  try {
    const r = await fetch(`${EVO_URL}/instance/status`, { headers: { apikey: EVO_TOKEN } });
    const j = await r.json();
    const d = j?.data ?? j;
    const c = d?.Connected ?? d?.connected, l = d?.LoggedIn ?? d?.loggedIn;
    return c !== false && l !== false;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET)
    return new Response("unauthorized", { status: 401 });
  const out: any = {};
  const { data: cfg } = await sb.from("outreach_config").select("*").eq("id", 1).single();
  out.replies = await detectReplies(cfg);

  if (!cfg.wa_enabled) return Response.json({ ...out, skip: "wa_disabled" });
  const h = spHour(), wd = spWeekday();
  if (!cfg.send_days.includes(wd) || h < cfg.send_start_hour || h > cfg.send_end_hour)
    return Response.json({ ...out, skip: "fora_da_janela" });
  if (cfg.next_wa_at && new Date(cfg.next_wa_at) > new Date())
    return Response.json({ ...out, skip: "aguardando_intervalo", next: cfg.next_wa_at });

  const { count } = await sb.from("outreach_leads").select("place_id", { count: "exact", head: true })
    .gte("wa_sent_at", spTodayStartISO());
  if ((count || 0) >= cfg.wa_daily_cap) return Response.json({ ...out, skip: "teto_diario", count });

  if (!cfg.dry_run && !(await instanceOk())) {
    await log(null, "instance_down");
    await sb.from("outreach_config").update({ next_wa_at: new Date(Date.now() + 10 * 60e3).toISOString() }).eq("id", 1);
    return Response.json({ ...out, skip: "instancia_desconectada" });
  }

  // Com "exigir aprovação" ligado (padrão), só sai mensagem personalizada que o Kelvin aprovou no portal
  let fila = sb.from("outreach_leads").select("*")
    .eq("wa_status", "pendente").not("whatsapp", "is", null);
  if (cfg.exigir_aprovacao !== false) fila = fila.eq("msg_status", "aprovada");
  const { data: leads } = await fila
    .order("prioridade", { ascending: true }).order("created_at", { ascending: true }).limit(1);
  const lead = leads?.[0];
  if (!lead) return Response.json({ ...out, skip: cfg.exigir_aprovacao !== false ? "nenhuma_aprovada" : "fila_vazia" });

  let text: string;
  if (lead.msg_status === "aprovada" && lead.msg_rascunho) {
    text = String(lead.msg_rascunho).trim();
  } else {
    const { data: tpls } = await sb.from("outreach_templates").select("body").eq("channel", "whatsapp").eq("active", true);
    if (!tpls?.length) return Response.json({ ...out, skip: "sem_template" });
    text = render(tpls[Math.floor(Math.random() * tpls.length)].body, lead);
  }
  let to = (cfg.test_number || "").replace(/\D/g, "") || lead.whatsapp;
  if (!cfg.dry_run && !cfg.test_number) {
    const chk = await checkNumber(lead.whatsapp);
    if (chk && !chk.ok) {
      await sb.from("outreach_leads").update({ wa_status: "sem_whatsapp", wa_error: "número sem WhatsApp", updated_at: new Date().toISOString() }).eq("place_id", lead.place_id);
      await log(lead.place_id, "sem_whatsapp", { num: lead.whatsapp });
      return Response.json({ ...out, skip: "sem_whatsapp", lead: lead.empresa });
    }
    if (chk?.jid) to = chk.jid.split("@")[0];
  }
  const nextAt = new Date(Date.now() + rand(cfg.wa_min_interval_sec, cfg.wa_max_interval_sec) * 1000).toISOString();
  await sb.from("outreach_config").update({ next_wa_at: nextAt }).eq("id", 1);

  if (cfg.dry_run) {
    await log(lead.place_id, "dry_run", { to, text });
    return Response.json({ ...out, dry_run: true, to, text, next: nextAt });
  }

  const r = await enviarBaloes(cfg.evolution_send_path, to, text);
  const body = r.body;
  if (r.ok) {
    if (!cfg.test_number) {
      await sb.from("outreach_leads").update({
        wa_status: "enviado", wa_sent_at: new Date().toISOString(), wa_message: text,
        updated_at: new Date().toISOString(),
      }).eq("place_id", lead.place_id);
    }
    await log(lead.place_id, cfg.test_number ? "sent_test" : "sent", { to, resp: body.slice(0, 300) });
    return Response.json({ ...out, sent: lead.empresa, to, next: nextAt });
  }
  const attempts = lead.wa_attempts + 1;
  const low = body.toLowerCase();
  const status = /not on whatsapp|not registered|not exist|invalid|não existe/.test(low) ? "sem_whatsapp" : attempts >= 2 ? "erro" : "pendente";
  await sb.from("outreach_leads").update({ wa_status: status, wa_attempts: attempts, wa_error: `${r.status}: ${body.slice(0, 300)}`, updated_at: new Date().toISOString() }).eq("place_id", lead.place_id);
  await log(lead.place_id, "error", { status: r.status, body: body.slice(0, 300) });
  return Response.json({ ...out, error: r.status, body: body.slice(0, 300) });
});
