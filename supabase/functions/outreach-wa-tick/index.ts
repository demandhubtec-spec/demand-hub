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
  return parts.length > 4 ? [...parts.slice(0, 3), parts.slice(3).join("\n\n")] : parts;
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
const semAcento = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const PALAVRA_EMPRESA = /(cl[ií]nica|odonto|dent|advog|advoc|jur[ií]dic|im[oó]v|imobili|consult|centro|instituto|n[uú]cleo|studio|est[uú]dio|\bpet\b|vet|ltda|\bme\b|eireli|grupo|escrit[oó]rio|sa[uú]de|m[eé]dic|\bmed\b|lab|diagn|contab|loja|atendimento|recep|oficial|unidade|agro|com[eé]rcio|servi[cç]o|&|\d)/i;
/** Nome que o WhatsApp mostra para o número (perfil comercial verificado), se vier na checagem. */
function nomeDoWhats(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  const o = v as Record<string, any>;
  return String(o?.Details?.verifiedName ?? o?.details?.verifiedName ?? o?.VerifiedName ?? o?.verifiedName ?? o?.name ?? "").trim();
}
/** Primeiro nome de um texto que parece nome de pessoa ("Dra. Joyce Martins" → "Dra. Joyce"); vazio se parece nome de empresa. */
function nomeDePessoa(t: string): string {
  const s = (t || "").replace(/[|•–-].*$/, "").trim();
  if (!s || PALAVRA_EMPRESA.test(s) || s.split(/\s+/).length > 4) return "";
  const m = s.match(/^(dr\.?a?|dra\.?)\s+(\p{L}+)/iu);
  if (m) return `${/a/i.test(m[1]) ? "Dra." : "Dr."} ${primeiroNome(m[2])}`;
  const p = s.split(/\s+/)[0];
  return /^\p{L}{3,}$/u.test(p) ? primeiroNome(p) : "";
}
/**
 * Como chamar a pessoa na saudação. O decisor vem do CNPJ e quase sempre o número é da recepção,
 * então só usamos um nome quando ele bate com o que aparece no WhatsApp ou no nome da empresa.
 * Na dúvida, sem nome ("Oi, boa tarde!") soa melhor do que chamar alguém pelo nome errado.
 */
function nomeParaSaudar(lead: { decisor?: string | null; empresa?: string | null }, whats?: string): string {
  const pn = primeiroNome(lead.decisor);
  const w = whats || "";
  if (pn && pn.length >= 3) {
    const alvo = semAcento(pn);
    for (const fonte of [w, lead.empresa || ""]) {
      if (!new RegExp(`\\b${alvo}\\b`).test(semAcento(fonte))) continue;
      const dr = fonte.match(new RegExp(`\\b(dra?)\\.?\\s+${pn}`, "i"));
      return dr ? `${/a/i.test(dr[1]) ? "Dra." : "Dr."} ${pn}` : pn;
    }
  }
  return nomeDePessoa(w);
}
/** Saudação curta que vai sozinha antes de cada mensagem no WhatsApp: "Oi, Helton, boa tarde! 😊". */
function saudacaoCurta(nome?: string) {
  const h = spHour();
  const periodo = h < 12 ? "bom dia" : h < 18 ? "boa tarde" : "boa noite";
  return `${pick(["Oi", "Olá"])}, ${nome ? `${nome}, ` : ""}${periodo}! ${pick(["😊", "🙂", "👋"])}`;
}
const CONTEXTO = /(te chamei|separei|imagino|fiz uma an[aá]lise|fiquei pensando|a gente ajuda|passando|olhando o perfil|vi o perfil)/i;
/** Se a mensagem veio num bloco só, separa em 3 balões: Ana com o contexto, o conteúdo e a pergunta sozinha.
 *  Mantenha igual a separarEmBaloes em ia-sdr/src/lib/diagnostico-perfil.ts. */
