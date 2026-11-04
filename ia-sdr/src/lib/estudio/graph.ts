/**
 * Estúdio · conversa com a Meta (Instagram Graph API) usando o token da página salvo em ig_config,
 * o mesmo cadastro do robô do Direct.
 *   - contaPublica: Business Discovery (dados públicos de outra conta profissional)
 *   - publicar: imagem única, carrossel ou Reels pelo fluxo container → media_publish
 */
import { db } from "../db.ts";

const VERSAO = process.env.GRAPH_VERSION || "v25.0";
const BASE = `https://graph.facebook.com/${VERSAO}`;

interface Credenciais {
  token: string;
  igId: string;
}

let cache: { c: Credenciais; em: number } | null = null;

async function credenciais(): Promise<Credenciais> {
  if (cache && Date.now() - cache.em < 5 * 60_000) return cache.c;
  const { data } = await db().from("ig_config").select("chave,valor").in("chave", ["page_token", "ig_account_id"]);
  const m = Object.fromEntries((data ?? []).map((r: { chave: string; valor: string }) => [r.chave, r.valor]));
  const token = process.env.META_SYSTEM_TOKEN || m.page_token;
  if (!token || !m.ig_account_id) throw new Error("Instagram não configurado (ig_config sem token ou conta)");
  cache = { c: { token, igId: m.ig_account_id }, em: Date.now() };
  return cache.c;
}

export class ErroMeta extends Error {
  constructor(public status: number, public corpo: unknown) {
    const e = (corpo as { error?: { message?: string; code?: number; error_subcode?: number } })?.error;
    super(`Meta ${status}: ${e?.message ?? JSON.stringify(corpo).slice(0, 200)}`);
  }
  /** Erro de permissão: o token não tem a permissão pedida (ex.: instagram_content_publish). */
  get semPermissao(): boolean {
    const e = (this.corpo as { error?: { code?: number } })?.error;
    return e?.code === 10 || e?.code === 200 || /permission/i.test(this.message);
  }
}

async function chamar<T>(metodo: "GET" | "POST", caminho: string, params: Record<string, string> = {}): Promise<T> {
  const { token } = await credenciais();
  const url = new URL(BASE + caminho);
  const corpo = new URLSearchParams({ ...params, access_token: token });
  let r: Response;
  if (metodo === "GET") {
    for (const [k, v] of corpo) url.searchParams.set(k, v);
    r = await fetch(url);
  } else {
    r = await fetch(url, { method: "POST", body: corpo });
  }
  const txt = await r.text();
  let json: unknown;
  try {
    json = JSON.parse(txt);
  } catch {
    json = txt;
  }
  if (!r.ok) throw new ErroMeta(r.status, json);
  return json as T;
}

export interface MidiaPublica {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  like_count?: number;
  comments_count?: number;
  view_count?: number;
  permalink?: string;
  timestamp?: string;
}

export interface ContaPublica {
  username: string;
  name?: string;
  followers_count?: number;
  media_count?: number;
  media?: { data: MidiaPublica[] };
}

/** Dados públicos de outra conta profissional (Business ou Creator) pelo @. */
export async function contaPublica(username: string, limite = 25): Promise<ContaPublica> {
  const { igId } = await credenciais();
  const u = username.replace(/^@/, "").trim().toLowerCase();
  const campos = `business_discovery.username(${u}){username,name,followers_count,media_count,media.limit(${limite}){id,caption,media_type,media_product_type,like_count,comments_count,view_count,permalink,timestamp}}`;
  const r = await chamar<{ business_discovery: ContaPublica }>("GET", `/${igId}`, { fields: campos });
  return r.business_discovery;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera o container ficar pronto (vídeo demora; imagem costuma ser na hora). */
async function aguardarContainer(id: string, maxMs: number): Promise<void> {
  const inicio = Date.now();
  for (;;) {
    const s = await chamar<{ status_code?: string; status?: string }>("GET", `/${id}`, { fields: "status_code,status" });
    if (!s.status_code || s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`container ${s.status_code}: ${s.status ?? ""}`);
    if (Date.now() - inicio > maxMs) throw new Error("container ainda processando (tente de novo no próximo ciclo)");
    await esperar(4000);
  }
}

export interface Publicado {
  id: string;
  link: string | null;
}

/** Publica imagem única, carrossel (2 a 10 imagens) ou Reels (vídeo 9:16). */
export async function publicar(p: { imagens?: string[]; video?: string; capa?: string; legenda: string }): Promise<Publicado> {
  const { igId } = await credenciais();
  let criacao: string;
  if (p.video) {
    const c = await chamar<{ id: string }>("POST", `/${igId}/media`, {
      media_type: "REELS",
      video_url: p.video,
      caption: p.legenda,
      share_to_feed: "true",
      ...(p.capa ? { cover_url: p.capa } : {}),
    });
    await aguardarContainer(c.id, 240_000);
    criacao = c.id;
  } else if (p.imagens && p.imagens.length > 1) {
    const filhos: string[] = [];
    for (const url of p.imagens.slice(0, 10)) {
      const f = await chamar<{ id: string }>("POST", `/${igId}/media`, { image_url: url, is_carousel_item: "true" });
      filhos.push(f.id);
    }
    for (const f of filhos) await aguardarContainer(f, 60_000);
    const c = await chamar<{ id: string }>("POST", `/${igId}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption: p.legenda });
    await aguardarContainer(c.id, 60_000);
    criacao = c.id;
  } else if (p.imagens?.length === 1) {
    const c = await chamar<{ id: string }>("POST", `/${igId}/media`, { image_url: p.imagens[0], caption: p.legenda });
    await aguardarContainer(c.id, 60_000);
    criacao = c.id;
  } else {
    throw new Error("nada para publicar (sem imagens nem vídeo)");
  }
  const pub = await chamar<{ id: string }>("POST", `/${igId}/media_publish`, { creation_id: criacao });
  const info = await chamar<{ permalink?: string }>("GET", `/${pub.id}`, { fields: "permalink" }).catch(() => ({ permalink: undefined }));
  return { id: pub.id, link: info.permalink ?? null };
}
