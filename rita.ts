/**
 * Rita (raio-x digital) e Duda (relatório e site): Etapa 3 do Time Comercial IA (08/11/2026).
 *
 * Depois que o Kelvin aprova a empresa na lista do Léo:
 *  1. Rita audita Google Meu Negócio (posição na busca e concorrentes), site (velocidade e estrutura) e
 *     Instagram (comparado com concorrentes da região) e escreve, para cada área: nota, aprovado ou reprovado,
 *     pontos positivos, pontos críticos e o que a empresa ganha em clientes e faturamento melhorando.
 *     → vai para a aprovação do Kelvin (etapa "Rita").
 *  2. Aprovado, a Duda monta o relatório com a marca da DemandIA e a logo do cliente e, para quem não
 *     tem site, o site de demonstração. → aprovação do Kelvin (etapa "Duda").
 *  3. Aprovado, a Bia escreve as mensagens (com o link do relatório) e o Rui revisa.
 * Cliente oculto entra quando o segundo número de WhatsApp estiver conectado (Etapa 4).
 */
import { randomBytes } from "node:crypto";
import { db } from "./db.ts";
import { callLLM } from "./llm.ts";
import { baixar } from "./enriquecer.ts";
import { gerarSite, semSiteProprio } from "./extras.ts";
import { diagnosticar, type Concorrente, type LeadPerfil } from "./diagnostico-perfil.ts";
import { carregarPlaybook, manuaisAtuais, playbookAtual } from "./playbook.ts";

const APIFY = "https://api.apify.com/v2";
const ATOR_INSTAGRAM = "apify~instagram-profile-scraper";
const CUSTO_PERFIL = 0.003;
const POR_RODADA = 2;

export interface AreaDiagnostico {
  nota: number; // 0 a 100
  aprovado: boolean;
  resumo: string;
  positivos: string[];
  criticos: string[];
  ganho: string; // o que a empresa ganha resolvendo (clientes e faturamento)
  dados?: Record<string, unknown>;
}

export interface Diagnosticos {
  google: AreaDiagnostico | null;
  site: (AreaDiagnostico & { tem_site: boolean }) | null;
  instagram: AreaDiagnostico | null;
  cliente_oculto: AreaDiagnostico | null;
  geral: { nota: number; frase: string; solucao: string };
  gerado_em: string;
}

/* ───────────── Site: leitura do HTML (puro, testável) ───────────── */

export interface ChecagemSite {
  https: boolean;
  titulo: string | null;
  descricao: boolean;
  celular: boolean; // meta viewport
  whatsapp: boolean;
  telefone: boolean;
  formulario: boolean;
  instagram: boolean;
  depoimentos: boolean;
  mapa: boolean;
  palavras: number;
  logo: string | null;
}

