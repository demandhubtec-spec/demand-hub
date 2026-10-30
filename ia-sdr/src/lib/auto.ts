/**
 * Prospecção automática: mantém a fila de primeiros contatos sempre abastecida.
 *
 * Roda de hora em hora (pg_cron → /api/prospeccao/auto). A cada chamada:
 *  1. Se há uma coleta do Apify rodando, confere; quando termina, importa os leads e registra o custo.
 *  2. Se há leads novos sem sequência, pede para a Ana escrever (5 por chamada).
 *  3. Uma vez por semana (domingo à noite), confere o estoque da fila. Se não cobre a meta da semana,
 *     coleta as próximas buscas (cidade × termo) no Google Maps, dentro do teto do mês.
 *  4. Quando a lista da semana fica pronta, avisa o Kelvin para aprovar em bloco.
 *
 * Nada é enviado sem aprovação: tudo cai na aba Aprovação como "Para revisar".
 */
import { db } from "./db.ts";
import { env } from "./env.ts";
import { sendText } from "./evolution.ts";

export interface NichoAuto {
  nicho: string;
  termos: string[];
}

/** Filtros da coleta: quem não passa nem entra na fila. */
export interface FiltrosAuto {
  so_com_site?: boolean;
  so_com_instagram?: boolean; // aplicado na hora de escrever a sequência (o Instagram vem do site)
  nota_min?: number;
  avaliacoes_min?: number;
  avaliacoes_max?: number; // 0 = sem limite (empresas muito grandes costumam já ter agência)
}

export interface ConfigAuto {
  auto_ativo: boolean | null;
  auto_uf: string | null;
  auto_cidades: string[] | null;
  auto_filtros: FiltrosAuto | null;
  auto_nichos: NichoAuto[] | null;
  auto_meta_dia: number | null;
  auto_lugares_por_busca: number | null;
  auto_cursor: number | null;
  auto_run_id: string | null;
  auto_run_buscas: { termo: string; cidade: string; nicho: string }[] | null;
  auto_ultima_coleta: string | null;
  auto_datasets_pendentes: string[] | null;
  auto_aviso_pendente: boolean | null;
}

const ATOR = "compass~crawler-google-places";
const CUSTO_POR_LUGAR = 0.0045; // US$ (coleta de 28/10: 360 lugares por US$ 1,45)
const APIFY = "https://api.apify.com/v2";

const apifyToken = () => process.env.APIFY_TOKEN || "";
const spHora = (d = new Date()) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(d));
const spDiaSemana = (d = new Date()) =>
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(d));

/** Todas as buscas possíveis, na ordem em que são usadas: cada termo de cada nicho, cidade por cidade. */
export function todasAsBuscas(cidades: string[], nichos: NichoAuto[], uf = ""): { termo: string; cidade: string; nicho: string }[] {
  const out: { termo: string; cidade: string; nicho: string }[] = [];
  for (const cidade of cidades) for (const n of nichos) for (const t of n.termos) out.push({ termo: `${t} ${cidade}${uf ? ` ${uf}` : ""}`, cidade, nicho: n.nicho });
  return out;
}

/** As próximas `qtd` buscas a partir do cursor (dá a volta quando acaba). */
export function proximasBuscas(cidades: string[], nichos: NichoAuto[], cursor: number, qtd: number, uf = "") {
  const todas = todasAsBuscas(cidades, nichos, uf);
  if (!todas.length) return { buscas: [], cursor };
  const buscas = Array.from({ length: Math.min(qtd, todas.length) }, (_, i) => todas[(cursor + i) % todas.length]);
  return { buscas, cursor: (cursor + buscas.length) % todas.length };
}

