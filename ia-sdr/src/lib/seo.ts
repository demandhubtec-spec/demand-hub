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
import { callLLM } from "./llm.ts";

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

/**
 * A resposta citou a DemandIA de Indaiatuba (demandhub.com.br)?
 * Existe outra empresa com nome parecido (demandia.ai): se a IA falou "DemandIA" usando só ela de fonte,
 * sem nada que ligue à nossa (demandhub, Indaiatuba), não conta.
 */
export function citouDemandIA(texto: string, dominios: string[]): boolean {
  const nossaFonte = dominios.some((d) => d.includes("demandhub.com.br"));
  if (nossaFonte || /demandhub|demand\s+hub/i.test(texto)) return true;
  if (!MARCA.test(texto)) return false;
  const outra = dominios.some((d) => d === "demandia.ai" || d.endsWith(".demandia.ai"));
  if (outra && !/indaiatuba/i.test(texto)) return false;
  return true;
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
        const doms = [...new Set(r.fontes.map((f) => dominio(f.url)))];
        const citou = citouDemandIA(r.texto, doms);
        if (citou) citada++;
        // posição aproximada: em que ordem o demandhub.com.br aparece entre os sites usados de fonte
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

/* ------------------------------ Plano da semana ------------------------------ */

interface ItemPlano {
  prioridade: "alta" | "média" | "baixa";
  titulo: string;
  porque: string;
  como: string[];
  pagina?: string;
  palavra?: string;
}

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Texto principal de uma página do site (título, descrição, títulos e trechos), para a análise. */
async function lerPagina(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "DemandIA-SEO/1.0" } });
    if (!r.ok) return `${url}: erro ${r.status}`;
    const html = await r.text();
    const pega = (re: RegExp) => [...html.matchAll(re)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
    const title = pega(/<title[^>]*>([\s\S]*?)<\/title>/gi)[0] ?? "";
    const desc = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(html)?.[1] ?? "";
    const h1 = pega(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
    const h2 = pega(/<h2[^>]*>([\s\S]*?)<\/h2>/gi);
    const h3 = pega(/<h3[^>]*>([\s\S]*?)<\/h3>/gi).slice(0, 25);
    const palavras = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    return [`URL: ${url}`, `Título: ${title}`, `Descrição: ${desc}`, `H1: ${h1.join(" | ")}`, `H2: ${h2.join(" | ")}`, `H3: ${h3.join(" | ")}`, `Palavras na página: ~${palavras}`].join("\n");
  } catch (e) {
    return `${url}: não abriu (${(e as Error).message})`;
  }
}

/**
 * Analisa os números do Google (últimos 28 dias), as palavras-alvo, o conteúdo do site e a presença nas IAs
 * e grava em seo_recomendacoes as ações da semana para subir no ranking. Roda toda segunda e pelo botão do portal.
 */
