/**
 * SEO e orgânico · usado pelo portal (Marketing > SEO e orgânico, só o dono) e pelo relógio do Supabase.
 *
 *   POST { acao: "status" }                     → situação da conexão com o Google Search Console
 *   POST { acao: "conectar" }                   → { url } para autorizar o Search Console (conta demandhubtec@gmail.com)
 *   POST { acao: "sincronizar", dias? }         → puxa as buscas do Google agora
 *   POST { acao: "checar_ia", pergunta_id? }    → pergunta ao ChatGPT agora e registra se citou a DemandIA
 *   POST { acao: "plano" }                      → gera agora o plano da semana para subir no Google e nas IAs
 *   GET/POST com CRON_SECRET (relógio diário)   → sincroniza o Google todo dia; toda segunda checa as IAs e gera o plano
 */
import { db } from "@/src/lib/db.ts";
import { env } from "@/src/lib/env.ts";
import { authUrl, oauthState } from "@/src/lib/google.ts";
import { checarIAs, gerarPlano, sincronizarGSC, statusSearchConsole } from "@/src/lib/seo.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

const ORIGENS = ["https://portal.demandhub.com.br", "https://demand-hub-tau.vercel.app", "http://localhost:5173"];
function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

async function handler(req: Request) {
  const h = cors(req);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const relogio = !!token && token === env.cronSecret;
  if (!relogio) {
    const { data: u } = await db().auth.getUser(token);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
    if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);
  }

  const body = (req.method === "POST" ? await req.json().catch(() => ({})) : {}) as {
    acao?: string;
    dias?: number;
    pergunta_id?: string;
  };
  const acao = body.acao ?? (relogio ? "relogio" : "status");

  try {
    if (acao === "status") return json(await statusSearchConsole());
    if (acao === "conectar") return json({ url: authUrl(oauthState("searchconsole"), "searchconsole") });
    if (acao === "sincronizar") return json({ ok: true, ...(await sincronizarGSC(body.dias ? Math.min(480, Math.max(3, body.dias)) : undefined)) });
    if (acao === "checar_ia") return json({ ok: true, ...(await checarIAs(body.pergunta_id)) });
    if (acao === "plano") return json({ ok: true, ...(await gerarPlano()) });
    if (acao === "relogio") {
      const out: Record<string, unknown> = {};
      const st = await statusSearchConsole();
      if (st.conectado) {
        try {
          out.google = await sincronizarGSC();
        } catch (e) {
          out.google_erro = String((e as Error).message).slice(0, 300);
        }
      }
      // ChatGPT: uma vez por semana, na segunda (horário de Brasília)
      const semana = new Date(Date.now() - 3 * 3_600_000).getUTCDay();
      if (semana === 1) {
        out.ia = await checarIAs();
        try {
          out.plano = await gerarPlano();
        } catch (e) {
          out.plano_erro = String((e as Error).message).slice(0, 300);
        }
      }
      return json({ ok: true, ...out });
    }
    return json({ error: "ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 400) }, 500);
  }
}

export const GET = handler;
export const POST = handler;
export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}
