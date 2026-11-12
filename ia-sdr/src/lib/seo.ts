/**
 * SEO e orgânico.
 *  - sincronizarGSC: puxa do Google Search Console as buscas em que o site aparece (palavra-chave, página,
 *    cliques, impressões, posição) e guarda por dia em seo_gsc_diario.
 *  - checarIAs: faz ao ChatGPT (com busca na web) as perguntas cadastradas em seo_ia_perguntas e registra
 *    se a DemandIA foi citada, quais sites ele usou de fonte e quem mais apareceu.
 * Roda pelo relógio do Supabase (/api/cron/seo) e pelos botões do portal (Marketing > SEO e orgânico).
 */
import { db } from "./db.ts";
import { env } from "./env.ts";
import { accessToken } from "./google.ts";

const SITE_PADRAO = "https://demandhub.com.br/";
const MARCA = /demand\s*-?\s*ia\b|demandhub|demand\s+hub/i;

function dia(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Qual propriedade do Search Console usar: a do demandhub.com.br que a conta conectada enxerga. */
async function siteDoSearchConsole(): Promise<string> {
  if (process.env.SEO_SITE_URL) return process.env.SEO_SITE_URL;
  const { data } = await db().from("sdr_integrations").select("value").eq("key", "searchconsole").maybeSingle();
  const sites = ((data?.value as { sites?: string[] } | null)?.sites ?? []).filter((s) => s.includes("demandhub.com.br"));
  // prefere a propriedade de domínio (pega www e sem www), senão a de endereço
  return sites.find((s) => s.startsWith("sc-domain:")) ?? sites[0] ?? SITE_PADRAO;
}

export async function statusSearchConsole() {
  const { data } = await db().from("sdr_integrations").select("value, updated_at").eq("key", "searchconsole").maybeSingle();
  const v = (data?.value ?? null) as { refresh_token?: string; sites?: string[]; connected_at?: string } | null;
  const { data: ultimo } = await db().from("seo_gsc_diario").select("data").order("data", { ascending: false }).limit(1).maybeSingle();
  return {
    conectado: !!v?.refresh_token,
    site_ok: !!v?.sites?.some((s) => s.includes("demandhub.com.br")),
    conectado_em: v?.connected_at ?? null,
    ultimo_dia: (ultimo?.data as string | undefined) ?? null,
  };
}

/**
 * Busca os últimos `dias` dias no Search Console (o Google entrega com 2 a 3 dias de atraso).
 * Na primeira vez, sem nada guardado, busca 90 dias para já ter histórico.
 */
export async function sincronizarGSC(dias?: number): Promise<{ site: string; linhas: number; de: string; ate: string }> {
  const token = await accessToken("searchconsole");
  const site = await siteDoSearchConsole();
  const { count } = await db().from("seo_gsc_diario").select("data", { count: "exact", head: true });
  const janela = dias ?? (count ? 7 : 90);
  const ate = new Date(Date.now() - 2 * 86_400_000);
  const de = new Date(ate.getTime() - (janela - 1) * 86_400_000);

  let total = 0;
  for (let startRow = 0; startRow < 100_000; startRow += 25_000) {
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: dia(de),
        endDate: dia(ate),
        dimensions: ["date", "query", "page"],
        rowLimit: 25_000,
        startRow,
        dataState: "all",
      }),
    });
    const j = (await r.json()) as {
      rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
      error?: { message: string };
    };
    if (!r.ok) throw new Error(`Search Console ${r.status}: ${j.error?.message ?? "erro"}`);
    const rows = j.rows ?? [];
    for (let i = 0; i < rows.length; i += 1000) {
      const lote = rows.slice(i, i + 1000).map((x) => ({
        data: x.keys[0],
        consulta: x.keys[1].slice(0, 300),
        pagina: x.keys[2].slice(0, 500),
        cliques: Math.round(x.clicks),
        impressoes: Math.round(x.impressions),
        ctr: x.ctr,
        posicao: x.position,
        atualizado_em: new Date().toISOString(),
      }));
      const { error } = await db().from("seo_gsc_diario").upsert(lote, { onConflict: "data,consulta,pagina" });
      if (error) throw new Error(`gravar seo_gsc_diario: ${error.message}`);
    }
    total += rows.length;
    if (rows.length < 25_000) break;
  }
  return { site, linhas: total, de: dia(de), ate: dia(ate) };
}

