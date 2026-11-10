/**
 * Kairogen (app.kairogen.ai) ligado no portal pelo MCP oficial deles (https://mcp.kairogen.ai/mcp).
 *
 * Conexão sem chave: o portal pede um código (device flow do OAuth), o Kelvin abre o link do Kairogen,
 * confere o código e autoriza. Os tokens ficam só no servidor, na tabela ig_config (sem acesso pelo portal),
 * e se renovam sozinhos. Os créditos saem da carteira do Kairogen dele.
 *
 * O que o portal vê (status, créditos, ferramentas e modelos liberados, modelo escolhido) fica em "kairogen_info".
 */
import { db } from "./db.ts";

const SERVIDOR = "https://api.kairogen.ai";
const MCP = "https://mcp.kairogen.ai/mcp";
const RECURSO = "https://mcp.kairogen.ai";
const ESCOPO = "kairogen:read kairogen:generate";
const DEVICE = "urn:ietf:params:oauth:grant-type:device_code";

type Tokens = { access: string; refresh: string | null; expira: number };
type Pendente = { device_code: string; intervalo: number; expira: number };
export type Ferramenta = { name: string; description?: string; inputSchema?: { properties?: Record<string, Schema>; required?: string[] } };
type Schema = { type?: string; enum?: unknown[]; default?: unknown; description?: string };
export type InfoKairogen = {
  conectado: boolean;
  conectado_em?: string;
  creditos?: string | null;
  ferramentas?: { nome: string; descricao: string }[];
  modelos_imagem?: string[];
  modelo_imagem?: string | null;
  erro?: string | null;
};

/* ---------------- guardar no servidor (ig_config: só a service role lê) ---------------- */

async function ler<T>(chave: string): Promise<T | null> {
  const { data } = await db().from("ig_config").select("valor").eq("chave", chave).maybeSingle();
  const v = (data as { valor?: string } | null)?.valor;
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}
async function gravar(chave: string, valor: unknown) {
  const { error } = await db().from("ig_config").upsert({ chave, valor: JSON.stringify(valor) }, { onConflict: "chave" });
  if (error) throw new Error(`Kairogen: não salvou ${chave} (${error.message})`);
}
async function apagar(chave: string) {
  await db().from("ig_config").delete().eq("chave", chave);
}

export async function infoKairogen(): Promise<InfoKairogen> {
  return (await ler<InfoKairogen>("kairogen_info")) ?? { conectado: false };
}
async function atualizarInfo(patch: Partial<InfoKairogen>) {
  await gravar("kairogen_info", { ...(await infoKairogen()), ...patch });
}

/* ---------------- OAuth (device flow) ---------------- */

async function clienteId(): Promise<string> {
  const salvo = await ler<string>("kairogen_client_id");
  if (salvo) return salvo;
  const r = await fetch(`${SERVIDOR}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "DemandHub Portal", grant_types: [DEVICE, "refresh_token"], response_types: [], token_endpoint_auth_method: "none", scope: ESCOPO }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { client_id?: string; error_description?: string };
  if (!r.ok || !j.client_id) throw new Error(`Kairogen não registrou o portal (${r.status} ${j.error_description ?? ""})`);
  await gravar("kairogen_client_id", j.client_id);
  return j.client_id;
}

async function token(corpo: Record<string, string>) {
  const r = await fetch(`${SERVIDOR}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...corpo, client_id: await clienteId(), resource: RECURSO }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  return { ok: r.ok && !!j.access_token, j };
}

/** Passo 1: pede o código. O portal mostra o código e o link para o Kelvin autorizar no Kairogen. */
export async function iniciarConexao(): Promise<{ codigo: string; link: string; expira_em: number }> {
  const r = await fetch(`${SERVIDOR}/oauth/device_authorization`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: await clienteId(), scope: ESCOPO, resource: RECURSO }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { device_code?: string; user_code?: string; verification_uri?: string; verification_uri_complete?: string; expires_in?: number; interval?: number; error_description?: string };
  if (!r.ok || !j.device_code || !j.user_code) throw new Error(`Kairogen não gerou o código (${r.status} ${j.error_description ?? ""})`);
  const expira = Date.now() + (j.expires_in ?? 600) * 1000;
  await gravar("kairogen_pendente", { device_code: j.device_code, intervalo: j.interval ?? 5, expira } satisfies Pendente);
  return { codigo: j.user_code, link: j.verification_uri_complete || j.verification_uri || "https://app.kairogen.ai/device", expira_em: expira };
}

