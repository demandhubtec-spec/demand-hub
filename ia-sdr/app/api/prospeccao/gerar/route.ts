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
import { contatosDoSite } from "@/src/lib/enriquecer.ts";
import { env } from "@/src/lib/env.ts";
import { carregarPlaybook, manuaisAtuais } from "@/src/lib/playbook.ts";
import { linkRelatorio, type Diagnosticos } from "@/src/lib/rita.ts";
import { linkPrevia } from "@/src/lib/extras.ts";

/** Empresas reabordadas do zero (08/11/2026): já receberam mensagens da abordagem antiga, pela Ana. */
function jaFalamos(lead: unknown): string {
  if (!(lead as { wa_sent_at?: string | null }).wa_sent_at) return "";
  return "\n\n## Contato anterior\nEssa empresa já recebeu mensagens nossas antes, na abordagem antiga (quem falou foi a Ana, colega da Gabi). Não finja que é o primeiro contato: no toque 1 a Gabi se apresenta, diz com leveza que assumiu o contato e que preparou um diagnóstico completo da empresa. Não peça desculpa nem cobre resposta.";
}

/** Diagnóstico aprovado da Rita e link do relatório da Duda: a primeira mensagem já entrega valor. */
function textoDoRelatorio(lead: unknown): string {
  const l = lead as { relatorio_token?: string | null; diagnosticos?: Diagnosticos | null };
  if (!l.relatorio_token || !l.diagnosticos) return "";
  const d = l.diagnosticos;
  const areas = [["Google", d.google], ["Site", d.site], ["Instagram", d.instagram]]
    .filter(([, a]) => a)
    .map(([n, a]) => `- ${n}: nota ${(a as { nota: number }).nota}. Críticos: ${((a as { criticos: string[] }).criticos ?? []).slice(0, 2).join("; ")}`)
    .join("\n");
  const previa = (lead as { site_preview?: { token?: string } | null }).site_preview?.token;
  return `\n\n## Diagnóstico aprovado pelo Kelvin (use os achados reais)\n${d.geral?.frase ?? ""}\n${areas}
O relatório completo vai em PDF anexado (o cliente não recebe link do relatório). No PRIMEIRO toque do WhatsApp, escreva "[PDF]" sozinho num balão, antes da pergunta final: o sistema troca pelo arquivo. Diga no balão anterior algo como "separei o raio-x completo aqui no PDF". Não coloque o link do relatório em nenhum toque.${
    previa
      ? (lead as { site_preview?: { tipo?: string } | null }).site_preview?.tipo === "melhoria"
        ? `\nA empresa já tem site: montamos uma versão melhorada dele, com a logo e as cores da empresa (é a proposta de melhoria; o link pode ir no primeiro toque ou num follow-up): ${linkPrevia(previa)}`
        : `\nA empresa não tem site: montamos uma prévia gratuita do site dela, com a logo e as cores da empresa (o link pode ir no primeiro toque ou num follow-up): ${linkPrevia(previa)}`
      : ""
  }\n(Link do relatório só para o e-mail, se houver toque por e-mail: ${linkRelatorio(l.relatorio_token)})`;
}

/** Empresa da lista do Instagram: a abordagem parte do Instagram, não do Google. */
function contextoInstagram(lead: unknown): string {
  const l = lead as { origem?: string | null; observacoes?: string | null };
  if (l.origem !== "instagram") return "";
  return `\n\n## Esta empresa veio da lista do Instagram
A pessoa comentou num post sobre marketing e vendas, mostrando interesse em crescer. Anotações da coleta: ${(l.observacoes ?? "").slice(0, 600)}
- Abra dizendo que a Gabi viu o perfil da empresa no Instagram e preparou um raio-x digital gratuito (Instagram, site e como os clientes chegam).
- Não cite o post, o comentário nem o perfil onde ele foi feito, e não diga que acompanhamos comentários.
- Não há dados do Google Meu Negócio desta empresa: não fale de posição, nota ou avaliações no Google.
- Ganchos que funcionam aqui: transformar seguidores em pedidos e agendamentos, atendimento rápido no WhatsApp, site próprio com a cara da marca.`;
}

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
  "place_id,empresa,email,nicho,cidade,decisor,avaliacoes,nota,site,instagram,fotos,tem_descricao,tem_horario,responde_avaliacoes,termo_busca,posicao_busca,total_busca,tentativa,endereco,site_preview,toque_atual,sequencia,dm_instagram_enviado_em,relatorio_token,diagnosticos,wa_sent_at,origem,observacoes";