function separarEmBaloes(texto: string): string {
  const atuais = texto.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (atuais.length >= 3) return texto;
  const frases = atuais.join(" ").match(/[^.!?\p{Extended_Pictographic}]+(?:[.!?]+|\s*\p{Extended_Pictographic}+)\s*|[^.!?]+$/gu)?.map((f) => f.trim()).filter(Boolean) ?? [];
  if (frases.length < 3 || !frases[frases.length - 1].includes("?")) return texto;
  const pergunta = frases.pop() as string;
  let i = frases.findIndex((f) => /\bAna\b/.test(f));
  if (i < 0) i = 0;
  while (i + 1 < frases.length - 1 && CONTEXTO.test(frases[i + 1])) i++;
  return [frases.slice(0, i + 1).join(" "), frases.slice(i + 1).join(" "), pergunta].filter(Boolean).join("\n\n");
}
/** Manda a saudação sozinha, espera o robô de boas-vindas da empresa e depois manda a mensagem. */
async function enviarComSaudacao(path: string, to: string, nome: string, texto: string) {
  const oi = saudacaoCurta(nome);
  const r0 = await enviarBaloes(path, to, oi);
  if (!r0.ok) return { r: r0, enviado: oi };
  await sleep(rand(12000, 16000));
  const resto = separarEmBaloes(semSaudacao(texto));
  return { r: await enviarBaloes(path, to, resto), enviado: `${oi}\n\n${resto}` };
}
/** Tira o "Oi, fulano, tudo bem?" do começo da abordagem, porque a saudação já foi antes. */
function semSaudacao(texto: string) {
  const partes = texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (partes.length > 1 && /^(oi|olá|ola|bom dia|boa tarde)\b[^.!?\n]{0,60}[?!.]\s*$/i.test(partes[0])) partes.shift();
  partes[0] = partes[0].replace(/^(oi|olá|ola)\b[^.!?\n]{0,40}(tudo bem|td bem|como vai)[^.!?\n]{0,10}[?!.]\s*/i, "");
  partes[0] = partes[0].charAt(0).toUpperCase() + partes[0].slice(1);
  return partes.filter(Boolean).join("\n\n");
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
    .select("place_id, empresa, whatsapp, wa_sent_at, email_status, cadencia, toque_atual")
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
      // Qualquer resposta para a cadência: a Ana assume a conversa (ou o lead sai, se pediu)
      cadencia: optout ? "parada" : "respondeu",
      respondeu_no_toque: l.toque_atual || 1,
      proximo_toque_em: null, proximo_canal: null,
      updated_at: new Date().toISOString(),
    }).eq("place_id", l.place_id);
    await log(l.place_id, optout ? "optout" : "reply", { text: text.slice(0, 300), toque: l.toque_atual || 1 });
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
    return { ok: !!u.IsInWhatsapp, jid: u.JID, name: nomeDoWhats(u.VerifiedName ?? u.verifiedName) };
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

