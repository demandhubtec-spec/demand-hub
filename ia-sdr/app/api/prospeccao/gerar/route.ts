/**
 * Prospecção ativa · gera a sequência de cada lead (diagnóstico do perfil no Google + IA):
 * os 6 toques da cadência (WhatsApp e e-mail), escritos pela Ana.
 * Chamado pela aba "Aprovação" do portal com o login do usuário (só perfil "dono").
 *
 *   POST { place_ids?: string[], refazer?: boolean }
 *   - sem place_ids: pega os próximos leads da fila que ainda não têm mensagem (lotes de 8)
 *   → { gerados, restantes, erros }
 *
 * A sequência fica como "rascunho" até o Kelvin aprovar. O robô só envia as aprovadas.
 */
import { db } from "@/src/lib/db.ts";
import { callLLM } from "@/src/lib/llm.ts";
import {
  diagnosticar,
  montarSequencia,
  problemasDaSequencia,
  promptSequencia,
  type Concorrente,
  type LeadPerfil,
  type Toque,
} from "@/src/lib/diagnostico-perfil.ts";

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

const CAMPOS =
  "place_id,empresa,nicho,cidade,decisor,avaliacoes,nota,site,instagram,fotos,tem_descricao,tem_horario,responde_avaliacoes,termo_busca,posicao_busca,total_busca,tentativa";
const LOTE = 6;

/** Pede a sequência à IA; se ainda vier com cara de IA, pede uma nova versão uma vez. */
async function escreverSequencia(lead: LeadPerfil & { tentativa?: number | null }, diag: ReturnType<typeof diagnosticar>): Promise<Toque[]> {
  const system = promptSequencia(lead, diag);
  const pedir = async (extra = "") => {
    const res = await callLLM({
      system,
      messages: [{ role: "user", content: `Escreva a sequência.${extra}` }],
      maxTokens: 6000,
      json: true,
    });
    return montarSequencia(res.message.content ?? "");
  };
  const seq = await pedir();
  const problemas = problemasDaSequencia(seq);
  if (!problemas.length) return seq;
  return pedir(` Na versão anterior havia estes problemas, corrija: ${problemas.join("; ")}.`).catch(() => seq);
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function POST(req: Request) {
  const h = cors(req);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });

  // Só perfil "dono" do portal
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db().auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
  if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as { place_ids?: string[] };
  let q = db().from("outreach_leads").select(CAMPOS);
  if (body.place_ids?.length) q = q.in("place_id", body.place_ids.slice(0, LOTE));
  else q = q.eq("wa_status", "pendente").eq("msg_status", "sem").order("prioridade").order("created_at").limit(LOTE);
  const { data: leads, error } = await q;
  if (error) return json({ error: error.message }, 500);

  let gerados = 0;
  const erros: string[] = [];
  await Promise.all(
    ((leads ?? []) as (LeadPerfil & { tentativa?: number | null })[]).map(async (lead) => {
      try {
        await db().from("outreach_leads").update({ msg_status: "gerando" }).eq("place_id", lead.place_id);
        const { data: conc } = await db()
          .from("outreach_leads")
          .select("place_id,empresa,avaliacoes,nota")
          .eq("nicho", lead.nicho ?? "")
          .eq("cidade", lead.cidade ?? "");
        const diag = diagnosticar(lead, (conc ?? []) as Concorrente[]);
        const seq = await escreverSequencia(lead, diag);
        await db()
          .from("outreach_leads")
          .update({
            diagnostico: diag,
            sequencia: seq,
            msg_rascunho: seq[0].texto,
            msg_status: "rascunho",
            msg_gerada_em: new Date().toISOString(),
            msg_aprovada_em: null,
          })
          .eq("place_id", lead.place_id);
        gerados++;
      } catch (e) {
        erros.push(`${lead.empresa}: ${String(e).slice(0, 200)}`);
        await db().from("outreach_leads").update({ msg_status: "sem" }).eq("place_id", lead.place_id);
      }
    }),
  );

  const { count } = await db()
    .from("outreach_leads")
    .select("place_id", { count: "exact", head: true })
    .eq("wa_status", "pendente")
    .eq("msg_status", "sem");
  return json({ gerados, restantes: count ?? 0, erros });
}
