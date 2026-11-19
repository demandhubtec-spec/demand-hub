import { createClient } from "npm:@supabase/supabase-js@2";
import { AsyncLocalStorage } from "node:async_hooks";
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
/** Feriados nacionais: nada sai nesses dias (o que vencer passa para o próximo dia de envio). */
const FERIADOS = new Set([
  "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21", "2027-05-01", "2027-05-27",
  "2027-09-07", "2027-10-12", "2027-11-02", "2027-11-15", "2027-11-20", "2027-12-25",
]);
function spYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
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
      headers: { apikey: tok(), "Content-Type": "application/json" },
      body: JSON.stringify({ number: to, text: parts[i], delay: Math.min(1200 + parts[i].length * 25, 4000) }),
    });
    // 504: o servidor do WhatsApp demorou para responder, mas a mensagem sai mesmo assim
    // (visto em 30/10: o robô da empresa respondeu e o reenvio duplicou). Trata como enviado.
    last = { ok: r.ok || r.status === 504, status: r.status, body: await r.text() };
    if (!last.ok) return last;
    if (i < parts.length - 1) await sleep(rand(2500, 5000));
  }
  return last;
}
/**
 * Relatório em PDF (12/11/2026): a Bia escreve "[PDF]" num balão sozinho e aqui ele vira o arquivo anexado
 * (marca.pdf do lead, gerado pelo robô no GitHub). Sem PDF pronto, o marcador vira o link do relatório.
 */