export async function gerarPlano(): Promise<{ itens: number }> {
  const desde = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: linhas }, { data: alvos }, { data: checagens }] = await Promise.all([
    db().from("seo_gsc_diario").select("consulta, pagina, cliques, impressoes, posicao").gte("data", desde).limit(20_000),
    db().from("seo_palavras_alvo").select("palavra").eq("ativa", true),
    db().from("seo_ia_checagens").select("pergunta, citou, fontes, criado_em").is("erro", null).order("criado_em", { ascending: false }).limit(30),
  ]);

  // buscas do Google somadas no período
  const porBusca = new Map<string, { c: number; i: number; pi: number; paginas: Map<string, number> }>();
  for (const l of linhas ?? []) {
    const k = l.consulta as string;
    const a = porBusca.get(k) ?? { c: 0, i: 0, pi: 0, paginas: new Map() };
    a.c += l.cliques as number;
    a.i += l.impressoes as number;
    a.pi += ((l.posicao as number) ?? 0) * (l.impressoes as number);
    a.paginas.set(l.pagina as string, (a.paginas.get(l.pagina as string) ?? 0) + (l.impressoes as number));
    porBusca.set(k, a);
  }
  const buscas = [...porBusca.entries()]
    .map(([consulta, a]) => ({
      consulta,
      cliques: a.c,
      impressoes: a.i,
      posicao: a.i ? Math.round((a.pi / a.i) * 10) / 10 : null,
      pagina: [...a.paginas.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "",
    }))
    .sort((x, y) => y.impressoes - x.impressoes)
    .slice(0, 60);

  const alvosTxt = (alvos ?? []).map((a) => {
    const n = norm(a.palavra as string);
    const m = buscas.filter((b) => norm(b.consulta).includes(n));
    if (!m.length) return `- "${a.palavra}": ainda não aparece no Google`;
    const imp = m.reduce((s, b) => s + b.impressoes, 0);
    const pos = m.reduce((s, b) => s + (b.posicao ?? 0) * b.impressoes, 0) / Math.max(imp, 1);
    return `- "${a.palavra}": posição média ${pos.toFixed(1)} (página ${Math.ceil(pos / 10)} do Google), ${imp} impressões, página do site ${m[0].pagina}`;
  });

  // última checagem de cada pergunta nas IAs
  const vistas = new Set<string>();
  const iaTxt: string[] = [];
  const fontes = new Map<string, number>();
  for (const c of checagens ?? []) {
    for (const f of (c.fontes as string[] | null) ?? []) fontes.set(f, (fontes.get(f) ?? 0) + 1);
    if (vistas.has(c.pergunta as string)) continue;
    vistas.add(c.pergunta as string);
    iaTxt.push(`- ${c.citou ? "CITOU" : "não citou"}: ${c.pergunta}`);
  }
  const concorrentes = [...fontes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([f, n]) => `${f} (${n})`);

  const site = await Promise.all(["https://demandhub.com.br/", "https://demandhub.com.br/diagnostico"].map(lerPagina));

  const base = {
    buscas: buscas.length,
    impressoes: buscas.reduce((s, b) => s + b.impressoes, 0),
    cliques: buscas.reduce((s, b) => s + b.cliques, 0),
  };

  const system = `Você é um especialista em SEO (Google) e GEO (aparecer em respostas de IAs como ChatGPT) que trabalha para a DemandIA,
empresa de Indaiatuba/SP que faz agentes de IA, automação, CRM, sistemas sob medida, marketing e sites para empresas que faturam acima de R$ 30 mil por mês.
O site é demandhub.com.br (uma página principal e a página /diagnostico; também há portfólios por nicho em /portfolioclinicas, /portfoliobarbearia, /portfolioadvocacia etc.).
Quem vai ler é o dono, que não é técnico: escreva em português do Brasil simples, sem jargão, sem travessão (—).
Gere de 4 a 6 ações concretas para a semana, em ordem de impacto, para o site subir no Google e ser citado pelas IAs.
Cada ação precisa dizer exatamente o que fazer (qual página, qual texto, qual palavra), não conselhos genéricos.
Considere: palavras que estão na 2ª página do Google (posição 11 a 20) são as que mais valem o esforço; muitas impressões com poucos cliques pedem título e descrição melhores;
palavras-alvo que ainda não aparecem pedem conteúdo novo (uma seção ou uma página própria); perfil no Google Meu Negócio, avaliações e links de outros sites ajudam muito em buscas locais;
para as IAs, ajudam: páginas que respondem perguntas diretas, ser citado em listas e diretórios, e deixar claro "DemandIA de Indaiatuba" para não confundir com outra empresa de nome parecido (demandia.ai).
Responda só com JSON: {"resumo": "2 frases sobre a situação", "itens": [{"prioridade": "alta|média|baixa", "titulo": "ação curta", "porque": "1 frase com o número que justifica", "como": ["passo 1", "passo 2"], "pagina": "url ou vazio", "palavra": "palavra-chave ou vazio"}]}`;

  const user = [
    `## Google, últimos 28 dias (${base.impressoes} impressões, ${base.cliques} cliques, ${buscas.length} buscas diferentes)`,
    buscas.length
      ? buscas.slice(0, 40).map((b) => `- "${b.consulta}": posição ${b.posicao}, ${b.impressoes} impressões, ${b.cliques} cliques, página ${b.pagina}`).join("\n")
      : "Ainda sem dados do Google (site verificado há poucos dias).",
    `\n## Palavras-alvo`,
    alvosTxt.join("\n") || "Nenhuma cadastrada.",
    `\n## ChatGPT (última checagem de cada pergunta)`,
    iaTxt.join("\n") || "Ainda sem checagem.",
    concorrentes.length ? `Sites que o ChatGPT mais usa de fonte: ${concorrentes.join(", ")}` : "",
    `\n## Conteúdo atual do site`,
    site.join("\n\n"),
  ].join("\n");

  const res = await callLLM({ system, messages: [{ role: "user", content: user }], json: true, maxTokens: 3000 });
  let out: { resumo?: string; itens?: ItemPlano[] } = {};
  try {
    out = JSON.parse(res.message.content ?? "{}");
  } catch {
    throw new Error("A análise não voltou em formato válido. Tente de novo.");
  }
  const itens = (out.itens ?? []).slice(0, 6).map((i) => ({
    prioridade: (["alta", "média", "baixa"].includes(i.prioridade) ? i.prioridade : "média") as ItemPlano["prioridade"],
    titulo: String(i.titulo ?? "").replace(/—/g, ","),
    porque: String(i.porque ?? "").replace(/—/g, ","),
    como: (Array.isArray(i.como) ? i.como : []).map((c) => String(c).replace(/—/g, ",")).slice(0, 6),
    pagina: i.pagina ? String(i.pagina) : "",
    palavra: i.palavra ? String(i.palavra) : "",
  }));
  if (!itens.length) throw new Error("A análise voltou sem ações. Tente de novo.");
  const { error } = await db().from("seo_recomendacoes").insert({ resumo: String(out.resumo ?? "").replace(/—/g, ","), itens, base });
  if (error) throw new Error(`gravar plano: ${error.message}`);
  return { itens: itens.length };
}