/** Manda o próximo toque de WhatsApp da cadência que já venceu. Retorna null se não havia nada. */
async function followUp(cfg: any): Promise<Record<string, unknown> | null> {
  const { data: due } = await sb.from("outreach_leads")
    .select("place_id, empresa, decisor, whatsapp, sequencia, toque_atual, wa_status")
    .eq("cadencia", "ativa").eq("proximo_canal", "whatsapp")
    .lte("proximo_toque_em", new Date().toISOString())
    .order("proximo_toque_em", { ascending: true }).limit(1);
  const lead = due?.[0];
  if (!lead) return null;

  const { count: hoje } = await sb.from("outreach_log").select("id", { count: "exact", head: true })
    .eq("channel", "whatsapp").eq("event", "followup").gte("created_at", spTodayStartISO());
  if ((hoje || 0) >= (cfg.followup_daily_cap ?? 40)) return null;

  const toque = Array.isArray(lead.sequencia) ? lead.sequencia[lead.toque_atual] : null;
  if (!toque?.texto || !lead.whatsapp || ["respondeu", "optout"].includes(lead.wa_status)) {
    await sb.rpc("outreach_avancar_cadencia", { p_place_id: lead.place_id, p_resultado: "pulado" });
    await log(lead.place_id, "pulado", { msg: `${lead.empresa}: toque ${lead.toque_atual + 1} pulado` });
    return { skip: "toque_pulado", lead: lead.empresa };
  }

  const nextAt = new Date(Date.now() + rand(cfg.wa_min_interval_sec, cfg.wa_max_interval_sec) * 1000).toISOString();
  await sb.from("outreach_config").update({ next_wa_at: nextAt }).eq("id", 1);
  await sb.from("outreach_leads").update({ ultimo_toque_em: new Date().toISOString() }).eq("place_id", lead.place_id);

  const chk = await checkNumber(lead.whatsapp);
  const to = chk?.jid ? chk.jid.split("@")[0] : lead.whatsapp;
  // Igual ao 1º toque: a saudação vai sozinha, espera uns segundos e depois vem a mensagem com o contexto
  const nome = nomeParaSaudar(lead, chk?.name);
  const { r } = await enviarComSaudacao(cfg.evolution_send_path, to, nome, String(toque.texto).trim());
  if (r.ok) {
    await sb.rpc("outreach_avancar_cadencia", { p_place_id: lead.place_id, p_resultado: "enviado" });
    await log(lead.place_id, "followup", { to, toque: lead.toque_atual + 1, nome_whats: chk?.name || null, saudou: nome || null, msg: `${lead.empresa}: toque ${lead.toque_atual + 1}` });
    return { followup: lead.empresa, toque: lead.toque_atual + 1, next: nextAt };
  }
  const low = r.body.toLowerCase();
  if (/not on whatsapp|not registered|not exist|invalid|não existe/.test(low)) {
    await sb.from("outreach_leads").update({ cadencia: "parada", proximo_toque_em: null, proximo_canal: null, wa_error: r.body.slice(0, 300) }).eq("place_id", lead.place_id);
  } else {
    // Tenta de novo em 2 horas
    await sb.from("outreach_leads").update({ proximo_toque_em: new Date(Date.now() + 2 * 3600e3).toISOString() }).eq("place_id", lead.place_id);
  }
  await log(lead.place_id, "error", { status: r.status, toque: lead.toque_atual + 1, body: r.body.slice(0, 300) });
  return { error: r.status, lead: lead.empresa };
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET)
    return new Response("unauthorized", { status: 401 });
  const out: any = {};
  const { data: cfg } = await sb.from("outreach_config").select("*").eq("id", 1).single();
  out.replies = await detectReplies(cfg);
  // Quem estava em "Retomar depois" e chegou a data volta para a aprovação
  const { data: reativados } = await sb.rpc("outreach_reativar");
  if (reativados) out.reativados = reativados;

  if (!cfg.wa_enabled) return Response.json({ ...out, skip: "wa_disabled" });
  const h = spHour(), wd = spWeekday();
  if (!cfg.send_days.includes(wd) || h < cfg.send_start_hour || h > cfg.send_end_hour)
    return Response.json({ ...out, skip: "fora_da_janela" });
  if (cfg.next_wa_at && new Date(cfg.next_wa_at) > new Date())
    return Response.json({ ...out, skip: "aguardando_intervalo", next: cfg.next_wa_at });

  // Modo número de teste: o lead não muda de status, então o teto e a rotação contam pelos envios de teste de hoje
  const { data: testesHoje } = cfg.test_number
    ? await sb.from("outreach_log").select("place_id").eq("event", "sent_test").not("place_id", "is", null).gte("created_at", spTodayStartISO())
    : { data: [] as { place_id: string }[] };
  const jaTestados = [...new Set((testesHoje ?? []).map((x) => x.place_id))];
  const { count: enviadosHoje } = await sb.from("outreach_leads").select("place_id", { count: "exact", head: true })
    .gte("wa_sent_at", spTodayStartISO());
  const count = cfg.test_number ? (testesHoje ?? []).length : enviadosHoje;
  const tetoNovos = (count || 0) >= cfg.wa_daily_cap;

  if (!cfg.dry_run && !(await instanceOk())) {
    await log(null, "instance_down");
    await sb.from("outreach_config").update({ next_wa_at: new Date(Date.now() + 10 * 60e3).toISOString() }).eq("id", 1);
    return Response.json({ ...out, skip: "instancia_desconectada" });
  }

  // 1) Follow-up da cadência que já venceu (vem antes das abordagens novas)
  if (!cfg.dry_run && !cfg.test_number) {
    const r = await followUp(cfg);
    if (r) return Response.json({ ...out, ...r });
  }

  // 2) Abordagem nova (1º toque), até o teto diário de abordagens
  if (tetoNovos) return Response.json({ ...out, skip: "teto_diario", count });

  // Com "exigir aprovação" ligado (padrão), só sai mensagem personalizada que o Kelvin aprovou no portal
  let fila = sb.from("outreach_leads").select("*")
    .eq("wa_status", "pendente").not("whatsapp", "is", null);
  if (cfg.exigir_aprovacao !== false) fila = fila.eq("msg_status", "aprovada");
  if (jaTestados.length) fila = fila.not("place_id", "in", `(${jaTestados.map((id) => `"${id}"`).join(",")})`);
  const { data: leads } = await fila
    .order("prioridade", { ascending: true }).order("created_at", { ascending: true }).limit(1);
  const lead = leads?.[0];
  if (!lead) return Response.json({ ...out, skip: cfg.exigir_aprovacao !== false ? "nenhuma_aprovada" : "fila_vazia" });

  let text: string;
  const primeiro = Array.isArray(lead.sequencia) ? lead.sequencia[0]?.texto : null;
  if (lead.msg_status === "aprovada" && (primeiro || lead.msg_rascunho)) {
    text = String(primeiro || lead.msg_rascunho).trim();
  } else {
    const { data: tpls } = await sb.from("outreach_templates").select("body").eq("channel", "whatsapp").eq("active", true);
    if (!tpls?.length) return Response.json({ ...out, skip: "sem_template" });
    text = render(tpls[Math.floor(Math.random() * tpls.length)].body, lead);
  }
  let to = (cfg.test_number || "").replace(/\D/g, "") || lead.whatsapp;
  let nomeWhats = "";
  if (!cfg.dry_run && !cfg.test_number) {
    const chk = await checkNumber(lead.whatsapp);
    nomeWhats = chk?.name || "";
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

  // Marca o horário antes de enviar: o webhook do SDR reconhece o disparo e não pausa a IA
  if (!cfg.test_number) await sb.from("outreach_leads").update({ ultimo_toque_em: new Date().toISOString() }).eq("place_id", lead.place_id);
  // 1º contato em duas etapas: a saudação vai sozinha, a gente espera o robô de boas-vindas da empresa
  // (WhatsApp Business) responder, e só depois vai a apresentação da Ana com o contexto.
  const nome = nomeParaSaudar(lead, nomeWhats);
  const env = await enviarComSaudacao(cfg.evolution_send_path, to, nome, text);
  const r = env.r;
  text = env.enviado;
  const body = r.body;
  if (r.ok) {
    if (!cfg.test_number) {
      await sb.from("outreach_leads").update({
        wa_status: "enviado", wa_sent_at: new Date().toISOString(), wa_message: text,
        updated_at: new Date().toISOString(),
      }).eq("place_id", lead.place_id);
      // Começa a cadência de follow-up (só para quem tem a sequência aprovada)
      await sb.rpc("outreach_avancar_cadencia", { p_place_id: lead.place_id, p_resultado: "enviado" });
    }
    await log(lead.place_id, cfg.test_number ? "sent_test" : "sent", { to, toque: 1, nome_whats: nomeWhats || null, saudou: nome || null, resp: body.slice(0, 300) });
    return Response.json({ ...out, sent: lead.empresa, to, next: nextAt });
  }
  const attempts = lead.wa_attempts + 1;
  const low = body.toLowerCase();
  const status = /not on whatsapp|not registered|not exist|invalid|não existe/.test(low) ? "sem_whatsapp" : attempts >= 2 ? "erro" : "pendente";
  await sb.from("outreach_leads").update({ wa_status: status, wa_attempts: attempts, wa_error: `${r.status}: ${body.slice(0, 300)}`, updated_at: new Date().toISOString() }).eq("place_id", lead.place_id);
  await log(lead.place_id, "error", { status: r.status, body: body.slice(0, 300) });
  return Response.json({ ...out, error: r.status, body: body.slice(0, 300) });
});
