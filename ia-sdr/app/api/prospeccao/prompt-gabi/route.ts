/**
 * Prompt System da Gabi pelo portal (Configurações > Prompt System da Gabi). Só o perfil "dono".
 *
 *   POST { acao: "padrao" }                 → { secoes, variaveis }   (o texto original, para restaurar)
 *   POST { acao: "previa", secoes, telefone? } → { prompt, empresa }  (como a Gabi vai ler, com um lead real)
 *
 * Salvar é direto no banco pelo portal (comercial_playbook, id "prompt_gabi"); a Gabi lê em até 1 minuto.
 */
import { db } from "@/src/lib/db.ts";
import { carregarPlaybook } from "@/src/lib/playbook.ts";
import { PROMPT_GABI_PADRAO, VARIAVEIS_PROMPT_GABI, promptGabiEmTexto } from "@/src/lib/prompt-gabi.ts";
import { prospeccaoDoTelefone, varsPromptGabi, type Prospeccao } from "@/src/lib/prospeccao.ts";
import type { SecaoPlaybook } from "@/src/lib/playbook.ts";

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  const h = cors(req);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db().auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
  if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as { acao?: string; secoes?: SecaoPlaybook[]; telefone?: string };

  if (body.acao === "padrao") return json({ secoes: PROMPT_GABI_PADRAO, variaveis: VARIAVEIS_PROMPT_GABI });

  if (body.acao === "previa") {
    await carregarPlaybook();
    // Um lead real da prospecção: o telefone pedido ou o último que recebeu mensagem
    let p: Prospeccao | null = body.telefone ? await prospeccaoDoTelefone(body.telefone) : null;
    if (!p) {
      const { data } = await db()
        .from("outreach_leads")
        .select("empresa,nicho,cidade,decisor,cargo_decisor,socios,site,site_preview,wa_sent_at")
        .not("wa_sent_at", "is", null)
        .order("wa_sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      p = (data as Prospeccao | null) ?? null;
    }
    const secoes = (body.secoes ?? []).filter((s) => s && typeof s.titulo === "string" && typeof s.texto === "string");
    const vars = p ? varsPromptGabi(p) : {};
    return json({ prompt: promptGabiEmTexto(secoes.length ? secoes : PROMPT_GABI_PADRAO, vars), empresa: p?.empresa ?? null });
  }

  return json({ error: "ação inválida" }, 400);
}