const LOTE = 5;

/** Pede a sequência à IA; se ainda vier com cara de IA, pede uma nova versão uma vez. */
async function escreverSequencia(lead: LeadPerfil & { tentativa?: number | null }, diag: ReturnType<typeof diagnosticar>): Promise<Toque[]> {
  const pb = await carregarPlaybook();
  const comPlaybook = (t: string, quem: string) => {
    const manual = manuaisAtuais(quem);
    return `${t}${pb ? `\n\n## Playbook comercial do Kelvin (siga sempre)\n${pb}` : ""}${manual ? `\n\n${manual}` : ""}`;
  };
  const system = comPlaybook(promptSequencia(lead, diag), "bia") + textoDoRelatorio(lead) + contextoInstagram(lead) + jaFalamos(lead);
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
    system: comPlaybook(promptRevisaoSequencia(lead, diag, rascunho), "rui"),
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

  // Só perfil "dono" do portal, ou a prospecção automática (CRON_SECRET)
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (token !== env.cronSecret) {
    const { data: u } = await db().auth.getUser(token);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
    if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);
  }

  const body = (await req.json().catch(() => ({}))) as { place_ids?: string[]; modo?: string; desde?: string };
  // modo "followups": reescreve só os toques que ainda não saíram de quem já está em cadência
  // (o que já foi enviado continua igual e a aprovação é mantida)
  const followups = body.modo === "followups";
  const desde = body.desde && !Number.isNaN(Date.parse(body.desde)) ? body.desde : new Date().toISOString();
  let q = db().from("outreach_leads").select(CAMPOS);
  if (followups) q = q.eq("cadencia", "ativa").eq("wa_status", "enviado").or(`msg_gerada_em.is.null,msg_gerada_em.lt.${desde}`).order("proximo_toque_em").limit(LOTE);
  else if (body.place_ids?.length) q = q.in("place_id", body.place_ids.slice(0, LOTE));
  // Só escreve para quem passou pelas aprovações do Kelvin: lista do Léo, diagnóstico da Rita e relatório da Duda
  else q = q.eq("wa_status", "pendente").eq("msg_status", "sem").eq("duda_status", "aprovado").order("prioridade").order("created_at").limit(LOTE);
  const { data: leads, error } = await q;
  if (error) return json({ error: error.message }, 500);

  // Público-alvo e filtro "só com Instagram" da prospecção automática (valem para a fila, não para pedidos avulsos)
  const { data: cfgAuto } = await db().from("outreach_config").select("auto_publico,auto_filtros").eq("id", 1).maybeSingle();
  const publico = ((cfgAuto as { auto_publico?: string | null } | null)?.auto_publico ?? "").trim();
  const soComInstagram = !followups && !body.place_ids?.length && !!(cfgAuto as { auto_filtros?: { so_com_instagram?: boolean } | null } | null)?.auto_filtros?.so_com_instagram;

  let gerados = 0;
  let descartados = 0;
  const erros: string[] = [];
  await Promise.all(
    ((leads ?? []) as (LeadPerfil & { tentativa?: number | null })[]).map(async (lead) => {
      try {
        if (!followups) await db().from("outreach_leads").update({ msg_status: "gerando" }).eq("place_id", lead.place_id);
        // Sem e-mail ou Instagram na ficha do Google: procura no site da empresa antes de escrever
        const sem = lead as LeadPerfil & { email?: string | null };
        if (!sem.email || !lead.instagram) {
          const c = await contatosDoSite(lead.site).catch(() => ({ email: null, instagram: null }));
          const patch: Record<string, string> = {};
          if (!sem.email && c.email) patch.email = sem.email = c.email;
          if (!lead.instagram && c.instagram) patch.instagram = lead.instagram = c.instagram;
          if (Object.keys(patch).length) await db().from("outreach_leads").update(patch).eq("place_id", lead.place_id);
        }
        if (soComInstagram && !lead.instagram) {
          await db().from("outreach_leads").update({ msg_status: "rejeitada" }).eq("place_id", lead.place_id);
          descartados++;
          return;
        }
        if (publico) (lead as LeadPerfil & { publico?: string }).publico = publico;
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
    : await resto.eq("wa_status", "pendente").eq("msg_status", "sem").eq("duda_status", "aprovado");
  return json({ gerados, descartados, restantes: count ?? 0, erros });
}