let PDF_DO_LEAD: { url: string; nome: string; link: string | null } | null = null;
function pdfDoLead(l: any): { url: string; nome: string; link: string | null } | null {
  const empresa = String(l?.empresa ?? "empresa").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, " ").trim().slice(0, 50);
  const link = l?.relatorio_token ? `https://demandia-sdr.vercel.app/relatorio/${l.relatorio_token}` : null;
  if (!l?.marca?.pdf) return link ? { url: "", nome: "", link } : null;
  return { url: String(l.marca.pdf), nome: `Diagnostico ${empresa}.pdf`, link };
}
function partesDoPdf(t: string): [string, string] | null {
  const i = t.indexOf("[PDF]");
  return i < 0 ? null : [t.slice(0, i).trim(), t.slice(i + 5).trim()];
}
async function enviarPdf(path: string, to: string): Promise<{ ok: boolean; status: number; body: string }> {
  const p = PDF_DO_LEAD;
  if (!p) return { ok: true, status: 200, body: "" };
  if (!p.url) return p.link ? await enviarBaloes(path, to, p.link) : { ok: true, status: 200, body: "" };
  const r = await fetch(`${EVO_URL}/send/media`, {
    method: "POST",
    headers: { apikey: tok(), "Content-Type": "application/json" },
    body: JSON.stringify({ number: to, url: p.url, type: "document", filename: p.nome, caption: "", delay: 1500 }),
    signal: AbortSignal.timeout(40000),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as unknown as Response);
  return { ok: r.ok || r.status === 504, status: r.status, body: await r.text() };
}
/** Manda o texto em balões; se tiver "[PDF]", manda a parte de antes, o arquivo e depois o resto. */
async function enviarComPdf(path: string, to: string, texto: string, formatar: (t: string) => string) {
  const pp = partesDoPdf(texto);
  if (!pp) {
    const t = formatar(texto);
    return { r: await enviarBaloes(path, to, t), enviado: t };
  }
  const antes = pp[0] ? formatar(pp[0]) : "";
  if (antes) {
    const r = await enviarBaloes(path, to, antes);
    if (!r.ok) return { r, enviado: antes };
    await sleep(rand(2000, 4000));
  }
  const rp = await enviarPdf(path, to);
  const marca = PDF_DO_LEAD?.url ? "[PDF do diagnóstico anexado]" : PDF_DO_LEAD?.link ?? "";
  if (!rp.ok) return { r: rp, enviado: [antes, marca].filter(Boolean).join("\n\n") };
  const depois = pp[1] ? formatar(pp[1]) : "";
  if (depois) {
    await sleep(rand(2500, 5000));
    const r = await enviarBaloes(path, to, depois);
    return { r, enviado: [antes, marca, depois].filter(Boolean).join("\n\n") };
  }
  return { r: rp, enviado: [antes, marca].filter(Boolean).join("\n\n") };
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
/** "Dra. Joyce Martins" → "Dra. Joyce". Só com Dr./Dra.: nome de perfil comercial sem isso costuma ser
 *  sobrenome de escritório ("Almeida Alves" virou "Oi, Almeida" em 30/10). */
function nomeDePessoa(t: string): string {
  const s = (t || "").replace(/[|•–-].*$/, "").trim();
  if (!s || PALAVRA_EMPRESA.test(s) || s.split(/\s+/).length > 4) return "";
  const m = s.match(/^(dr\.?a?|dra\.?)\s+(\p{L}+)/iu);
  return m ? `${/a/i.test(m[1]) ? "Dra." : "Dr."} ${primeiroNome(m[2])}` : "";
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
  // Kelvin (13/11): só 😊, nunca 🙂 ("cara de assustada") nem 👋
  return `Oi, ${nome ? `${nome}, ` : ""}${periodo}! 😊`;
}
/**
 * Abordagem v2 (13/11/2026, Kelvin): o 1º contato é só "Oi, boa tarde! 😊" e "Tudo bem?". A Gabi espera a
 * pessoa responder; se ninguém responder em 1 hora, a IA SDR manda "Fico no aguardo do atendimento por aqui 😊".
 * A apresentação, o diagnóstico (PDF) e o convite para a reunião vêm depois, um de cada vez, na conversa.
 */
async function enviarSoSaudacao(path: string, to: string) {
  const oi = saudacaoCurta();
  const r0 = await enviarBaloes(path, to, oi);
  if (!r0.ok) return { r: r0, enviado: oi, baloes: [] as { texto: string; id: string | null }[] };
  await sleep(rand(3500, 6000));
  const r1 = await enviarBaloes(path, to, "Tudo bem?");
  return { r: r1, enviado: `${oi}\n\nTudo bem?`, baloes: [{ texto: oi, id: idDaMensagem(r0.body) }, ...(r1.ok ? [{ texto: "Tudo bem?", id: idDaMensagem(r1.body) }] : [])] };
}
/** Id da mensagem na resposta do Evolution (para a conversa não duplicar no espelho). */
function idDaMensagem(body: string): string | null {
  try {
    const j = JSON.parse(body);
    return j?.data?.Info?.ID ?? j?.data?.key?.id ?? j?.key?.id ?? null;
  } catch { return null; }
}
/** 55 + DDD + 9XXXXXXXX → 55 + DDD + XXXXXXXX (contas antigas de fora de SP estão no WhatsApp sem o 9). */
function semNono(numero: string): string | null {
  const d = numero.replace(/\D/g, "");
  return d.length === 13 && d.startsWith("55") && d[4] === "9" ? d.slice(0, 4) + d.slice(5) : null;
}
/**
 * 17/11 (Kelvin): a conversa do portal tem que espelhar 100% o WhatsApp. O 1º contato ("Oi, bom dia! 😊" e
 * "Tudo bem?") nunca aparecia, porque o webhook não recebe o que sai pela API. Aqui ele entra na conversa.
 */
async function espelharSaudacao(numero: string, quem: string, baloes: { texto: string; id: string | null }[]) {
  try {
    const d = numero.replace(/\D/g, "");
    const variantes = [d];
    if (d.length === 13 && d[4] === "9") variantes.push(d.slice(0, 4) + d.slice(5));
    if (d.length === 12) variantes.push(d.slice(0, 4) + "9" + d.slice(4));
    const { data: sl } = await sb.from("sdr_leads").select("id").in("phone", variantes).limit(1);
    let id: string | undefined = sl?.[0]?.id;
    if (!id) {
      const { data: novo } = await sb.from("sdr_leads").insert({ phone: d, whatsapp_jid: `${d}@s.whatsapp.net`, agente: quem }).select("id").single();
      id = novo?.id;
    }
    if (!id) return;
    const agora = new Date().toISOString();
    for (const b of baloes) {
      await sb.from("sdr_messages").insert({ lead_id: id, direction: "out", author: "sistema", kind: "conversa", content: b.texto, ...(b.id ? { evolution_message_id: b.id } : {}) });
    }
    await sb.from("sdr_leads").update({ last_outbound_at: agora }).eq("id", id);
  } catch (e) {
    console.error("espelhar 1º contato falhou", e);
  }
}
const CONTEXTO = /(te chamei|separei|imagino|fiz uma an[aá]lise|fiquei pensando|a gente ajuda|passando|olhando o perfil|vi o perfil)/i;
/** Se a mensagem veio num bloco só, separa em 3 balões: Ana com o contexto, o conteúdo e a pergunta sozinha.
 *  Mantenha igual a separarEmBaloes em ia-sdr/src/lib/diagnostico-perfil.ts. */
function separarEmBaloes(texto: string): string {
  const frasesDe = (t: string) => t.split(/(?<=[.!?…]|\p{Extended_Pictographic})\s+/u).map((f) => f.trim()).filter(Boolean);
  let b = texto.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  if (b.length >= 3) {
    // A pergunta final vai sempre sozinha no último balão
    const fim = frasesDe(b[b.length - 1]);
    if (fim.length > 1 && fim[fim.length - 1].includes("?")) b = [...b.slice(0, -1), fim.slice(0, -1).join(" "), fim[fim.length - 1]];
    // Mais de 3 balões: junta a apresentação com o motivo (os primeiros)
    while (b.length > 3) b = [`${b[0]} ${b[1]}`, ...b.slice(2)];
    return b.join("\n\n");
  }
  const frases = frasesDe(b.join(" "));
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
  const env = await enviarComPdf(path, to, semSaudacao(texto), separarEmBaloes);
  return { r: env.r, enviado: `${oi}\n\n${env.enviado}` };
}
/**
 * 1º contato com o áudio da Ana (configurado no portal): "Oi, bom dia!", espera o robô de boas-vindas
 * da empresa (~20s), "Tudo bem?", aparece "gravando áudio..." pelo tempo do áudio e o áudio sai como
 * mensagem de voz. A análise aprovada não vai aqui: vira o próximo toque (se a pessoa não responder).
 */
async function enviarAbordagemComAudio(path: string, to: string, nome: string, cfg: any, textoReserva: string):
  Promise<{ r: { ok: boolean; status: number; body: string }; enviado: string; audio: boolean; erroAudio?: string }> {
  const oi = saudacaoCurta(nome);
  const r0 = await enviarBaloes(path, to, oi);
  if (!r0.ok) return { r: r0, enviado: oi, audio: false };
  await sleep(rand(18000, 23000));
  const tudo = pick(["Tudo bem?", "Tudo bem? 😊", "Tudo bem por aí?"]);
  const r1 = await enviarBaloes(path, to, tudo);
  if (!r1.ok) return { r: r1, enviado: `${oi}\n\n${tudo}`, audio: false };
  await sleep(rand(1500, 3000));
  // "gravando áudio..." pelo tempo do áudio (o Evolution mantém o aviso aceso durante o delay)
  const seg = Math.min(Math.max(Number(cfg.audio_abordagem_seg) || 30, 5), 60);
  const t0 = Date.now();
  try {
    await fetch(`${EVO_URL}/message/presence`, {
      method: "POST",
      headers: { apikey: tok(), "Content-Type": "application/json" },
      body: JSON.stringify({ number: to, state: "composing", isAudio: true, delay: seg * 1000 }),
      signal: AbortSignal.timeout((seg + 15) * 1000),
    });
  } catch { /* sem o aviso de gravando, o áudio sai mesmo assim */ }
  const falta = seg * 1000 - (Date.now() - t0);
  if (falta > 0) await sleep(falta);
  const r = await fetch(`${EVO_URL}/send/media`, {
    method: "POST",
    headers: { apikey: tok(), "Content-Type": "application/json" },
    body: JSON.stringify({ number: to, url: cfg.audio_abordagem_url, type: "audio", delay: 0 }),
    signal: AbortSignal.timeout(40000),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as unknown as Response);
  const r2 = { ok: r.ok || r.status === 504, status: r.status, body: await r.text() };
  if (!r2.ok) {
    // O áudio falhou depois do "Oi" e do "Tudo bem?": manda a análise aprovada em texto para não deixar a conversa solta
    const env3 = await enviarComPdf(path, to, semSaudacao(textoReserva), separarEmBaloes);
    return { r: env3.r, enviado: `${oi}\n\n${tudo}\n\n${env3.enviado}`, audio: false, erroAudio: `${r2.status}: ${r2.body.slice(0, 200)}` };
  }
  const fala = String(cfg.audio_abordagem_texto || "").trim();
  return { r: r2, enviado: `${oi}\n\n${tudo}\n\n[Áudio da Ana] ${fala}`.trim(), audio: true };
}
/** Próximo dia de envio às 9h30 (pula domingo e feriado), para o toque que vem depois do áudio. */
function proximoDiaUtil930(): string {
  for (let i = 1; i < 10; i++) {
    const d = new Date(Date.now() + i * 864e5);
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const wd = new Date(`${ymd}T12:00:00-03:00`).getUTCDay();
    if (wd === 0 || FERIADOS.has(ymd)) continue;
    return new Date(`${ymd}T09:30:00-03:00`).toISOString();
  }
  return new Date(Date.now() + 864e5).toISOString();
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
const EVO_TOKEN_GABI = Deno.env.get("EVOLUTION_INSTANCE_TOKEN") || "";
/**
 * Duas SDRs, dois números (16/11/2026): cada envio roda "dentro" do número de quem manda (Gabi ou Marina).
 * O token vem do contexto da chamada, nunca de uma variável global trocada no meio (duas chamadas podem
 * rodar ao mesmo tempo na mesma instância da função).
 */
/**
 * Segmento do lead para o mix diário. 17/11: pet e advocacia saíram. 18/11 (Kelvin): só clínica (saúde em geral)
 * e alimentação; eventos, casa de verão (ar-condicionado, piscina, dedetização), pousadas e o resto saíram também.
 * E entra o ICP: clínica com estrutura (não consultório de um profissional só, nem hospital/laboratório/rede) e
 * alimentação com movimento (Google com avaliações ou Instagram com seguidores).
 */
type Segmento = "saude" | "restaurante" | "outros";
const MIX: Record<Segmento, number> = { saude: 0.5, restaurante: 0.5, outros: 0 };
function segmentoDoLead(l: { place_id?: string | null; nicho?: string | null; empresa?: string | null; avaliacoes?: number | null; observacoes?: string | null }): Segmento | "fora" {
  const ig = String(l.place_id ?? "").startsWith("ig_");
  // Google: pelo nicho da coleta. Lista do Instagram: nicho e nome (lá o nicho às vezes vem vazio)
  const n = `${l.nicho ?? ""} ${ig ? l.empresa ?? "" : ""}`.toLowerCase();
  if (/pet\b|pet shop|veterin|advoca|advogad|jur[ií]dic/.test(n)) return "fora";
  let seg: Segmento = "outros";
  if (/aliment|restaur|hamburg|burger|pizz|lanch|caf[eé]|confeit|doce|salgad|marmit|delivery|gastronom|food|a[cç]a[ií]|gelat|sorvet|churras|espetaria|coxinha/.test(n)) seg = "restaurante";
  else if (/cl[ií]nic|m[eé]dic|odont|dent|endocrin|est[eé]tic|harmoniza|depila|dermat|nutri|fisio|psic|sa[uú]de/.test(n)) seg = "saude";
  if (seg === "outros") return "fora";
  return dentroDoIcp(seg, l, ig) ? seg : "fora";
}

/** ICP (18/11): quem tem estrutura e dinheiro para investir. Sem dado (nota/avaliações vazias), passa. */
function dentroDoIcp(seg: Segmento, l: { empresa?: string | null; avaliacoes?: number | null; observacoes?: string | null }, ig: boolean): boolean {
  const nome = String(l.empresa ?? "");
  const av = typeof l.avaliacoes === "number" ? l.avaliacoes : null;
  if (seg === "saude") {
    // Hospital, laboratório, diagnóstico por imagem, universidade, pronto-socorro e redes grandes não são o perfil
    if (/hospital|laborat|diagn[oó]stic|universid|unicamp|\bpuc\b|pronto.?socorro|\bupa\b|santa casa|cecom|haoc|vera cruz/i.test(nome)) return false;
    // Consultório de um profissional só ("Dra. Fulana - Endocrinologista", "Dentista Dra. Carol") não tem verba
    if (/^(dr|dra|doutor|doutora|dentista)\b\.?/i.test(nome.trim()) && !/cl[ií]nic|odontologia|instituto|centro|espa[cç]o/i.test(nome)) return false;
    if (av !== null && (av < 30 || av > 1500)) return false;
    return true;
  }
  if (ig) {
    const m = String(l.observacoes ?? "").match(/([0-9]+(?:[.,][0-9]+)?)\s*(mil)?\s*seguidores/i);
    if (!m) return true;
    const seguidores = parseFloat(m[1].replace(",", ".")) * (m[2] ? 1000 : 1);
    return seguidores >= 1000;
  }
  return av === null || av >= 80;
}

type Sdr = "gabi" | "marina";
const NUMERO = new AsyncLocalStorage<{ sdr: Sdr; token: string }>();
const tok = () => NUMERO.getStore()?.token ?? EVO_TOKEN_GABI;
const comNumero = <T,>(sdr: Sdr, token: string, fn: () => Promise<T>) => NUMERO.run({ sdr, token }, fn);
/** Token de cada SDR: Gabi pela variável de sempre; Marina pela tabela wa_instancias (criada pelo portal). */
async function tokensDasSdrs(): Promise<Record<Sdr, string | null>> {
  const { data } = await sb.from("wa_instancias").select("agente,token");
  const marina = (data ?? []).find((i: { agente: string }) => i.agente === "marina") as { token?: string } | undefined;
  return { gabi: EVO_TOKEN_GABI, marina: marina?.token ?? null };
}
/** Quem faz o próximo 1º contato: a SDR com vaga, proporcional ao teto. Igual a proximaSdr em ia-sdr/src/lib/sdrs.ts. */
function proximaSdr(feitos: Record<Sdr, number>, tetos: Record<Sdr, number>, liberadas: Sdr[]): Sdr | null {
  const ordem: Sdr[] = ["gabi", "marina"];
  const comVaga = liberadas.filter((x) => (tetos[x] ?? 0) > 0 && (feitos[x] ?? 0) < tetos[x]);
  if (!comVaga.length) return null;
  return comVaga.sort((a, b) => (feitos[a] ?? 0) / tetos[a] - (feitos[b] ?? 0) / tetos[b] || ordem.indexOf(a) - ordem.indexOf(b))[0];
}
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
    // 16/11: resposta automática (robô, boas-vindas, menu) não conta como resposta. Festa Fácil e Clínica
    // Campinense ficaram "respondeu" só com o robô, saíram da cutucada e ficaram sem follow-up nenhum.
    const { data: msg } = await sb.from("sdr_messages").select("content, created_at")
      .eq("lead_id", sl[0].id).eq("direction", "in").gt("created_at", l.wa_sent_at)
      .not("content", "like", "[resposta automática]%")
      .order("created_at", { ascending: true }).limit(1);
    if (!msg?.length) continue;
    const text = msg[0].content || "";
    const optout = (cfg.optout_words || []).some((w: string) => text.toLowerCase().includes(w));
    await sb.from("outreach_leads").update({
      wa_status: optout ? "optout" : "respondeu",
      replied_at: msg[0].created_at, reply_text: text.slice(0, 1000),
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

/** Para onde mandar: o número do JID só quando é o mesmo telefone (às vezes vem um LID, que não é telefone). */
function jidDoNumero(jid: string | undefined, numero: string): string {
  const d = (jid ?? "").split("@")[0].replace(/\D/g, "");
  return d && d.slice(-8) === numero.replace(/\D/g, "").slice(-8) ? d : numero;
}
async function checkNumber(num: string): Promise<{ ok: boolean; jid?: string; name?: string } | null> {
  try {
    const r = await fetch(`${EVO_URL}/user/check`, {
      method: "POST", headers: { apikey: tok(), "Content-Type": "application/json" },
      body: JSON.stringify({ number: [num] }),
    });
    const u = (await r.json())?.data?.Users?.[0];
    if (!u) return null;
    return { ok: !!u.IsInWhatsapp, jid: u.JID, name: nomeDoWhats(u.VerifiedName ?? u.verifiedName) };
  } catch { return null; }
}

/** Status da instância. "lento" = o servidor (dividido com outras instâncias) não respondeu a tempo. */
async function statusInstancia(): Promise<"ok" | "caiu" | "lento"> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${EVO_URL}/instance/status`, { headers: { apikey: tok() }, signal: ctrl.signal });
    if (!r.ok) return r.status >= 500 ? "lento" : "caiu";
    const j = await r.json();
    const d = j?.data ?? j;
    const c = d?.Connected ?? d?.connected, l = d?.LoggedIn ?? d?.loggedIn;
    return c === false || l === false ? "caiu" : "ok";
  } catch { return "lento"; } finally { clearTimeout(t); }
}
/**
 * Só considera a instância caída quando ela diz que está desconectada, duas vezes seguidas.
 * Demora para responder não é queda (em 29/10 foram 26 alertas falsos com o WhatsApp funcionando).
 */
async function instanceOk(): Promise<boolean | "lento"> {
  const a = await statusInstancia();
  if (a === "ok") return true;
  await sleep(4000);
  const b = await statusInstancia();
  if (b === "ok") return true;
  return a === "caiu" && b === "caiu" ? false : "lento";
}

/** A empresa só respondeu com robô (boas-vindas, menu) e nenhuma pessoa? */
async function soRespondeuRobo(whatsapp: string): Promise<boolean> {
  const tail = String(whatsapp).replace(/\D/g, "").slice(-8);
  const { data: lds } = await sb.from("sdr_leads").select("id").like("phone", `%${tail}`).limit(1);
  const id = lds?.[0]?.id;
  if (!id) return false;
  const { data: msgs } = await sb.from("sdr_messages").select("content").eq("lead_id", id).eq("direction", "in").limit(50);
  const ins = (msgs ?? []).map((m) => String(m.content ?? ""));
  return ins.length > 0 && ins.every((c) => c.startsWith("[resposta automática]"));
}
/** Para quem só teve robô: o próximo WhatsApp vai direto ao ponto, pedindo o contato de quem decide. */
const TEXTO_ROBO = [
  "Tudo bem? Aqui é a Ana, da DemandIA, de novo 😊\n\nVi que por aqui cai no atendimento automático, então vou direto ao ponto: fiz uma análise rápida do perfil de vocês no Google e queria mandar pra quem cuida do marketing.\n\nConsegue me passar o e-mail ou o WhatsApp dessa pessoa?",
  "Tudo bem? É a Ana, da DemandIA 😊\n\nComo aqui cai no atendimento automático, vou ser rápida: tenho uma análise do perfil de vocês no Google, com os pontos que dá pra melhorar, e queria entregar pra quem decide sobre o marketing.\n\nQual o melhor e-mail ou contato pra eu mandar?",
];

/** Manda o próximo toque de WhatsApp da cadência que já venceu. Retorna null se não havia nada. */
async function followUp(cfg: any, tokens: Record<Sdr, string | null>): Promise<Record<string, unknown> | null> {
  const { data: due } = await sb.from("outreach_leads")
    .select("place_id, empresa, decisor, whatsapp, sequencia, toque_atual, wa_status, marca, relatorio_token, agente")
    .eq("cadencia", "ativa").eq("proximo_canal", "whatsapp")
    .lte("proximo_toque_em", new Date().toISOString())
    .order("proximo_toque_em", { ascending: true }).limit(1);
  const lead = due?.[0];
  if (!lead) return null;

  const { count: hoje } = await sb.from("outreach_log").select("id", { count: "exact", head: true })
    .eq("channel", "whatsapp").eq("event", "followup").gte("created_at", spTodayStartISO());
  if ((hoje || 0) >= (cfg.followup_daily_cap ?? 40)) return null;

  // Sai pelo número de quem fez o 1º contato; se o número dela não estiver disponível, espera
  const sdrDoLead: Sdr = lead.agente === "marina" ? "marina" : "gabi";
  if (!tokens[sdrDoLead]) return null;
  return comNumero(sdrDoLead, tokens[sdrDoLead]!, () => followUpDoLead(cfg, lead, hoje || 0));
}

async function followUpDoLead(cfg: any, lead: any, _hoje: number): Promise<Record<string, unknown>> {
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
  // Número com LID (13/11): mandar para o LID como se fosse número dá "no LID found"; aí vai o número normal
  const to = jidDoNumero(chk?.jid, lead.whatsapp);
  // Igual ao 1º toque: a saudação vai sozinha, espera uns segundos e depois vem a mensagem com o contexto
  const nome = nomeParaSaudar(lead, chk?.name);
  // Só teve robô até agora e ainda não pedimos o contato direto: esse toque vai direto ao ponto (uma vez só)
  let texto = String(toque.texto).trim();
  let robo = false;
  if (await soRespondeuRobo(lead.whatsapp).catch(() => false)) {
    const { count: jaPediu } = await sb.from("outreach_log").select("id", { count: "exact", head: true })
      .eq("place_id", lead.place_id).eq("event", "followup").contains("detail", { robo: true });
    if (!jaPediu) { texto = pick(TEXTO_ROBO); robo = true; }
  }
  PDF_DO_LEAD = pdfDoLead(lead);
  const { r } = await enviarComSaudacao(cfg.evolution_send_path, to, nome, texto);
  if (r.ok) {
    await sb.rpc("outreach_avancar_cadencia", { p_place_id: lead.place_id, p_resultado: "enviado" });
    await log(lead.place_id, "followup", { to, toque: lead.toque_atual + 1, robo, nome_whats: chk?.name || null, saudou: nome || null, msg: `${lead.empresa}: toque ${lead.toque_atual + 1}` });
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
  if (FERIADOS.has(spYmd())) return Response.json({ ...out, skip: "feriado" });
  // Sábado: só de manhã e só follow-up (abordagem nova fica para dia útil)
  const sabado = wd === 6;
  if (sabado && h >= 12) return Response.json({ ...out, skip: "sabado_so_de_manha" });
  if (cfg.next_wa_at && new Date(cfg.next_wa_at) > new Date())
    return Response.json({ ...out, skip: "aguardando_intervalo", next: cfg.next_wa_at });

  // Modo número de teste: o lead não muda de status, então o teto e a rotação contam pelos envios de teste de hoje
  const { data: testesHoje } = cfg.test_number
    ? await sb.from("outreach_log").select("place_id").eq("event", "sent_test").not("place_id", "is", null).gte("created_at", spTodayStartISO())
    : { data: [] as { place_id: string }[] };
  const jaTestados = [...new Set((testesHoje ?? []).map((x) => x.place_id))];

  // Números das SDRs. A Marina só entra com o número criado e "Marina disparando" ligado no portal.
  const tokens = await tokensDasSdrs().catch(() => ({ gabi: EVO_TOKEN_GABI, marina: null }) as Record<Sdr, string | null>);
  const tetos: Record<Sdr, number> = { gabi: cfg.wa_daily_cap ?? 30, marina: cfg.marina_daily_cap ?? 10 };
  const liberadas: Sdr[] = ["gabi"];
  if (cfg.marina_enabled && tokens.marina && !cfg.test_number) liberadas.push("marina");

  // Quanto cada uma já mandou hoje (lead sem SDR é da Gabi)
  const hoje0 = spTodayStartISO();
  const contaHoje = async (sdr: Sdr) => {
    let q = sb.from("outreach_leads").select("place_id", { count: "exact", head: true }).gte("wa_sent_at", hoje0);
    q = sdr === "gabi" ? q.or("agente.is.null,agente.eq.gabi") : q.eq("agente", sdr);
    return (await q).count ?? 0;
  };
  const feitos: Record<Sdr, number> = cfg.test_number
    ? { gabi: (testesHoje ?? []).length, marina: 0 }
    : { gabi: await contaHoje("gabi"), marina: liberadas.includes("marina") ? await contaHoje("marina") : 0 };

  // Número fora do ar não dispara (a outra SDR segue). Instância lenta: tenta daqui a 3 minutos.
  const okDe: Partial<Record<Sdr, boolean | "lento">> = {};
  const numeroOk = async (sdr: Sdr) => {
    if (cfg.dry_run) return true;
    if (okDe[sdr] === undefined) okDe[sdr] = await comNumero(sdr, tokens[sdr]!, () => instanceOk());
    return okDe[sdr];
  };
  const gabiOk = await numeroOk("gabi");
  if (gabiOk === "lento" && !liberadas.includes("marina")) {
    await sb.from("outreach_config").update({ next_wa_at: new Date(Date.now() + 3 * 60e3).toISOString() }).eq("id", 1);
    return Response.json({ ...out, skip: "servidor_lento" });
  }
  if (!gabiOk && !liberadas.includes("marina")) {
    await log(null, "instance_down");
    await sb.from("outreach_config").update({ next_wa_at: new Date(Date.now() + 10 * 60e3).toISOString() }).eq("id", 1);
    return Response.json({ ...out, skip: "instancia_desconectada" });
  }

  // 1) Follow-up da cadência que já venceu (vem antes das abordagens novas), pelo número de cada lead
  if (!cfg.dry_run && !cfg.test_number) {
    const r = await followUp(cfg, tokens);
    if (r) return Response.json({ ...out, ...r });
  }

  // 2) Abordagem nova (1º toque): Gabi e Marina na mesma fila, cada uma até o próprio teto
  const disponiveis: Sdr[] = [];
  for (const sdr of liberadas) if ((await numeroOk(sdr)) === true) disponiveis.push(sdr);
  const sdr = proximaSdr(feitos, tetos, disponiveis);
  if (!sdr) {
    const algumaComVaga = liberadas.some((x) => feitos[x] < tetos[x]);
    if (algumaComVaga) {
      // Quem tem vaga está com o número fora: espera e avisa no registro
      await sb.from("outreach_config").update({ next_wa_at: new Date(Date.now() + 5 * 60e3).toISOString() }).eq("id", 1);
      return Response.json({ ...out, skip: "numero_fora_do_ar", feitos });
    }
    return Response.json({ ...out, skip: "teto_diario", feitos });
  }

  // Com "exigir aprovação" ligado (padrão), só sai mensagem personalizada que o Kelvin aprovou no portal
  // 17/11 (Kelvin): mix dos primeiros contatos do dia por segmento — 50% saúde (clínicas), 30% restaurante
  // (lista do Instagram + alimentação do Google) e 20% os outros nichos. Pet e advocacia saíram da rotação.
  // Conta as TENTATIVAS do dia (enviado ou falhou), para um segmento com números ruins não travar a fila.
  // Quando um segmento acaba, os outros seguem sozinhos.
  const { data: tentativas } = cfg.test_number
    ? { data: [] as { place_id: string | null }[] }
    : await sb.from("outreach_log").select("place_id").eq("channel", "whatsapp").in("event", ["sent", "error", "sem_whatsapp"]).gte("created_at", hoje0).limit(2000);
  const idsHoje = [...new Set((tentativas ?? []).map((t) => String(t.place_id ?? "")).filter(Boolean))];
  const nichoDe = new Map<string, string | null>();
  for (let i = 0; i < idsHoje.length; i += 200) {
    const { data: ns } = await sb.from("outreach_leads").select("place_id,nicho,empresa,avaliacoes,observacoes").in("place_id", idsHoje.slice(i, i + 200));
    for (const n of ns ?? []) nichoDe.set(n.place_id, segmentoDoLead(n));
  }
  const feitosSeg: Record<Segmento, number> = { saude: 0, restaurante: 0, outros: 0 };
  for (const t of tentativas ?? []) {
    const seg = nichoDe.get(String(t.place_id ?? ""));
    if (seg && seg !== "fora") feitosSeg[seg as Segmento]++;
  }
  const totalSeg = feitosSeg.saude + feitosSeg.restaurante + feitosSeg.outros;
  // Maior déficit primeiro (quanto falta para chegar na fatia do segmento depois do próximo envio)
  const ordemSeg = (Object.keys(MIX) as Segmento[]).filter((k) => MIX[k] > 0).sort((a, b) => (MIX[b] * (totalSeg + 1) - feitosSeg[b]) - (MIX[a] * (totalSeg + 1) - feitosSeg[a]));
  let filaBase = sb.from("outreach_leads").select("*").eq("wa_status", "pendente").not("whatsapp", "is", null);
  if (cfg.exigir_aprovacao !== false) filaBase = filaBase.eq("msg_status", "aprovada");
  if (jaTestados.length) filaBase = filaBase.not("place_id", "in", `(${jaTestados.map((id) => `"${id}"`).join(",")})`);
  const { data: fila } = await filaBase.order("prioridade", { ascending: true }).order("created_at", { ascending: true }).limit(600);
  let candidatos: any[] = [];
  for (const seg of ordemSeg) {
    candidatos = (fila ?? []).filter((l: any) => segmentoDoLead(l) === seg).slice(0, 10);
    if (candidatos.length) break;
  }
  if (!candidatos?.length) return Response.json({ ...out, skip: cfg.exigir_aprovacao !== false ? "nenhuma_aprovada" : "fila_vazia" });

  // Nunca duas SDRs no mesmo contato: quem já conversa com a gente (ficha na Gabi ou na Marina) só recebe
  // pela SDR dessa conversa. Se ela não tem vaga agora, o lead espera e vai o próximo da fila.
  let lead: any = null;
  let quem: Sdr = sdr;
  for (const c of candidatos) {
    const fim8c = String(c.whatsapp).replace(/\D/g, "").slice(-8);
    const { data: ficha } = fim8c.length === 8
      ? await sb.from("sdr_leads").select("agente").like("phone", `%${fim8c}`).limit(1)
      : { data: [] };
    const dona = (ficha?.[0]?.agente === "marina" ? "marina" : ficha?.length ? "gabi" : null) as Sdr | null;
    if (!dona) { lead = c; quem = sdr; break; }
    if (disponiveis.includes(dona) && feitos[dona] < tetos[dona]) { lead = c; quem = dona; break; }
  }
  if (!lead) return Response.json({ ...out, skip: "fila_aguardando_sdr", sdr });

  return comNumero(quem, tokens[quem]!, () => primeiroContato(cfg, lead, quem, out));
});

/** 1º contato de um lead pelo número da SDR escolhida (o token vem do contexto). */
async function primeiroContato(cfg: any, lead: any, quem: Sdr, out: any): Promise<Response> {
  let text: string;
  const primeiro = Array.isArray(lead.sequencia) ? lead.sequencia[0]?.texto : null;
  if (lead.msg_status === "aprovada" && (primeiro || lead.msg_rascunho)) {
    text = String(primeiro || lead.msg_rascunho).trim();
  } else {
    const { data: tpls } = await sb.from("outreach_templates").select("body").eq("channel", "whatsapp").eq("active", true);
    if (!tpls?.length) return Response.json({ ...out, skip: "sem_template" });
    text = render(tpls[Math.floor(Math.random() * tpls.length)].body, lead);
  }
  // Número que outra empresa da lista já recebeu (14/11: Heritage e Dra. Giovanna no mesmo WhatsApp da recepção).
  // Não manda de novo (por nenhuma das SDRs): a conversa misturaria as duas empresas.
  if (!cfg.test_number) {
    const fim8 = String(lead.whatsapp).replace(/\D/g, "").slice(-8);
    const { data: irmaos } = fim8.length === 8
      ? await sb.from("outreach_leads").select("empresa").neq("place_id", lead.place_id).like("whatsapp", `%${fim8}`).not("wa_sent_at", "is", null).limit(1)
      : { data: [] };
    if (irmaos?.length) {
      await sb.from("outreach_leads").update({ wa_status: "ignorado", wa_error: `mesmo WhatsApp de ${irmaos[0].empresa}, já contatada`, updated_at: new Date().toISOString() }).eq("place_id", lead.place_id);
      await log(lead.place_id, "numero_repetido", { num: lead.whatsapp, outra: irmaos[0].empresa });
      return Response.json({ ...out, skip: "numero_repetido", lead: lead.empresa });
    }
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
    // Número com LID (13/11): mandar para o LID como se fosse número dá "no LID found"; aí vai o número normal
    to = jidDoNumero(chk?.jid, lead.whatsapp);
  }
  const nextAt = new Date(Date.now() + rand(cfg.wa_min_interval_sec, cfg.wa_max_interval_sec) * 1000).toISOString();
  await sb.from("outreach_config").update({ next_wa_at: nextAt }).eq("id", 1);

  if (cfg.dry_run) {
    await log(lead.place_id, "dry_run", { to, text, sdr: quem });
    return Response.json({ ...out, dry_run: true, to, text, sdr: quem, next: nextAt });
  }

  // Marca o horário (e a SDR) antes de enviar: o webhook reconhece o disparo e não pausa a IA
  if (!cfg.test_number) await sb.from("outreach_leads").update({ ultimo_toque_em: new Date().toISOString(), agente: quem }).eq("place_id", lead.place_id);
  const nome = nomeParaSaudar(lead, nomeWhats);
  PDF_DO_LEAD = pdfDoLead(lead);
  // Abordagem v2: só a saudação e o "Tudo bem?" (sem texto, sem PDF, sem áudio)
  let env: { r: { ok: boolean; status: number; body: string }; enviado: string; audio?: boolean; erroAudio?: string; baloes?: { texto: string; id: string | null }[] } =
    await enviarSoSaudacao(cfg.evolution_send_path, to);
  // 17/11: "no LID found" / "not on WhatsApp" em números de fora de SP: tenta uma vez sem o 9
  if (!env.r.ok && /no lid found|not on whatsapp|failed to get user info/i.test(env.r.body)) {
    const sem9 = semNono(to);
    if (sem9) {
      await log(lead.place_id, "tentativa_sem_9", { de: to, para: sem9 });
      const env2 = await enviarSoSaudacao(cfg.evolution_send_path, sem9);
      if (env2.r.ok) { env = env2; to = sem9; }
    }
  }
  void nome; void text;
  if (env.erroAudio) await log(lead.place_id, "audio_erro", { erro: env.erroAudio });
  const r = env.r;
  text = env.enviado;
  const body = r.body;
  if (r.ok) {
    if (!cfg.test_number) {
      const agora = new Date().toISOString();
      await sb.from("outreach_leads").update({
        wa_status: "enviado", wa_sent_at: agora, wa_message: text, agente: quem,
        updated_at: agora,
      }).eq("place_id", lead.place_id);
      // Abordagem v2: sem a cadência antiga; os follow-ups são da SDR do lead (IA SDR), 7 em até 14 dias
    }
    if (!cfg.test_number) await espelharSaudacao(to, quem, env.baloes ?? []);
    await log(lead.place_id, cfg.test_number ? "sent_test" : "sent", { to, toque: 1, sdr: quem, nome_whats: nomeWhats || null, saudou: nome || null, resp: body.slice(0, 300) });
    return Response.json({ ...out, sent: lead.empresa, sdr: quem, to, next: nextAt });
  }
  const attempts = lead.wa_attempts + 1;
  const low = body.toLowerCase();
  const status = /not on whatsapp|not registered|not exist|invalid|não existe/.test(low) ? "sem_whatsapp" : attempts >= 2 ? "erro" : "pendente";
  await sb.from("outreach_leads").update({ wa_status: status, wa_attempts: attempts, wa_error: `${r.status}: ${body.slice(0, 300)}`, updated_at: new Date().toISOString() }).eq("place_id", lead.place_id);
  await log(lead.place_id, "error", { status: r.status, sdr: quem, body: body.slice(0, 300) });
  // 17/11: envio que falhou não segura a fila pelo intervalo inteiro: o próximo tenta daqui a 1 minuto
  await sb.from("outreach_config").update({ next_wa_at: new Date(Date.now() + 60_000).toISOString() }).eq("id", 1);
  return Response.json({ ...out, error: r.status, sdr: quem, body: body.slice(0, 300) });
}