export function analisarHtml(html: string, url: string): ChecagemSite {
  const h = html ?? "";
  const texto = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const abs = (u: string | undefined) => {
    if (!u) return null;
    try {
      return new URL(u, url).toString();
    } catch {
      return null;
    }
  };
  const og = h.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] ?? h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
  const icone = h.match(/<link[^>]+rel=["'](?:apple-touch-icon|icon)["'][^>]+href=["']([^"']+)/i)?.[1];
  const imgLogo = h.match(/<img[^>]+(?:class|id|alt|src)=["'][^"']*logo[^"']*["'][^>]*>/i)?.[0]?.match(/src=["']([^"']+)/i)?.[1];
  return {
    https: /^https:/i.test(url),
    titulo: h.match(/<title[^>]*>([^<]{2,120})<\/title>/i)?.[1]?.trim() ?? null,
    descricao: /<meta[^>]+name=["']description["']/i.test(h),
    celular: /<meta[^>]+name=["']viewport["']/i.test(h),
    whatsapp: /wa\.me\/|api\.whatsapp\.com|whatsapp/i.test(h),
    telefone: /tel:|\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/.test(texto),
    formulario: /<form[\s>]/i.test(h),
    instagram: /instagram\.com\//i.test(h),
    depoimentos: /depoiment|avalia[cç][õo]es|o que (nossos|os) (clientes|pacientes) dizem|testemunh/i.test(texto),
    mapa: /google\.com\/maps|maps\.google|goo\.gl\/maps/i.test(h),
    palavras: texto.split(/\s+/).filter(Boolean).length,
    logo: abs(imgLogo) ?? abs(og) ?? abs(icone),
  };
}

/** Velocidade no celular pelo PageSpeed do Google (gratuito). Nulo se não der. */
async function velocidade(url: string): Promise<{ nota: number; lcp_s: number | null } | null> {
  try {
    const key = process.env.PSI_KEY ? `&key=${process.env.PSI_KEY}` : "";
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance${key}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { numericValue?: number }> } };
    const score = j.lighthouseResult?.categories?.performance?.score;
    if (score == null) return null;
    const lcp = j.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue;
    return { nota: Math.round(score * 100), lcp_s: lcp ? Math.round(lcp / 100) / 10 : null };
  } catch {
    return null;
  }
}

/* ───────────── Instagram (Apify, dentro do teto do time) ───────────── */

export interface PerfilInstagram {
  usuario: string;
  seguidores: number | null;
  posts: number | null;
  bio: string;
  link: string | null;
  comercial: boolean;
  ultimo_post: string | null;
  foto: string | null;
}

const handle = (url: string | null | undefined) => (url ?? "").match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1]?.toLowerCase() ?? null;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function lerPerfil(p: any): PerfilInstagram {
  const datas = (Array.isArray(p.latestPosts) ? p.latestPosts : []).map((x: any) => x?.timestamp).filter(Boolean).sort();
  return {
    usuario: String(p.username ?? "").toLowerCase(),
    seguidores: p.followersCount ?? null,
    posts: p.postsCount ?? null,
    bio: p.biography ?? "",
    link: p.externalUrl ?? null,
    comercial: !!(p.isBusinessAccount ?? p.businessCategoryName),
    ultimo_post: datas.length ? datas[datas.length - 1] : null,
    foto: p.profilePicUrlHD ?? p.profilePicUrl ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function perfisInstagram(usuarios: string[]): Promise<{ perfis: PerfilInstagram[]; custo: number }> {
  const token = process.env.APIFY_TOKEN;
  if (!token || !usuarios.length) return { perfis: [], custo: 0 };
  const r = await fetch(`${APIFY}/acts/${ATOR_INSTAGRAM}/runs?token=${token}&waitForFinish=120`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: usuarios }),
    signal: AbortSignal.timeout(130_000),
  });
  if (!r.ok) return { perfis: [], custo: 0 };
  const run = (await r.json()) as { data: { status: string; defaultDatasetId: string; usageTotalUsd?: number } };
  const custo = Number(run.data.usageTotalUsd ?? usuarios.length * CUSTO_PERFIL);
  if (run.data.status !== "SUCCEEDED") return { perfis: [], custo };
  const itens = await (await fetch(`${APIFY}/datasets/${run.data.defaultDatasetId}/items?clean=true&format=json&token=${token}`)).json();
  return { perfis: (Array.isArray(itens) ? itens : []).map(lerPerfil), custo };
}

/** Quanto o time (Léo e Rita) ainda pode gastar no Apify este mês. */
async function saldoDoTime(): Promise<number> {
  const inicio = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  inicio.setDate(1);
  inicio.setHours(0, 0, 0, 0);
  const [{ data: o }, { data: cfg }, { data: gastos }] = await Promise.all([
    db().rpc("outreach_orcamento"),
    db().from("outreach_config").select("leo_teto_usd").eq("id", 1).single(),
    db()
      .from("outreach_coletas")
      .select("custo_usd")
      .or("observacoes.like.Léo:%,observacoes.like.Rita:%")
      .gte("executada_em", new Date(inicio.getTime() + 3 * 3600e3).toISOString()),
  ]);
  const orc = (o ?? {}) as { gasto_usd?: number; teto_usd?: number };
  const doTime = ((gastos ?? []) as { custo_usd: number }[]).reduce((a, x) => a + Number(x.custo_usd ?? 0), 0);
  const tetoTime = Number((cfg as { leo_teto_usd?: number } | null)?.leo_teto_usd ?? 1.5);
  return Math.min(tetoTime - doTime, Number(orc.teto_usd ?? 4) - Number(orc.gasto_usd ?? 0));
}

/* ───────────── Texto da Rita (LLM) ───────────── */

interface LeadRita extends LeadPerfil {
  place_id: string;
  site: string | null;
  instagram: string | null;
  termo_busca: string | null;
  posicao_busca: number | null;
  total_busca: number | null;
  rita_nota: string | null;
  rita_status: string | null;
  diagnosticos: Diagnosticos | null;
  marca: { logo?: string | null } | null;
  relatorio_token: string | null;
}