/** Passo 2: o portal pergunta de tempos em tempos se o Kelvin já autorizou. */
export async function verificarConexao(): Promise<{ estado: "conectado" | "aguardando" | "expirado" | "negado"; info?: InfoKairogen }> {
  const p = await ler<Pendente>("kairogen_pendente");
  if (!p) return (await infoKairogen()).conectado ? { estado: "conectado", info: await infoKairogen() } : { estado: "expirado" };
  if (Date.now() > p.expira) {
    await apagar("kairogen_pendente");
    return { estado: "expirado" };
  }
  const { ok, j } = await token({ grant_type: DEVICE, device_code: p.device_code });
  if (!ok) {
    if (j.error === "authorization_pending" || j.error === "slow_down") return { estado: "aguardando" };
    await apagar("kairogen_pendente");
    return { estado: j.error === "access_denied" ? "negado" : "expirado" };
  }
  await gravar("kairogen_tokens", { access: j.access_token!, refresh: j.refresh_token ?? null, expira: Date.now() + (j.expires_in ?? 3600) * 1000 } satisfies Tokens);
  await apagar("kairogen_pendente");
  await atualizarInfo({ conectado: true, conectado_em: new Date().toISOString(), erro: null });
  return { estado: "conectado", info: await sincronizar() };
}

