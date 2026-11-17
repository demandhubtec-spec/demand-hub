/**
 * WhatsApp das SDRs pelo portal (Ajustes > WhatsApp das SDRs). Só o perfil "dono".
 *
 *   POST { acao: "status" }                        → { sdrs: [{ agente, existe, conectado, logado, numero, nome }] }
 *   POST { acao: "qr", agente }                    → { conectado } ou { qrcode, codigo }  (o portal chama de novo a cada poucos segundos)
 *   POST { acao: "criar", agente: "marina", chave_global? } → cria a instância da Marina no Evolution GO e já liga o webhook
 *   POST { acao: "reconectar", agente }            → tenta reconectar com a sessão salva
 *   POST { acao: "desconectar", agente }           → desloga o WhatsApp do número (para ler outro QR)
 *
 * A chave geral do Evolution (para criar instância) vem da variável EVOLUTION_GLOBAL_KEY ou do campo
 * chave_global, usado uma vez e nunca guardado. O token da instância criada fica em wa_instancias.
 */
import { randomBytes } from "node:crypto";
import { db } from "@/src/lib/db.ts";
import { env } from "@/src/lib/env.ts";
import { instanciaDaSdr, limparCacheInstancias } from "@/src/lib/instancias.ts";
import { type Sdr, nomeDaSdr, SDRS, sdrValida } from "@/src/lib/sdrs.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const ORIGENS = ["https://portal.demandhub.com.br", "https://demand-hub-tau.vercel.app", "http://localhost:5173"];
function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

async function evo(path: string, method: "GET" | "POST" | "DELETE", token: string, body?: unknown) {
  const r = await fetch(`${env.evolutionUrl}${path}`, {
    method,
    headers: { apikey: token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  const texto = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    /* resposta sem JSON */
  }
  return { ok: r.ok, status: r.status, json, texto: texto.slice(0, 300) };
}

const dados = (j: Record<string, unknown>) => ((j.data ?? j) as Record<string, unknown>) ?? {};
const pega = (o: Record<string, unknown>, ...k: string[]) => k.map((x) => o[x]).find((v) => v !== undefined && v !== null);

/** Status de uma instância: conectado e logado, e o número quando o Evolution informa. */
async function statusDe(token: string) {
  try {
    const r = await evo("/instance/status", "GET", token);
    if (!r.ok) return { conectado: false, logado: false, erro: `Evolution respondeu ${r.status}` };
    const d = dados(r.json);
    const jid = String(pega(d, "myJid", "MyJid", "jid", "Jid") ?? "");
    return {
      conectado: pega(d, "connected", "Connected") === true,
      logado: pega(d, "loggedIn", "LoggedIn") === true,
      numero: jid ? jid.split("@")[0].split(":")[0] : null,
      perfil: (pega(d, "name", "Name", "pushName") as string | undefined) ?? null,
    };
  } catch (e) {
    return { conectado: false, logado: false, erro: `sem resposta do Evolution (${String((e as Error)?.message ?? e).slice(0, 80)})` };
  }
}

/** Liga o webhook da IA na instância (mesmo endereço da Gabi; o webhook sabe de qual número veio). */
function webhookUrl() {
  return `${env.appUrl}/api/webhooks/evolution?secret=${encodeURIComponent(env.webhookSecret)}`;
}
async function conectar(token: string) {
  return evo("/instance/connect", "POST", token, { webhookUrl: webhookUrl(), subscribe: ["MESSAGE"], immediate: true });
}

export async function POST(req: Request) {
  const h = cors(req);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db().auth.getUser(jwt);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
  if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as { acao?: string; agente?: string; chave_global?: string };
  const agente: Sdr = sdrValida(body.agente);
  limparCacheInstancias();
  const inst = await instanciaDaSdr(agente);
  const token = inst?.token ?? null;

  if (body.acao === "status") {
    const sdrs = [];
    for (const s of SDRS) {
      const i = await instanciaDaSdr(s);
      if (!i?.token) {
        sdrs.push({ agente: s, nome: nomeDaSdr(s), existe: false, conectado: false, logado: false, numero: null });
        continue;
      }
      const st = await statusDe(i.token);
      if (st.numero && st.numero !== i.numero) await db().from("wa_instancias").update({ numero: st.numero, atualizado_em: new Date().toISOString() }).eq("agente", s);
      sdrs.push({ agente: s, nome: nomeDaSdr(s), instancia: i.nome, existe: true, ...st, numero: st.numero ?? i.numero });
    }
    return json({ sdrs });
  }

  if (body.acao === "criar") {
    if (agente === "gabi") return json({ error: "a instância da Gabi já existe (variáveis da Vercel)" }, 400);
    if (token) return json({ ok: true, ja_existia: true });
    const chave = (body.chave_global ?? "").trim() || process.env.EVOLUTION_GLOBAL_KEY || "";
    if (!chave) return json({ error: "precisa da chave geral do Evolution (GLOBAL_API_KEY do servidor) para criar o número" }, 400);
    const nome = `demandia-${agente}`;
    const novoToken = randomBytes(24).toString("hex");
    const r = await evo("/instance/create", "POST", chave, { name: nome, token: novoToken });
    if (!r.ok) return json({ error: `o Evolution não criou a instância (${r.status}): ${r.texto}` }, 400);
    const { error } = await db().from("wa_instancias").upsert({ agente, nome, token: novoToken, atualizado_em: new Date().toISOString() });
    if (error) return json({ error: `instância criada, mas não salvou no banco: ${error.message}. Rode a migration 0035.` }, 500);
    limparCacheInstancias();
    const c = await conectar(novoToken);
    return json({ ok: true, criada: nome, conectando: c.ok });
  }

  if (!token) return json({ error: `a ${nomeDaSdr(agente)} ainda não tem número criado` }, 400);

  if (body.acao === "qr") {
    const st = await statusDe(token);
    if (st.conectado && st.logado) return json({ conectado: true, numero: st.numero ?? null });
    // Começa (ou retoma) a conexão e pede o QR. Logo depois do connect o QR pode demorar uns segundos.
    if (!st.conectado) await conectar(token);
    for (let i = 0; i < 4; i++) {
      const q = await evo("/instance/qr", "GET", token);
      const d = dados(q.json);
      const qrcode = String(pega(d, "qrcode", "Qrcode", "QRCode", "base64") ?? "");
      const codigo = String(pega(d, "code", "Code") ?? "");
      if (qrcode || codigo) return json({ conectado: false, qrcode: qrcode || null, codigo: codigo || null });
      await new Promise((r) => setTimeout(r, 2500));
    }
    return json({ conectado: false, qrcode: null, aviso: "o QR ainda não ficou pronto; tente de novo em alguns segundos" });
  }

  if (body.acao === "reconectar") {
    const r = await evo("/instance/reconnect", "POST", token);
    return json({ ok: r.ok, detalhe: r.ok ? undefined : r.texto });
  }

  if (body.acao === "desconectar") {
    let r = await evo("/instance/logout", "DELETE", token);
    if (!r.ok && (r.status === 404 || r.status === 405)) r = await evo("/instance/logout", "POST", token);
    return json({ ok: r.ok, detalhe: r.ok ? undefined : r.texto });
  }

  return json({ error: "ação desconhecida" }, 400);
}