export function promptRita(lead: LeadRita, fatos: Record<string, unknown>): string {
  return `Você é a Rita, analista de presença digital da DemandIA. Escreva o diagnóstico de ${lead.empresa} (${lead.nicho ?? "empresa local"}, ${lead.cidade ?? ""}) para o DONO ler.
Use só os fatos abaixo. Não invente números. Linguagem de dono, sem termo técnico, sem travessão. Não menospreze a empresa: mostre o que melhora.
Para cada área diga o que a empresa ganha em clientes e faturamento melhorando (ex.: "aparecer entre os 3 primeiros da busca traz mais ligações de quem já quer contratar").

Fatos (JSON):
${JSON.stringify(fatos, null, 1).slice(0, 9000)}

Responda em JSON:
{"google":AREA,"site":AREA|null,"instagram":AREA|null,"geral":{"nota":0-100,"frase":"1 frase forte para o dono","solucao":"como a DemandIA resolve (atendimento com IA, site, prospecção), 2 frases"}}
AREA = {"nota":0-100,"aprovado":true|false,"resumo":"1 frase","positivos":["..."],"criticos":["..."],"ganho":"1 a 2 frases"}
Regras: aprovado só com nota 70 ou mais. 1 a 3 positivos, 2 a 4 críticos. Se não houver site, "site" = null. Se não houver Instagram, "instagram" = null.
${lead.rita_nota ? `\nO Kelvin pediu este ajuste na versão anterior: ${lead.rita_nota}` : ""}
${playbookAtual() ? `\n## Playbook comercial\n${playbookAtual()}` : ""}
${manuaisAtuais("rita")}`;
}

const CAMPOS = "place_id,empresa,nicho,cidade,avaliacoes,nota,site,instagram,fotos,tem_descricao,tem_horario,responde_avaliacoes,termo_busca,posicao_busca,total_busca,rita_nota,rita_status,diagnosticos,marca,relatorio_token";

async function concorrentesDe(lead: LeadRita): Promise<(Concorrente & { instagram: string | null })[]> {
  let q = db().from("outreach_leads").select("place_id,empresa,avaliacoes,nota,instagram,posicao_busca").neq("place_id", lead.place_id).eq("nicho", lead.nicho ?? "").eq("cidade", lead.cidade ?? "");
  if (lead.termo_busca) q = db().from("outreach_leads").select("place_id,empresa,avaliacoes,nota,instagram,posicao_busca").neq("place_id", lead.place_id).eq("termo_busca", lead.termo_busca);
  const { data } = await q.order("avaliacoes", { ascending: false }).limit(8);
  return (data ?? []) as unknown as (Concorrente & { instagram: string | null })[];
}

/** Gera (ou refaz, se o Kelvin pediu ajuste) o diagnóstico de uma empresa. */
async function diagnosticar1(lead: LeadRita, perfis: Map<string, PerfilInstagram>): Promise<void> {
  const conc = await concorrentesDe(lead);
  const google = diagnosticar(lead, conc);
  const temSite = !semSiteProprio(lead.site);
  let site: ChecagemSite | null = null;
  let vel: Awaited<ReturnType<typeof velocidade>> = null;
  if (temSite) {
    const url = (/^https?:/i.test(lead.site!) ? lead.site! : `https://${lead.site}`).replace(/\/+$/, "");
    const html = await baixar(url);
    site = html ? analisarHtml(html, url) : null;
    vel = await velocidade(url);
  }
  const igLead = perfis.get(handle(lead.instagram) ?? "") ?? null;
  const igConc = conc.map((c) => perfis.get(handle(c.instagram) ?? "")).filter(Boolean) as PerfilInstagram[];

  const fatos = {
    google: {
      nota: lead.nota,
      avaliacoes: lead.avaliacoes,
      fotos: lead.fotos,
      tem_descricao: lead.tem_descricao,
      tem_horario: lead.tem_horario,
      responde_avaliacoes_pct: lead.responde_avaliacoes,
      posicao_na_busca: lead.posicao_busca ? `${lead.posicao_busca}º de ${lead.total_busca ?? "?"} em "${lead.termo_busca}"` : null,
      pontos_fortes: google.pontos_fortes,
      oportunidades: google.oportunidades,
      concorrentes: conc.slice(0, 5).map((c) => ({ empresa: c.empresa, nota: c.nota, avaliacoes: c.avaliacoes, posicao: (c as { posicao_busca?: number }).posicao_busca ?? null })),
    },
    site: temSite ? { endereco: lead.site, encontrou_pagina: !!site, velocidade_celular: vel, checagem: site } : null,
    instagram: igLead
      ? { perfil: igLead, concorrentes: igConc.map((p) => ({ usuario: p.usuario, seguidores: p.seguidores, posts: p.posts, ultimo_post: p.ultimo_post })) }
      : lead.instagram
        ? { perfil: lead.instagram, observacao: "não deu para ler o perfil agora" }
        : null,
  };

  const r = await callLLM({ system: promptRita(lead, fatos), messages: [{ role: "user", content: "Escreva o diagnóstico." }], maxTokens: 4000, json: true });
  const j = JSON.parse(r.message.content ?? "{}") as Partial<Diagnosticos>;
  const area = (a: AreaDiagnostico | null | undefined, dados?: Record<string, unknown>): AreaDiagnostico | null =>
    a && typeof a.nota === "number"
      ? { ...a, nota: Math.max(0, Math.min(100, Math.round(a.nota))), aprovado: a.nota >= 70, positivos: a.positivos ?? [], criticos: a.criticos ?? [], dados }
      : null;
  const diag: Diagnosticos = {
    google: area(j.google, fatos.google),
    site: temSite ? { ...(area(j.site, fatos.site ?? undefined) ?? { nota: 0, aprovado: false, resumo: "Não conseguimos abrir o site.", positivos: [], criticos: ["O site não abriu no teste"], ganho: "" }), tem_site: true } : null,
    instagram: area(j.instagram, fatos.instagram ?? undefined),
    cliente_oculto: lead.diagnosticos?.cliente_oculto ?? null,
    geral: { nota: Number(j.geral?.nota ?? 0), frase: j.geral?.frase ?? "", solucao: j.geral?.solucao ?? "" },
    gerado_em: new Date().toISOString(),
  };
  const logo = igLead?.foto ?? site?.logo ?? lead.marca?.logo ?? null;
  await db()
    .from("outreach_leads")
    .update({
      diagnosticos: diag,
      marca: { ...(lead.marca ?? {}), logo },
      relatorio_token: lead.relatorio_token ?? randomBytes(9).toString("base64url"),
      rita_status: "pendente",
      rita_nota: null,
      duda_status: null,
    })
    .eq("place_id", lead.place_id);
}