/** Nicho de um termo de busca antigo ("dentista Indaiatuba" → Odontologia). */
export function nichoDoTermo(termo: string, nichos: NichoAuto[]): string | null {
  const t = (termo || "").toLowerCase();
  for (const n of nichos) if (n.termos.some((x) => t.includes(x.toLowerCase()))) return n.nicho;
  if (/dent|odonto/.test(t)) return "Odontologia";
  if (/advog|advoc/.test(t)) return "Advocacia";
  if (/imobili|imóv|imov/.test(t)) return "Imobiliária";
  if (/pet|veterin/.test(t)) return "Pet shop / Veterinária";
  if (/endocrin/.test(t)) return "Endocrinologia";
  if (/cl[ií]nica m[eé]dica|m[eé]dic/.test(t)) return "Clínica médica";
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Um lugar do Google Maps Scraper no formato de importação do portal. */
export function leadDoApify(it: any, busca: { nicho: string | null; cidade?: string }, totalDaBusca: number) {
  const reviews: any[] = Array.isArray(it.reviews) ? it.reviews : [];
  const respondidas = reviews.filter((r) => r?.responseFromOwnerText).length;
  return {
    place_id: it.placeId,
    empresa: it.title,
    cidade: it.city || busca.cidade || null,
    nicho: busca.nicho,
    endereco: it.address || null,
    telefone: it.phone || null,
    whatsapp: it.phoneUnformatted || it.phone || null, // o importador só aceita celular (55 + DDD + 9)
    email: Array.isArray(it.emails) ? it.emails[0] ?? null : null,
    site: it.website || null,
    instagram: Array.isArray(it.instagrams) ? it.instagrams[0] ?? null : null,
    avaliacoes: it.reviewsCount ?? null,
    nota: it.totalScore ?? null,
    fotos: it.imagesCount ?? null,
    categoria: it.categoryName || null,
    tem_descricao: it.description ? true : false,
    tem_horario: Array.isArray(it.openingHours) && it.openingHours.length > 0,
    responde_avaliacoes: reviews.length ? Math.round((100 * respondidas) / reviews.length) : null,
    termo_busca: it.searchString || null,
    posicao_busca: it.rank ?? null,
    total_busca: totalDaBusca || null,
    origem: "auto",
  };
}

/** O lead passa nos filtros da coleta? (site, nota e número de avaliações no Google) */
export function passaNosFiltros(l: { site: string | null; nota: number | null; avaliacoes: number | null }, f: FiltrosAuto | null | undefined): boolean {
  if (!f) return true;
  if (f.so_com_site && !l.site) return false;
  if (f.nota_min && (l.nota ?? 0) < f.nota_min) return false;
  if (f.avaliacoes_min && (l.avaliacoes ?? 0) < f.avaliacoes_min) return false;
  if (f.avaliacoes_max && (l.avaliacoes ?? 0) > f.avaliacoes_max) return false;
  return true;
}

/** Converte os itens de um dataset em leads (posição e total por busca). */
export function leadsDosItens(itens: any[], nichos: NichoAuto[], buscas?: { termo: string; cidade: string; nicho: string }[]) {
  const porBusca = new Map<string, number>();
  for (const it of itens) porBusca.set(it.searchString ?? "", (porBusca.get(it.searchString ?? "") ?? 0) + 1);
  return itens
    .filter((it) => it?.placeId && it?.title && !it.permanentlyClosed)
    .map((it) => {
      const b = buscas?.find((x) => x.termo.toLowerCase() === String(it.searchString ?? "").toLowerCase());
      return leadDoApify(it, { nicho: b?.nicho ?? nichoDoTermo(it.searchString ?? "", nichos), cidade: b?.cidade }, porBusca.get(it.searchString ?? "") ?? 0);
    });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function apify<T>(caminho: string, init?: RequestInit): Promise<T> {
  const sep = caminho.includes("?") ? "&" : "?";
  const r = await fetch(`${APIFY}${caminho}${sep}token=${apifyToken()}`, init);
  if (!r.ok) throw new Error(`Apify ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

async function avisar(texto: string) {
  if (env.alertPhone) await sendText(env.alertPhone, texto).catch(() => null);
}

const log = (event: string, msg: string, extra: Record<string, unknown> = {}) =>
  db().from("outreach_log").insert({ channel: "auto", event, detail: { msg, ...extra } });

async function importar(leads: unknown[], coleta: Record<string, unknown> | null) {
  const { data, error } = await db().rpc("outreach_import_leads", { p: { leads, ...(coleta ? { coleta } : {}) } });
  if (error) throw new Error(error.message);
  return data as { recebidos: number; novos: number };
}

/** Estoque da fila: primeiros contatos ainda não enviados (com ou sem sequência). */
async function estoque(): Promise<number> {
  const { count } = await db()
    .from("outreach_leads")
    .select("place_id", { count: "exact", head: true })
    .eq("wa_status", "pendente")
    .in("msg_status", ["sem", "gerando", "rascunho", "aprovada"]);
  return count ?? 0;
}

async function gastoDoMes(): Promise<{ gasto: number; teto: number }> {
  const { data } = await db().rpc("outreach_orcamento");
  const o = (data ?? {}) as { gasto_usd?: number; teto_usd?: number };
  return { gasto: Number(o.gasto_usd ?? 0), teto: Number(o.teto_usd ?? 4) };
}

/** Pede para a Ana escrever as sequências dos leads novos (a rota de geração faz 5 por vez). */
async function escreverSequencias(): Promise<{ gerados: number; restantes: number }> {
  const r = await fetch(`${env.appUrl}/api/prospeccao/gerar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.cronSecret}` },
    body: "{}",
  });
  const j = (await r.json().catch(() => ({}))) as { gerados?: number; restantes?: number; error?: string };
  if (!r.ok) throw new Error(j.error ?? `gerar ${r.status}`);
  return { gerados: j.gerados ?? 0, restantes: j.restantes ?? 0 };
}

export async function rodarAuto(opts: { forcar?: boolean } = {}, agora = new Date()) {
  const { data: cfgRow } = await db().from("outreach_config").select("*").eq("id", 1).single();
  const cfg = cfgRow as ConfigAuto;
  const out: Record<string, unknown> = {};
  const nichos = (cfg.auto_nichos ?? []).filter((n) => n?.nicho && n.termos?.length);
  const cidades = (cfg.auto_cidades ?? []).filter(Boolean);

  // 1) Coleta em andamento no Apify
  if (cfg.auto_run_id) {
    const run = await apify<{ data: { status: string; defaultDatasetId: string; usageTotalUsd?: number } }>(`/actor-runs/${cfg.auto_run_id}`);
    const st = run.data.status;
    out.coleta = st;
    if (st === "SUCCEEDED" || ["FAILED", "ABORTED", "TIMED-OUT"].includes(st)) {
      let novos = 0;
      if (st === "SUCCEEDED") {
        const itens = await apify<unknown[]>(`/datasets/${run.data.defaultDatasetId}/items?clean=true&format=json`);
        const leads = leadsDosItens(itens as never[], nichos, cfg.auto_run_buscas ?? undefined).filter((l) => passaNosFiltros(l, cfg.auto_filtros));
        const buscas = cfg.auto_run_buscas ?? [];
        const r = await importar(leads, {
          cidades: [...new Set(buscas.map((b) => b.cidade))],
          nichos: [...new Set(buscas.map((b) => b.nicho))],
          lugares_coletados: (itens as unknown[]).length,
          custo_usd: Number((run.data.usageTotalUsd ?? (itens as unknown[]).length * CUSTO_POR_LUGAR).toFixed(3)),
          observacoes: `Prospecção automática: ${buscas.length} buscas. Dataset ${run.data.defaultDatasetId}.`,
        });
        novos = r.novos;
        await log("coleta", `Coleta automática: ${(itens as unknown[]).length} empresas, ${r.novos} novas na fila`);
      } else {
        await log("error", `Coleta automática terminou com status ${st}`);
      }
      await db().from("outreach_config").update({ auto_run_id: null, auto_run_buscas: null, auto_aviso_pendente: novos > 0 || cfg.auto_aviso_pendente }).eq("id", 1);
      cfg.auto_aviso_pendente = novos > 0 || cfg.auto_aviso_pendente;
      out.novos = novos;
    }
  }

  // 2) Datasets antigos ainda não aproveitados (sem custo novo)
  if (!cfg.auto_run_id && (cfg.auto_datasets_pendentes ?? []).length && apifyToken()) {
    const [ds, ...resto] = cfg.auto_datasets_pendentes ?? [];
    const itens = await apify<unknown[]>(`/datasets/${ds}/items?clean=true&format=json`);
    const r = await importar(leadsDosItens(itens as never[], nichos).filter((l) => passaNosFiltros(l, cfg.auto_filtros)), null);
    await db().from("outreach_config").update({ auto_datasets_pendentes: resto, auto_aviso_pendente: true }).eq("id", 1);
    cfg.auto_aviso_pendente = true;
    await log("coleta", `Coleta antiga reaproveitada (${ds}): ${r.novos} empresas novas na fila, sem custo`);
    out.reaproveitados = r.novos;
  }

  // 3) A Ana escreve as sequências dos leads novos
  const { count: semSeq } = await db().from("outreach_leads").select("place_id", { count: "exact", head: true }).eq("wa_status", "pendente").eq("msg_status", "sem");
  if ((semSeq ?? 0) > 0) {
    const g = await escreverSequencias().catch((e) => ({ erro: String(e) }));
    out.sequencias = g;
  } else if (cfg.auto_aviso_pendente && !cfg.auto_run_id) {
    // 4) Lista pronta: avisa para aprovar em bloco
    const { count: paraRevisar } = await db().from("outreach_leads").select("place_id", { count: "exact", head: true }).eq("wa_status", "pendente").eq("msg_status", "rascunho");
    await avisar(`📋 Lista da semana pronta: ${paraRevisar ?? 0} empresas com a sequência escrita pela Ana.\nRevise por amostragem e aprove em bloco em Prospecção > Aprovação.`);
    await db().from("outreach_config").update({ auto_aviso_pendente: false }).eq("id", 1);
    await log("aviso", `Lista pronta para aprovar: ${paraRevisar ?? 0} empresas`);
    out.aviso = true;
  }

  // 5) Coleta semanal (domingo à noite) ou forçada pelo portal
  const domingoANoite = spDiaSemana(agora) === 0 && spHora(agora) >= 19;
  const ultima = cfg.auto_ultima_coleta ? new Date(cfg.auto_ultima_coleta).getTime() : 0;
  const jaRodouNaSemana = agora.getTime() - ultima < 5 * 864e5;
  if (cfg.auto_ativo && !cfg.auto_run_id && (opts.forcar || (domingoANoite && !jaRodouNaSemana))) {
    const meta = (cfg.auto_meta_dia ?? 30) * 5;
    const tem = await estoque();
    const falta = meta - tem;
    out.estoque = { tem, meta };
    if (falta <= 0) {
      await log("coleta", `Fila já cobre a semana (${tem} de ${meta}); sem coleta nova`);
      await db().from("outreach_config").update({ auto_ultima_coleta: agora.toISOString() }).eq("id", 1);
    } else if (!apifyToken()) {
      await log("error", "Prospecção automática: falta configurar o APIFY_TOKEN");
      await avisar("⚠️ A prospecção automática precisa coletar empresas, mas o token do Apify não está configurado.");
    } else if (!cidades.length || !nichos.length) {
      await log("error", "Prospecção automática: escolha as cidades e os nichos no portal");
    } else {
      const porBusca = cfg.auto_lugares_por_busca ?? 30;
      // ~60% dos lugares viram lead com WhatsApp de celular e sem duplicar; filtros mais fechados aproveitam menos
      const f = cfg.auto_filtros ?? {};
      const rendimento = 0.6 * (f.so_com_site ? 0.7 : 1) * (f.so_com_instagram ? 0.6 : 1) * (f.nota_min || f.avaliacoes_min || f.avaliacoes_max ? 0.8 : 1);
      let qtd = Math.ceil(falta / (porBusca * rendimento));
      const { gasto, teto } = await gastoDoMes();
      const cabe = Math.floor((teto - gasto) / (porBusca * CUSTO_POR_LUGAR));
      if (cabe < qtd) qtd = Math.max(0, cabe);
      if (qtd === 0) {
        await log("error", `Teto do mês atingido (US$ ${gasto.toFixed(2)} de ${teto}); coleta nova fica para o mês que vem`);
        await avisar(`⚠️ Prospecção automática: o teto do Apify do mês (US$ ${teto}) acabou. A fila tem ${tem} de ${meta} contatos da semana.`);
        await db().from("outreach_config").update({ auto_ultima_coleta: agora.toISOString() }).eq("id", 1);
      } else {
        const { buscas, cursor } = proximasBuscas(cidades, nichos, cfg.auto_cursor ?? 0, qtd, cfg.auto_uf ?? "");
        const run = await apify<{ data: { id: string } }>(`/acts/${ATOR}/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            searchStringsArray: buscas.map((b) => b.termo),
            maxCrawledPlacesPerSearch: porBusca,
            language: "pt-BR",
            countryCode: "br",
            maxReviews: 5,
            reviewsSort: "newest",
            scrapeContacts: false,
          }),
        });
        await db()
          .from("outreach_config")
          .update({ auto_run_id: run.data.id, auto_run_buscas: buscas, auto_cursor: cursor, auto_ultima_coleta: agora.toISOString() })
          .eq("id", 1);
        await log("coleta", `Coleta automática iniciada: ${buscas.length} buscas (${buscas.map((b) => b.termo).join(", ")})`);
        out.iniciada = buscas.map((b) => b.termo);
      }
    }
  }
  return out;
}
