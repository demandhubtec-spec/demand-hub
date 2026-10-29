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
 * Junto, escreve o Direct do Instagram (envio manual) e, para quem não tem site próprio,
 * monta a prévia de site grátis que a Ana pode oferecer.
 */
import { db } from "@/src/lib/db.ts";
import { callLLM } from "@/src/lib/llm.ts";
import {
  diagnosticar,
  montarSequencia,
  problemasDaSequencia,
  promptRevisaoSequencia,
  promptSequencia,
  type Concorrente,
  type LeadPerfil,
  type Toque,
} from "@/src/lib/diagnostico-perfil.ts";
import { gerarDirect, gerarSite, semSiteProprio, type SitePreview } from "@/src/lib/extras.ts";

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
  "place_id,empresa,nicho,cidade,decisor,avaliacoes,nota,site,instagram,fotos,tem_descricao,tem_horario,responde_avaliacoes,termo_busca,posicao_busca,total_busca,tentativa,endereco,site_preview,toque_atual,sequencia,dm_instagram_enviado_em";
const LOTE = 5;

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
  const rascunho = await pedir();

  // 2ª etapa: revisor de copy (SPIN, gatilhos, sem repetição, sem cara de IA)
  const revisada = await callLLM({
    system: promptRevisaoSequencia(lead, diag, rascunho),
    messages: [{ role: "user", content: "Revise e devolva a versão final." }],
    maxTokens: 6000,
    json: true,
  })
    .then((r) => montarSequencia(r.message.content ?? ""))
    .catch(() => rascunho);

  const problemas = problemasDaSequencia(revisada);
  if (!problemas.length) return revisada;
  return pedir(` Na versão anterior havia estes problemas, corrija: ${problemas.join("; ")}.`).catch(() => revisada);
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

  const body = (await req.json().catch(() => ({}))) as { place_ids?: string[]; modo?: string; desde?: string };
  // modo "followups": reescreve só os toques que ainda não saíram de quem já está em cadência
  // (o que já foi enviado continua igual e a aprovação é mantida)
  const followups = body.modo === "followups";
  const desde = body.desde && !Number.isNaN(Date.parse(body.desde)) ? body.desde : new Date().toISOString();
  let q = db().from("outreach_leads").select(CAMPOS);
  if (followups) q = q.eq("cadencia", "ativa").eq("wa_status", "enviado").or(`msg_gerada_em.is.null,msg_gerada_em.lt.${desde}`).order("proximo_toque_em").limit(LOTE);
  else if (body.place_ids?.length) q = q.in("place_id", body.place_ids.slice(0, LOTE));
  else q = q.eq("wa_status", "pendente").eq("msg_status", "sem").order("prioridade").order("created_at").limit(LOTE);
  const { data: leads, error } = await q;
  if (error) return json({ error: error.message }, 500);

  let gerados = 0;
  const erros: string[] = [];
  await Promise.all(
    ((leads ?? []) as (LeadPerfil & { tentativa?: number | null })[]).map(async (lead) => {
      try {
        if (!followups) await db().from("outreach_leads").update({ msg_status: "gerando" }).eq("place_id", lead.place_id);
        const { data: conc } = await db()
          .from("outreach_leads")
          .select("place_id,empresa,avaliacoes,nota")
          .eq("nicho", lead.nicho ?? "")
          .eq("cidade", lead.cidade ?? "");
        const diag = diagnosticar(lead, (conc ?? []) as Concorrente[]);
        const l = lead as LeadPerfil & {
          endereco?: string | null;
          site_preview?: SitePreview | null;
          toque_atual?: number | null;
          sequencia?: Toque[] | null;
          dm_instagram_enviado_em?: string | null;
        };
        const [seq, dm, site] = await Promise.all([
          escreverSequencia(lead, diag),
          lead.instagram && !l.dm_instagram_enviado_em ? gerarDirect(lead, diag).catch(() => null) : Promise.resolve(null),
          semSiteProprio(lead.site) && !l.site_preview ? gerarSite(l).catch(() => null) : Promise.resolve(null),
        ]);
        if (followups) {
          // Mantém o que já saiu; troca só os próximos toques
          const feitos = l.toque_atual ?? 0;
          const antiga = Array.isArray(l.sequencia) ? l.sequencia : [];
          const nova = seq.map((t, i) => (i < feitos && antiga[i] ? antiga[i] : t));
          await db()
            .from("outreach_leads")
            .update({
              ...(dm ? { dm_instagram: dm } : {}),
              ...(site ? { site_preview: site, site_preview_em: site.gerado_em } : {}),
              diagnostico: diag,
              sequencia: nova,
              msg_gerada_em: new Date().toISOString(),
            })
            .eq("place_id", lead.place_id);
          gerados++;
          return;
        }
        await db()
          .from("outreach_leads")
          .update({
            ...(dm ? { dm_instagram: dm, dm_instagram_enviado_em: null } : {}),
            ...(site ? { site_preview: site, site_preview_em: site.gerado_em } : {}),
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
        if (!followups) await db().from("outreach_leads").update({ msg_status: "sem" }).eq("place_id", lead.place_id);
      }
    }),
  );

  const resto = db().from("outreach_leads").select("place_id", { count: "exact", head: true });
  const { count } = followups
    ? await resto.eq("cadencia", "ativa").eq("wa_status", "enviado").or(`msg_gerada_em.is.null,msg_gerada_em.lt.${desde}`)
    : await resto.eq("wa_status", "pendente").eq("msg_status", "sem");
  return json({ gerados, restantes: count ?? 0, erros });
}