export async function desconectar() {
  const t = await ler<Tokens>("kairogen_tokens");
  if (t?.refresh) {
    await fetch(`${SERVIDOR}/oauth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: t.refresh, token_type_hint: "refresh_token", client_id: await clienteId() }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
  }
  await apagar("kairogen_tokens");
  await apagar("kairogen_pendente");
  await gravar("kairogen_info", { conectado: false } satisfies InfoKairogen);
}

/** Token válido (renova sozinho). Se outro processo já renovou, usa o dele. */
async function acesso(): Promise<string> {
  const t = await ler<Tokens>("kairogen_tokens");
  if (!t) throw new Error("Kairogen não conectado");
  if (t.expira - Date.now() > 60_000) return t.access;
  if (!t.refresh) throw new Error("Kairogen: conexão venceu, conecte de novo no portal");
  const { ok, j } = await token({ grant_type: "refresh_token", refresh_token: t.refresh });
  if (!ok) {
    const outro = await ler<Tokens>("kairogen_tokens");
    if (outro && outro.access !== t.access && outro.expira - Date.now() > 60_000) return outro.access;
    await atualizarInfo({ conectado: false, erro: "A conexão com o Kairogen venceu. Conecte de novo." });
    throw new Error(`Kairogen: não renovou a conexão (${j.error ?? ""})`);
  }
  await gravar("kairogen_tokens", { access: j.access_token!, refresh: j.refresh_token ?? t.refresh, expira: Date.now() + (j.expires_in ?? 3600) * 1000 } satisfies Tokens);
  return j.access_token!;
}

/* ---------------- MCP (HTTP com resposta em JSON ou em SSE) ---------------- */

let sessao: { id: string | null; token: string } | null = null;
let seq = 1;

async function rpc(metodo: string, params: unknown, ms: number, notificacao = false): Promise<unknown> {
  const tk = await acesso();
  if (!sessao || sessao.token !== tk) {
    sessao = { id: null, token: tk };
    if (metodo !== "initialize") {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "demandhub-portal", version: "1.0" } }, 30_000);
      await rpc("notifications/initialized", {}, 15_000, true);
    }
  }
  const id = seq++;
  const h: Record<string, string> = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" };
  if (sessao.id) h["Mcp-Session-Id"] = sessao.id;
  const r = await fetch(MCP, { method: "POST", headers: h, body: JSON.stringify(notificacao ? { jsonrpc: "2.0", method: metodo, params } : { jsonrpc: "2.0", id, method: metodo, params }), signal: AbortSignal.timeout(ms) });
  const sid = r.headers.get("mcp-session-id");
  if (sid) sessao.id = sid;
  if (notificacao) return null;
  if (r.status === 401 || r.status === 404) sessao = null;
  if (!r.ok) throw new Error(`Kairogen MCP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const tipo = r.headers.get("content-type") ?? "";
  let msg: { id?: number; result?: unknown; error?: { message?: string } } | null = null;
  if (tipo.includes("text/event-stream")) {
    const texto = await r.text();
    for (const linha of texto.split("\n")) {
      if (!linha.startsWith("data:")) continue;
      try {
        const m = JSON.parse(linha.slice(5).trim());
        if (m?.id === id) msg = m;
      } catch {
        /* evento de progresso */
      }
    }
  } else msg = (await r.json()) as typeof msg;
  if (!msg) throw new Error(`Kairogen MCP: sem resposta para ${metodo}`);
  if (msg.error) throw new Error(`Kairogen: ${msg.error.message ?? "erro"}`);
  return msg.result;
}

type Resultado = { content?: { type: string; text?: string; data?: string; mimeType?: string; uri?: string }[]; structuredContent?: unknown; isError?: boolean };

export async function chamar(ferramenta: string, args: Record<string, unknown>, ms = 600_000): Promise<Resultado> {
  const r = (await rpc("tools/call", { name: ferramenta, arguments: args }, ms)) as Resultado;
  if (r?.isError) throw new Error(`Kairogen ${ferramenta}: ${textoDe(r).slice(0, 300)}`);
  return r;
}

const textoDe = (r: Resultado) => (r.content ?? []).map((c) => c.text ?? "").join("\n") + (r.structuredContent ? `\n${JSON.stringify(r.structuredContent)}` : "");

/** Lê ferramentas, modelos de imagem e créditos e guarda para o portal mostrar. */
export async function sincronizar(): Promise<InfoKairogen> {
  const lista = ((await rpc("tools/list", {}, 30_000)) as { tools?: Ferramenta[] })?.tools ?? [];
  await gravar("kairogen_ferramentas", lista);
  let creditos: string | null = null;
  try {
    creditos = textoDe(await chamar("get_credits", {}, 30_000)).slice(0, 300).trim() || null;
  } catch {
    /* sem permissão de leitura de créditos */
  }
  let modelos: string[] = [];
  try {
    modelos = modelosDeImagem(await chamar("list_models", {}, 60_000));
  } catch {
    /* segue sem a lista */
  }
  const enumModelo = esquema(lista, "generate_image")?.properties?.model?.enum;
  if (!modelos.length && Array.isArray(enumModelo)) modelos = enumModelo.map(String);
  const info = await infoKairogen();
  const novo: InfoKairogen = {
    ...info,
    conectado: true,
    creditos,
    ferramentas: lista.map((f) => ({ nome: f.name, descricao: (f.description ?? "").slice(0, 200) })),
    modelos_imagem: modelos.slice(0, 40),
    modelo_imagem: info.modelo_imagem && modelos.includes(info.modelo_imagem) ? info.modelo_imagem : escolherPadrao(modelos),
    erro: null,
  };
  await gravar("kairogen_info", novo);
  return novo;
}

export async function escolherModelo(modelo: string) {
  await atualizarInfo({ modelo_imagem: modelo.trim() || null });
  return infoKairogen();
}

/** Ids de modelos de imagem na resposta do list_models (JSON ou texto). */
export function modelosDeImagem(r: Resultado): string[] {
  const ids = new Set<string>();
  const visitar = (x: unknown, tipoPai = "") => {
    if (Array.isArray(x)) return x.forEach((y) => visitar(y, tipoPai));
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    const id = (o.id ?? o.slug ?? o.model ?? o.model_id ?? o.name) as unknown;
    const tipo = String(o.type ?? o.category ?? o.kind ?? o.modality ?? tipoPai).toLowerCase();
    if (typeof id === "string" && /image|imagem/.test(tipo) && !/upscale/.test(tipo)) ids.add(id);
    for (const [k, v] of Object.entries(o)) if (typeof v === "object") visitar(v, /image|imagem/i.test(k) ? "image" : tipo);
  };
  const blocos = [r.structuredContent, ...(r.content ?? []).map((c) => c.text)];
  for (const b of blocos) {
    if (!b) continue;
    if (typeof b === "string") {
      try {
        visitar(JSON.parse(b));
      } catch {
        /* texto livre: não dá para separar com segurança */
      }
    } else visitar(b);
  }
  return [...ids];
}

export function escolherPadrao(modelos: string[]): string | null {
  for (const p of [/nano.?banana.?pro/i, /gpt.?image.?2/i, /seedream.?4\.?5/i, /flux.?2.?pro/i]) {
    const m = modelos.find((x) => p.test(x));
    if (m) return m;
  }
  return modelos[0] ?? null;
}

function esquema(lista: Ferramenta[], nome: string) {
  return lista.find((f) => f.name === nome)?.inputSchema;
}

/**
 * Argumentos do generate_image montados pelo esquema que o Kairogen publica (os nomes podem mudar):
 * prompt, modelo, proporção (a mais próxima da pedida) e 1 imagem. O resto vai no padrão do esquema.
 */
export function argsDeImagem(sch: Ferramenta["inputSchema"], prompt: string, modelo: string | null, proporcao: "2:3" | "3:2" | "9:16"): Record<string, unknown> {
  const props = sch?.properties ?? {};
  const nomes = Object.keys(props);
  const achar = (re: RegExp) => nomes.find((n) => re.test(n));
  const a: Record<string, unknown> = {};
  a[achar(/^prompt$/i) ?? achar(/prompt/i) ?? "prompt"] = prompt;
  const kModelo = achar(/^model(_id)?$/i) ?? achar(/model/i);
  if (kModelo && modelo) a[kModelo] = modelo;
  const kProp = achar(/aspect|ratio|proporc/i);
  if (kProp) {
    const opcoes = (props[kProp].enum ?? []).map(String);
    a[kProp] = opcoes.length ? maisProxima(proporcao, opcoes) : proporcao;
  }
  const kQtd = achar(/^(n|num|num_images|count|quantity|quantidade|images)$/i);
  if (kQtd) a[kQtd] = 1;
  for (const r of sch?.required ?? []) {
    if (a[r] !== undefined) continue;
    const s = props[r];
    if (s?.default !== undefined) a[r] = s.default;
    else if (s?.enum?.length) a[r] = s.enum[0];
  }
  return a;
}

function maisProxima(alvo: string, opcoes: string[]): string {
  const num = (s: string) => {
    const m = s.match(/(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) / Number(m[2]) : NaN;
  };
  const v = num(alvo);
  let melhor = opcoes[0];
  let dif = Infinity;
  for (const o of opcoes) {
    const d = Math.abs(Math.log(num(o) / v));
    if (Number.isFinite(d) && d < dif) {
      dif = d;
      melhor = o;
    }
  }
  return melhor;
}

/** Links de imagem dentro do resultado (texto, JSON ou link de recurso). */
export function linksDeImagem(r: Resultado): string[] {
  const out: string[] = [];
  for (const c of r.content ?? []) if (c.type === "resource_link" && c.uri) out.push(c.uri);
  const texto = textoDe(r);
  for (const m of texto.matchAll(/https?:\/\/[^\s"'<>)\]\\]+/g)) out.push(m[0]);
  const bons = out.filter((u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u) || /output|result|cdn|storage|media|file/i.test(u)).filter((u) => !/kairogen\.ai\/(docs|mcp|pricing)/i.test(u));
  return [...new Set(bons.length ? bons : [])];
}

/** Gera uma foto no Kairogen e devolve como data URL, igual às fotos da OpenAI. */
export async function gerarImagemKairogen(prompt: string, proporcao: "2:3" | "3:2" | "9:16"): Promise<string> {
  const info = await infoKairogen();
  if (!info.conectado) throw new Error("Kairogen não conectado");
  const lista = (await ler<Ferramenta[]>("kairogen_ferramentas")) ?? [];
  let r = await chamar("generate_image", argsDeImagem(esquema(lista, "generate_image"), prompt, info.modelo_imagem ?? null, proporcao));
  const embutida = (r.content ?? []).find((c) => c.type === "image" && c.data);
  if (embutida) return `data:${embutida.mimeType || "image/png"};base64,${embutida.data}`;
  let links = linksDeImagem(r);
  // Geração ainda em andamento: acompanha pelo get_generation
  const idGer = textoDe(r).match(/"?(?:generation_?id|id)"?\s*[:=]\s*"?([A-Za-z0-9_-]{8,})/)?.[1];
  for (let i = 0; !links.length && idGer && i < 40; i++) {
    await new Promise((ok) => setTimeout(ok, 6000));
    r = await chamar("get_generation", { [Object.keys(esquema(lista, "get_generation")?.properties ?? { generation_id: 1 })[0]]: idGer }, 60_000);
    links = linksDeImagem(r);
  }
  if (!links.length) throw new Error(`Kairogen não devolveu a imagem: ${textoDe(r).slice(0, 200)}`);
  const f = await fetch(links[0], { signal: AbortSignal.timeout(60_000) });
  if (!f.ok) throw new Error(`Kairogen: não baixou a imagem (${f.status})`);
  return `data:${f.headers.get("content-type") || "image/png"};base64,${Buffer.from(await f.arrayBuffer()).toString("base64")}`;
}
