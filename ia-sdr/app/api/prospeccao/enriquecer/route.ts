/**
 * Prospecção ativa · procura e-mail e Instagram no site das empresas que ainda não têm (só perfil "dono").
 *   POST {}  → { verificados, emails, instagrams }
 */
import { db } from "@/src/lib/db.ts";
import { contatosDoSite } from "@/src/lib/enriquecer.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  const { data: leads, error } = await db()
    .from("outreach_leads")
    .select("place_id,empresa,site,email,instagram")
    .not("site", "is", null)
    .or("email.is.null,instagram.is.null")
    .in("wa_status", ["pendente", "enviado", "respondeu", "sem_whatsapp"])
    .limit(60);
  if (error) return json({ error: error.message }, 500);

  let emails = 0, instagrams = 0;
  const lista = leads ?? [];
  for (let i = 0; i < lista.length; i += 8) {
    await Promise.all(
      lista.slice(i, i + 8).map(async (l) => {
        const c = await contatosDoSite(l.site);
        const patch: Record<string, string> = {};
        if (!l.email && c.email) { patch.email = c.email; emails++; }
        if (!l.instagram && c.instagram) { patch.instagram = c.instagram; instagrams++; }
        if (Object.keys(patch).length) await db().from("outreach_leads").update(patch).eq("place_id", l.place_id);
      }),
    );
  }
  await db().from("outreach_log").insert({ channel: "portal", event: "config", detail: { msg: `Busca nos sites: ${lista.length} empresas, ${emails} e-mails e ${instagrams} Instagram encontrados` } });
  return json({ ok: true, verificados: lista.length, emails, instagrams });
}
