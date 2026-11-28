/**
 * Rodada do score de qualidade (28/11/2026, Kelvin), chamada pelo relógio (/api/cron/tick).
 * 1. Lê o Instagram dos leads da fila que ainda não foram lidos (Apify), com teto de gasto por dia e no mês.
 * 2. Calcula o score de quem não tem ou foi enriquecido depois (Léo, Instagram), e grava faixa e dor principal.
 * O disparo (outreach-wa-tick) usa o score para a ordem da fila; a Gabi e a Marina recebem a faixa e a dor na conversa.
 */
import { db } from "./db.ts";
import { nichoNaRotacao } from "./auto.ts";
import { perfisInstagram } from "./rita.ts";
import { calcularScore, type LeadParaScore } from "./score-lead.ts";
import { toLocal } from "./time.ts";

const CAMPOS =
  "place_id,nicho,empresa,avaliacoes,nota,fotos,tem_descricao,tem_horario,responde_avaliacoes,posicao_busca,site,site_fonte,instagram,observacoes,whatsapp,decisor,socios,email,cnpj_email,porte,cnpj_situacao,ig_perfil,ig_perfil_em,score_em,enriquecido_em";
const FILA = ["sem", "gerando", "rascunho", "aprovada"];
/** Teto do Instagram do score: US$ 0,20 por dia (cerca de 65 perfis) e nunca deixa menos de US$ 0,50 no mês. */
const TETO_DIA_USD = 0.2;
const RESERVA_MES_USD = 0.5;
const POR_RODADA = 20;

const handle = (url: string | null | undefined) => (url ?? "").match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1]?.toLowerCase() ?? null;

type Linha = LeadParaScore & { place_id: string; ig_perfil_em?: string | null; score_em?: string | null; enriquecido_em?: string | null };

async function gastoScoreHoje(): Promise<number> {
  const l = toLocal(new Date());
  const inicio = new Date(Date.UTC(l.y, l.m - 1, l.d, 3, 0, 0));
  const { data } = await db().from("outreach_coletas").select("custo_usd").like("observacoes", "Score:%").gte("executada_em", inicio.toISOString());
  return ((data ?? []) as { custo_usd: number }[]).reduce((a, x) => a + Number(x.custo_usd ?? 0), 0);
}

async function lerInstagram(): Promise<Record<string, unknown>> {
  const { h, dow } = toLocal(new Date());
  if (dow === 0 || h < 8 || h >= 19) return { skipped: "fora do horário" };
  if (!process.env.APIFY_TOKEN) return { skipped: "sem APIFY_TOKEN" };
  const { data: o } = await db().rpc("outreach_orcamento");
  const orc = (o ?? {}) as { gasto_usd?: number; teto_usd?: number };
  const livreMes = Number(orc.teto_usd ?? 4) - Number(orc.gasto_usd ?? 0);
  const hoje = await gastoScoreHoje();
  if (livreMes < RESERVA_MES_USD || hoje >= TETO_DIA_USD) return { skipped: "teto", livreMes, hoje };

  const { data } = await db()
    .from("outreach_leads")
    .select(CAMPOS)
    .eq("wa_status", "pendente")
    .in("msg_status", FILA)
    .not("whatsapp", "is", null)
    .not("instagram", "is", null)
    .is("ig_perfil_em", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const alvo = ((data ?? []) as Linha[]).filter((l) => nichoNaRotacao(l.nicho, l.place_id) && handle(l.instagram)).slice(0, POR_RODADA);
  if (!alvo.length) return { lidos: 0 };

  const usuarios = [...new Set(alvo.map((l) => handle(l.instagram)!))];
  const { perfis, custo } = await perfisInstagram(usuarios);
  if (custo > 0)
    await db().from("outreach_coletas").insert({ custo_usd: custo, lugares_coletados: 0, novos_adicionados: 0, observacoes: `Score: Instagram (${usuarios.length} perfis)` });
  // Apify não devolveu nada (sem crédito, token ou falha): não marca os leads como lidos, tenta de novo depois
  if (!perfis.length) return { lidos: 0, pedidos: usuarios.length, custo, falha: "o Apify não devolveu perfis" };
  const porUsuario = new Map(perfis.map((p) => [p.usuario, p]));
  const agora = new Date().toISOString();
  await Promise.all(
    alvo.map((l) => {
      const p = porUsuario.get(handle(l.instagram)!);
      const ig_perfil = p ? { seguidores: p.seguidores, posts: p.posts, link: p.link, ultimo_post: p.ultimo_post, comercial: p.comercial, bio: p.bio.slice(0, 300) } : null;
      return db().from("outreach_leads").update({ ig_perfil, ig_perfil_em: agora }).eq("place_id", l.place_id);
    }),
  );
  return { lidos: perfis.length, pedidos: usuarios.length, custo };
}

async function pontuar(): Promise<Record<string, unknown>> {
  const base = () =>
    db().from("outreach_leads").select(CAMPOS).eq("wa_status", "pendente").in("msg_status", FILA).not("whatsapp", "is", null);
  // Sem score ainda, e depois quem foi enriquecido (Instagram ou Léo) depois do último cálculo
  const { data: novos } = await base().is("score_em", null).order("created_at", { ascending: false }).limit(150);
  const { data: velhos } = await base().not("score_em", "is", null).order("score_em", { ascending: true }).limit(300);
  const desatualizado = (l: Linha) => {
    const s = l.score_em ? new Date(l.score_em).getTime() : 0;
    return [l.ig_perfil_em, l.enriquecido_em].some((x) => x && new Date(x).getTime() > s);
  };
  const lista = [...((novos ?? []) as Linha[]), ...((velhos ?? []) as Linha[]).filter(desatualizado)].slice(0, 150);
  const agora = new Date();
  const faixas: Record<string, number> = { A: 0, B: 0, C: 0 };
  for (let i = 0; i < lista.length; i += 15) {
    await Promise.all(
      lista.slice(i, i + 15).map((l) => {
        const s = calcularScore(l, agora);
        faixas[s.faixa]++;
        return db()
          .from("outreach_leads")
          .update({ score: s.score, score_faixa: s.faixa, score_dor: s.dor, score_detalhe: { blocos: s.blocos, motivos: s.motivos }, score_em: agora.toISOString() })
          .eq("place_id", l.place_id);
      }),
    );
  }
  return { pontuados: lista.length, faixas };
}

export async function runScoreLeads(): Promise<Record<string, unknown>> {
  const instagram = await lerInstagram().catch((e) => ({ error: String((e as Error)?.message ?? e).slice(0, 200) }));
  const score = await pontuar();
  return { instagram, score };
}