interface RespostaIA {
  texto: string;
  fontes: { url: string; titulo: string }[];
}

/** Pergunta ao modelo da OpenAI com busca na web ligada (o mais parecido com o ChatGPT de verdade). */
async function perguntarComBusca(pergunta: string): Promise<RespostaIA> {
  const body = {
    model: process.env.SEO_IA_MODEL || env.openaiModel,
    tools: [{ type: "web_search", user_location: { type: "approximate", country: "BR", city: "Campinas", region: "São Paulo" } }],
    input: [
      {
        role: "user",
        content: `${pergunta}\n\nResponda em português do Brasil, como responderia para um empresário, citando nomes de empresas e sites quando fizer sentido.`,
      },
    ],
  };
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.openaiKey}` },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const j = (await r.json()) as {
        output?: { type: string; content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[] }[];
      };
      let texto = "";
      const fontes: { url: string; titulo: string }[] = [];
      for (const o of j.output ?? []) {
        if (o.type !== "message") continue;
        for (const c of o.content ?? []) {
          if (c.type === "output_text" && c.text) texto += c.text;
          for (const a of c.annotations ?? []) {
            if (a.type === "url_citation" && a.url && !fontes.some((f) => f.url === a.url)) fontes.push({ url: a.url, titulo: a.title ?? "" });
          }
        }
      }
      return { texto, fontes };
    }
    if ([429, 500, 502, 503].includes(r.status) && tentativa < 2) {
      await new Promise((ok) => setTimeout(ok, 2000 * (tentativa + 1)));
      continue;
    }
    throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  throw new Error("OpenAI sem resposta");
}

function dominio(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Faz as perguntas ativas (ou só uma) e registra o resultado de cada uma. */
export async function checarIAs(perguntaId?: string): Promise<{ checadas: number; citada_em: number }> {
  let q = db().from("seo_ia_perguntas").select("id, pergunta").eq("ativa", true).order("criado_em");
  if (perguntaId) q = db().from("seo_ia_perguntas").select("id, pergunta").eq("id", perguntaId);
  const { data: perguntas, error } = await q;
  if (error) throw new Error(error.message);

  let citada = 0;
  // 4 perguntas por vez, para caber no tempo do servidor (cada uma leva alguns segundos com a busca na web)
  const lista = perguntas ?? [];
  for (let i = 0; i < lista.length; i += 4) {
    await Promise.all(lista.slice(i, i + 4).map(async (p) => {
      try {
        const r = await perguntarComBusca(p.pergunta as string);
        const citou = MARCA.test(r.texto) || r.fontes.some((f) => f.url.includes("demandhub.com.br"));
        if (citou) citada++;
        // posição aproximada: em que ordem o demandhub.com.br aparece entre os sites usados de fonte
        const doms = [...new Set(r.fontes.map((f) => dominio(f.url)))];
        const posicaoFonte = doms.findIndex((d) => d.includes("demandhub.com.br"));
        await db().from("seo_ia_checagens").insert({
          pergunta_id: p.id,
          pergunta: p.pergunta,
          motor: "chatgpt",
          citou,
          posicao: posicaoFonte >= 0 ? posicaoFonte + 1 : null,
          fontes: doms.slice(0, 12),
          resposta: r.texto.slice(0, 6000),
        });
      } catch (e) {
        await db().from("seo_ia_checagens").insert({
          pergunta_id: p.id,
          pergunta: p.pergunta,
          motor: "chatgpt",
          citou: false,
          erro: String((e as Error).message).slice(0, 400),
        });
      }
    }));
  }
  return { checadas: perguntas?.length ?? 0, citada_em: citada };
}
