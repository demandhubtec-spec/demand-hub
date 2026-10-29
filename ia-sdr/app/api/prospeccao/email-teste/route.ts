/**
 * Prospecção ativa · manda um e-mail da sequência de um lead para a própria caixa do Gmail conectado,
 * para o Kelvin ver como chega (formato, assunto, assinatura) antes de aprovar. Só perfil "dono".
 *
 *   POST { place_id, n }  → { ok, para }
 */
import { db } from "@/src/lib/db.ts";
import { comRodape, gmailSend } from "@/src/lib/outreach-email.ts";

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

  const body = (await req.json().catch(() => ({}))) as { place_id?: string; n?: number; assunto?: string; texto?: string };
  const { data: lead } = await db().from("outreach_leads").select("place_id, empresa, email, sequencia").eq("place_id", body.place_id ?? "").maybeSingle();
  if (!lead) return json({ error: "lead não encontrado" }, 404);
  const toque = ((lead.sequencia ?? []) as { canal: string; assunto?: string; texto: string }[])[body.n ?? -1];
  // Se estiver editando, testa o texto da tela (ainda não salvo)
  const assunto = body.assunto ?? toque?.assunto;
  const texto = body.texto ?? toque?.texto;
  if (!texto) return json({ error: "esse toque não tem texto" }, 400);

  const { data: g } = await db().from("sdr_integrations").select("value").eq("key", "gmail").maybeSingle();
  const eu = (g?.value as { email?: string } | null)?.email;
  if (!eu) return json({ error: "conecte o Gmail em Controles" }, 400);

  try {
    await gmailSend(eu, `[TESTE para ${lead.email ?? "empresa sem e-mail"}] ${assunto ?? lead.empresa}`, comRodape(texto), eu);
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500);
  }
  await db().from("outreach_log").insert({ place_id: lead.place_id, channel: "email", event: "sent_test", detail: { to: eu, subject: assunto, msg: `Teste do e-mail de ${lead.empresa} enviado para ${eu}` } });
  return json({ ok: true, para: eu });
}
