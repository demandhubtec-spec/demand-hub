/**
 * Prospecção ativa · extras de um lead, pedidos pelo portal (só perfil "dono").
 *
 *   POST { place_id, tipo: "direct" }  → escreve (ou reescreve) o Direct do Instagram
 *   POST { place_id, tipo: "site" }    → monta (ou refaz) a prévia de site grátis
 *   → { ok, dm_instagram?, site_preview?, link? }
 */
import { db } from "@/src/lib/db.ts";
import { diagnosticar, type Concorrente, type LeadPerfil } from "@/src/lib/diagnostico-perfil.ts";
import { gerarDirect, gerarSite, linkPrevia, type SitePreview } from "@/src/lib/extras.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

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

const CAMPOS =
  "place_id,empresa,nicho,cidade,decisor,avaliacoes,nota,site,instagram,fotos,tem_descricao,tem_horario,responde_avaliacoes,termo_busca,posicao_busca,total_busca,endereco,diagnostico,site_preview";

export async function POST(req: Request) {
  const h = cors(req);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db().auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
  if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as { place_id?: string; tipo?: string };
  if (!body.place_id || !["direct", "site"].includes(body.tipo ?? "")) return json({ error: "informe place_id e tipo" }, 400);

  const { data: lead } = await db().from("outreach_leads").select(CAMPOS).eq("place_id", body.place_id).maybeSingle();
  if (!lead) return json({ error: "lead não encontrado" }, 404);
  const l = lead as LeadPerfil & { endereco: string | null; diagnostico: unknown; site_preview: SitePreview | null };

  try {
    if (body.tipo === "direct") {
      const { data: conc } = await db().from("outreach_leads").select("place_id,empresa,avaliacoes,nota").eq("nicho", l.nicho ?? "").eq("cidade", l.cidade ?? "");
      const diag = diagnosticar(l, (conc ?? []) as Concorrente[]);
      const dm = await gerarDirect(l, diag);
      await db().from("outreach_leads").update({ dm_instagram: dm, dm_instagram_enviado_em: null }).eq("place_id", l.place_id);
      return json({ ok: true, dm_instagram: dm });
    }
    const site = await gerarSite(l, l.site_preview?.token);
    await db().from("outreach_leads").update({ site_preview: site, site_preview_em: site.gerado_em }).eq("place_id", l.place_id);
    return json({ ok: true, site_preview: site, link: linkPrevia(site.token) });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500);
  }
}