/** Uma rodada da Rita e da Duda (cron a cada 10 minutos). */
export async function runRitaEDuda(): Promise<Record<string, unknown>> {
  await carregarPlaybook();
  const out: Record<string, unknown> = {};

  // Rita: aprovados na lista do Léo ainda sem diagnóstico, ou com ajuste pedido
  const { data } = await db()
    .from("outreach_leads")
    .select(CAMPOS)
    .eq("wa_status", "pendente")
    .eq("leo_status", "aprovado")
    .or("rita_status.is.null,rita_status.eq.ajuste")
    .order("leo_decidido_em", { ascending: true })
    .limit(POR_RODADA);
  const leads = (data ?? []) as unknown as LeadRita[];
  if (leads.length) {
    // Instagram de todos (empresa + até 3 concorrentes), numa coleta só, se couber no teto
    const usuarios = new Set<string>();
    for (const l of leads) {
      const h = handle(l.instagram);
      if (!h) continue;
      usuarios.add(h);
      for (const c of (await concorrentesDe(l)).filter((c) => handle(c.instagram)).slice(0, 3)) usuarios.add(handle(c.instagram)!);
    }
    const perfis = new Map<string, PerfilInstagram>();
    if (usuarios.size && (await saldoDoTime()) >= usuarios.size * CUSTO_PERFIL) {
      const r = await perfisInstagram([...usuarios]).catch(() => ({ perfis: [], custo: 0 }));
      r.perfis.forEach((p) => perfis.set(p.usuario, p));
      if (r.custo > 0) await db().from("outreach_coletas").insert({ custo_usd: r.custo, lugares_coletados: 0, novos_adicionados: 0, observacoes: `Rita: Instagram (${usuarios.size} perfis)` });
    }
    let feitos = 0;
    for (const l of leads) {
      await diagnosticar1(l, perfis).then(() => feitos++).catch((e) => console.error("Rita falhou", l.place_id, e));
    }
    out.rita = feitos;
  }

  // Duda: diagnóstico aprovado → site de demonstração para quem não tem site (o relatório já está no ar)
  const { data: d } = await db()
    .from("outreach_leads")
    .select("place_id,empresa,nicho,cidade,decisor,endereco,nota,avaliacoes,fotos,tem_descricao,tem_horario,responde_avaliacoes,termo_busca,posicao_busca,total_busca,site,instagram,site_preview,duda_nota,duda_status")
    .eq("wa_status", "pendente")
    .eq("rita_status", "aprovado")
    .or("duda_status.is.null,duda_status.eq.ajuste")
    .limit(POR_RODADA);
  let duda = 0;
  for (const l of (d ?? []) as unknown as (LeadPerfil & { place_id: string; site: string | null; endereco: string | null; site_preview: { token?: string } | null; duda_status: string | null })[]) {
    try {
      const patch: Record<string, unknown> = { duda_status: "pendente", duda_nota: null };
      if (semSiteProprio(l.site) && (!l.site_preview || l.duda_status === "ajuste")) patch.site_preview = await gerarSite(l, l.site_preview?.token ?? null, (l as { duda_nota?: string | null }).duda_nota ?? null);
      await db().from("outreach_leads").update(patch).eq("place_id", l.place_id);
      duda++;
    } catch (e) {
      console.error("Duda falhou", l.place_id, e);
    }
  }
  out.duda = duda;
  return out;
}

/** Link público do relatório (fica no app da IA SDR). */
export function linkRelatorio(token: string, base = process.env.APP_URL || "https://demandia-sdr.vercel.app") {
  return `${base.replace(/\/$/, "")}/relatorio/${token}`;
}
