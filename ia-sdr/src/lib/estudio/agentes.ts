/**
 * Estúdio · os agentes, chamados pelo relógio (cron/tick, a cada 10 minutos) e pelo portal.
 *   Radar → Curador → Pauteiro → Redator → (aprovação da copy) → Diretor de arte → (aprovação da arte) → Publicador
 * Cada agente pega pouco trabalho por vez, para caber no tempo do relógio, e é ligado/desligado em estudio_config.
 */
import { db } from "../db.ts";
import { env } from "../env.ts";
import { sendText } from "../evolution.ts";
import { contaPublica, ErroMeta, publicar } from "./graph.ts";
import { gerarPautas, motivosDasReferencias, redigir, type Copy, type CopyCarrossel, type CopyEstatico, type CopyReels, type RefResumo } from "./ia.ts";
import {
  formatoDaMidia,
  hojeBR,
  momentoBR,
  montarLegenda,
  normalizarPalavra,
  notaReferencia,
  somarDias,
  vagasDoCalendario,
  type Formato,
  type Mix,
  type Pilar,
} from "./regras.ts";

export interface Config {
  ativo: boolean;
  agentes: Record<string, boolean>;
  horarios: string[];
  dias_a_frente: number;
  pilares: Pilar[];
  mix: Mix;
  ultimo_radar: string | null;
}

export interface Pauta {
  id: string;
  dia: string;
  horario: string;
  formato: Formato;
  pilar: string | null;
  tema: string;
  gancho: string | null;
  referencias: string[];
  palavra_gatilho: string | null;
  status: string;
  comentario: string | null;
  tentativas: number;
}

export async function lerConfig(): Promise<Config> {
  const { data } = await db().from("estudio_config").select("*").eq("id", 1).maybeSingle();
  if (!data) throw new Error("Estúdio sem configuração (rode a migração 0019)");
  return data as Config;
}

const ligado = (c: Config, agente: string) => c.ativo && c.agentes?.[agente] !== false;

/* ---------------- Radar + Curador ---------------- */

/** Confere um @ na Meta e atualiza a fonte. Devolve os dados públicos da conta. */
export async function verificarConta(username: string) {
  const u = username.replace(/^@/, "").trim().toLowerCase();
  try {
    const c = await contaPublica(u, 1);
    await db()
      .from("estudio_fontes")
      .upsert({ tipo: "conta", valor: u, nome: c.name ?? null, seguidores: c.followers_count ?? null, posts: c.media_count ?? null, verificado_em: new Date().toISOString(), erro: null }, { onConflict: "tipo,valor" });
    return { ok: true as const, username: u, nome: c.name ?? null, seguidores: c.followers_count ?? null, posts: c.media_count ?? null };
  } catch (e) {
    const erro = e instanceof ErroMeta && /not found|does not exist|Invalid user/i.test(e.message) ? "conta não encontrada ou não é profissional" : String((e as Error).message).slice(0, 200);
    await db().from("estudio_fontes").upsert({ tipo: "conta", valor: u, erro }, { onConflict: "tipo,valor" });
    return { ok: false as const, username: u, erro };
  }
}

/** Radar: coleta os últimos posts de cada conta vigiada e dá nota. Curador: explica os 10 melhores. */
export async function rodarRadar(agora = new Date()) {
  const { data: fontes } = await db().from("estudio_fontes").select("id,valor").eq("tipo", "conta").eq("ativo", true);
  let coletadas = 0;
  const erros: string[] = [];
  for (const f of fontes ?? []) {
    try {
      const c = await contaPublica(f.valor, 25);
      await db().from("estudio_fontes").update({ nome: c.name ?? null, seguidores: c.followers_count ?? null, posts: c.media_count ?? null, verificado_em: agora.toISOString(), erro: null }).eq("id", f.id);
      const linhas = (c.media?.data ?? []).map((m) => ({
        fonte_id: f.id,
        ig_media_id: m.id,
        conta: c.username,
        link: m.permalink ?? null,
        formato: formatoDaMidia(m),
        legenda: (m.caption ?? "").slice(0, 2200),
        curtidas: m.like_count ?? null,
        comentarios: m.comments_count ?? null,
        views: m.view_count ?? null,
        seguidores: c.followers_count ?? null,
        publicado_em: m.timestamp ?? null,
        nota: notaReferencia({ curtidas: m.like_count, comentarios: m.comments_count, views: m.view_count, seguidores: c.followers_count, publicadoEm: m.timestamp }, agora),
        coletado_em: agora.toISOString(),
      }));
      if (linhas.length) {
        const { error } = await db().from("estudio_referencias").upsert(linhas, { onConflict: "ig_media_id", ignoreDuplicates: false });
        if (error) throw new Error(error.message);
        coletadas += linhas.length;
      }
    } catch (e) {
      const msg = String((e as Error).message).slice(0, 200);
      erros.push(`@${f.valor}: ${msg}`);
      await db().from("estudio_fontes").update({ erro: msg }).eq("id", f.id);
    }
  }
  // Curador: os 10 melhores dos últimos 30 dias que ainda não têm motivo
  const desde = new Date(agora.getTime() - 30 * 86_400_000).toISOString();
  const { data: top } = await db()
    .from("estudio_referencias")
    .select("id,conta,formato,legenda,curtidas,comentarios,views,nota,motivo")
    .gte("publicado_em", desde)
    .is("motivo", null)
    .order("nota", { ascending: false })
    .limit(10);
  if (top?.length) {
    const motivos = await motivosDasReferencias(top as RefResumo[]).catch(() => ({} as Record<string, string>));
    for (const [id, motivo] of Object.entries(motivos)) await db().from("estudio_referencias").update({ motivo }).eq("id", id);
  }
  await db().from("estudio_config").update({ ultimo_radar: hojeBR(agora) }).eq("id", 1);
  return { contas: fontes?.length ?? 0, coletadas, erros };
}

async function melhoresReferencias(limite = 15): Promise<RefResumo[]> {
  const desde = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const { data } = await db()
    .from("estudio_referencias")
    .select("id,conta,formato,legenda,curtidas,comentarios,views,nota,motivo")
    .gte("publicado_em", desde)
    .order("nota", { ascending: false })
    .limit(limite);
  return (data ?? []) as RefResumo[];
}

/* ---------------- Pauteiro ---------------- */

/** Preenche os dias sem pauta até `dias_a_frente`, no máximo `limite` por vez. */
export async function rodarPauteiro(c: Config, agora = new Date(), limite = 7) {
  const hoje = hojeBR(agora);
  const ate = somarDias(hoje, c.dias_a_frente);
  const { data: existentes } = await db().from("estudio_pautas").select("dia,status,tema").gte("dia", somarDias(hoje, -30)).lte("dia", ate);
  const ocupados = new Set((existentes ?? []).filter((p) => p.status !== "descartado" && p.dia > hoje).map((p) => p.dia as string));
  const vagas = vagasDoCalendario({ hoje, diasAFrente: c.dias_a_frente, ocupados, horarios: c.horarios, mix: c.mix, pilares: c.pilares }).slice(0, limite);
  if (!vagas.length) return { criadas: 0 };
  const refs = await melhoresReferencias();
  const temas = (existentes ?? []).map((p) => p.tema as string);
  const geradas = await gerarPautas({ vagas, pilares: c.pilares, refs, temasRecentes: temas });
  const idsRefs = new Set(refs.map((r) => r.id));
  const linhas = vagas
    .map((v) => {
      const g = geradas.find((p) => p.dia === v.dia);
      if (!g) return null;
      return {
        dia: v.dia,
        horario: v.horario,
        formato: v.formato,
        pilar: v.pilar,
        tema: g.tema.slice(0, 300),
        gancho: (g.gancho ?? "").slice(0, 300) || null,
        palavra_gatilho: normalizarPalavra(g.palavra_gatilho),
        referencias: (g.referencias ?? []).filter((id) => idsRefs.has(id)).slice(0, 3),
        status: "pauta",
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  if (linhas.length) {
    const { error } = await db().from("estudio_pautas").insert(linhas);
    if (error) throw new Error(`pautas: ${error.message}`);
  }
  return { criadas: linhas.length };
}

/* ---------------- Redator ---------------- */

async function ultimaPeca(pautaId: string, tipo: "copy" | "arte") {
  const { data } = await db().from("estudio_pecas").select("*").eq("pauta_id", pautaId).eq("tipo", tipo).order("versao", { ascending: false }).limit(1).maybeSingle();
  return data as { id: string; versao: number; conteudo: Copy; arquivos: string[] } | null;
}

async function refsDaPauta(p: Pauta): Promise<RefResumo[]> {
  if (!p.referencias?.length) return [];
  const { data } = await db().from("estudio_referencias").select("id,conta,formato,legenda,curtidas,comentarios,views,nota,motivo").in("id", p.referencias);
  return (data ?? []) as RefResumo[];
}

/** Escreve (ou reescreve, se o Kelvin pediu ajuste) a copy das próximas pautas. */
export async function rodarRedator(agora = new Date(), limite = 3) {
  const hoje = hojeBR(agora);
  const { data } = await db().from("estudio_pautas").select("*").eq("status", "pauta").gte("dia", hoje).order("dia").limit(limite);
  let feitas = 0;
  for (const p of (data ?? []) as Pauta[]) {
    try {
      const anterior = await ultimaPeca(p.id, "copy");
      const copy = await redigir({
        formato: p.formato,
        tema: p.tema,
        gancho: p.gancho,
        pilar: p.pilar,
        palavra: p.palavra_gatilho,
        refs: await refsDaPauta(p),
        ajuste: p.comentario && anterior ? { comentario: p.comentario, anterior: anterior.conteudo } : null,
      });
      await db().from("estudio_pecas").insert({ pauta_id: p.id, tipo: "copy", versao: (anterior?.versao ?? 0) + 1, conteudo: copy, comentario: p.comentario });
      await db().from("estudio_pautas").update({ status: "revisar_copy", comentario: null, erro: null }).eq("id", p.id);
      feitas++;
    } catch (e) {
      await db().from("estudio_pautas").update({ erro: `Redator: ${String((e as Error).message).slice(0, 300)}` }).eq("id", p.id);
    }
  }
  return { feitas };
}

/* ---------------- Diretor de arte ---------------- */

/** Monta a arte das pautas com copy aprovada. Reels espera o vídeo (upload no portal). */
export async function rodarDiretor(limite = 2) {
  const { data } = await db().from("estudio_pautas").select("*").eq("status", "copy_aprovada").order("dia").limit(limite);
  let feitas = 0;
  for (const p of (data ?? []) as Pauta[]) {
    try {
      if (p.formato === "reels") {
        await db().from("estudio_pautas").update({ status: "aguardando_video", comentario: null, erro: null }).eq("id", p.id);
        continue;
      }
      const copy = await ultimaPeca(p.id, "copy");
      if (!copy) throw new Error("sem copy");
      const { imagensCarrossel, imagemEstatico, subirImagens } = await import("./arte.tsx");
      const imagens = p.formato === "carrossel" ? await imagensCarrossel(copy.conteudo as CopyCarrossel, p.palavra_gatilho) : await imagemEstatico(copy.conteudo as CopyEstatico, p.palavra_gatilho);
      const anterior = await ultimaPeca(p.id, "arte");
      const versao = (anterior?.versao ?? 0) + 1;
      const links = await subirImagens(p.id, versao, imagens);
      await db().from("estudio_pecas").insert({ pauta_id: p.id, tipo: "arte", versao, conteudo: { modelo: p.formato }, arquivos: links, comentario: p.comentario });
      await db().from("estudio_pautas").update({ status: "revisar_arte", comentario: null, erro: null }).eq("id", p.id);
      feitas++;
    } catch (e) {
      await db().from("estudio_pautas").update({ erro: `Diretor: ${String((e as Error).message).slice(0, 300)}` }).eq("id", p.id);
    }
  }
  return { feitas };
}

/* ---------------- Publicador ---------------- */

async function avisarKelvin(texto: string) {
  if (env.alertPhone) await sendText(env.alertPhone, texto).catch(() => null);
}

/** Cria o gatilho do Direct para a palavra-chave do post recém-publicado. */
async function criarGatilho(p: Pauta, mediaId: string, link: string | null, legenda: string): Promise<string | null> {
  if (!p.palavra_gatilho) return null;
  const palavra = p.palavra_gatilho.toLowerCase();
  const { data, error } = await db()
    .from("ig_gatilhos")
    .insert({
      nome: `Estúdio · ${p.tema.slice(0, 60)}`,
      ativo: true,
      tipo: "link",
      palavras: [palavra],
      midias: [mediaId],
      midias_info: [{ id: mediaId, link, legenda: legenda.slice(0, 200) }],
      respostas_publicas: ["Te mandei no direct 📩", "Olha seu direct 👀", "Acabei de te chamar no direct!"],
      mensagem: `Oi, {nome}! Aqui é da DemandIA 👋 Você comentou ${p.palavra_gatilho}, então aqui vai: seu diagnóstico gratuito começa por este botão. Leva uns 3 minutos e o resultado chega no seu WhatsApp.`,
      botao_tipo: "diagnostico",
      botao_texto: "Fazer diagnóstico",
    })
    .select("id")
    .single();
  if (error) {
    console.error("Estúdio: gatilho não criado", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

/** Publica o que está agendado e já chegou na hora. Um por vez, para não estourar o tempo. */
export async function rodarPublicador(agora = new Date()) {
  const hoje = hojeBR(agora);
  const { data } = await db().from("estudio_pautas").select("*").eq("status", "agendado").lte("dia", hoje).order("dia").order("horario").limit(3);
  const prontas = ((data ?? []) as Pauta[]).filter((p) => momentoBR(p.dia, p.horario).getTime() <= agora.getTime());
  const p = prontas[0];
  if (!p) return { publicadas: 0 };
  // Trava: só um ciclo publica esta pauta
  const { data: trava } = await db().from("estudio_pautas").update({ status: "publicando" }).eq("id", p.id).eq("status", "agendado").select("id");
  if (!trava?.length) return { publicadas: 0 };
  try {
    const copy = await ultimaPeca(p.id, "copy");
    const arte = await ultimaPeca(p.id, "arte");
    if (!copy || !arte?.arquivos?.length) throw new Error("sem copy ou sem arte aprovada");
    const c = copy.conteudo as CopyCarrossel & CopyEstatico & CopyReels;
    const legenda = montarLegenda(c.legenda ?? "", p.palavra_gatilho, c.hashtags ?? []);
    const pub =
      p.formato === "reels"
        ? await publicar({ video: arte.arquivos.find((a) => /\.(mp4|mov)$/i.test(a)) ?? arte.arquivos[0], capa: arte.arquivos.find((a) => /\.(png|jpe?g)$/i.test(a)), legenda })
        : await publicar({ imagens: arte.arquivos, legenda });
    const gatilhoId = await criarGatilho(p, pub.id, pub.link, legenda);
    await db().from("estudio_publicacoes").insert({ pauta_id: p.id, ig_media_id: pub.id, link: pub.link, publicado_em: agora.toISOString(), gatilho_id: gatilhoId });
    await db().from("estudio_pautas").update({ status: "publicado", erro: null }).eq("id", p.id);
    return { publicadas: 1, link: pub.link };
  } catch (e) {
    const msg = e instanceof ErroMeta && e.semPermissao ? `A Meta recusou: falta a permissão de publicar (instagram_content_publish) no token. ${e.message}` : String((e as Error).message);
    const tentativas = (p.tentativas ?? 0) + 1;
    const desiste = tentativas >= 3 || (e instanceof ErroMeta && e.semPermissao);
    await db()
      .from("estudio_pautas")
      .update({ status: desiste ? "erro" : "agendado", erro: msg.slice(0, 500), tentativas })
      .eq("id", p.id);
    if (desiste) await avisarKelvin(`⚠️ Estúdio: o post de ${p.dia} (${p.tema.slice(0, 60)}) não foi publicado.\n${msg.slice(0, 300)}\nVeja em Marketing › Estúdio.`);
    await db().from("estudio_publicacoes").insert({ pauta_id: p.id, erro: msg.slice(0, 500) });
    return { publicadas: 0, erro: msg };
  }
}

/* ---------------- Relógio ---------------- */

/** Chamado pelo cron a cada 10 minutos. Cada etapa falha sozinha, sem derrubar as outras. */
export async function estudioTick(agora = new Date()) {
  let c: Config;
  try {
    c = await lerConfig();
  } catch (e) {
    return { ok: false, erro: String((e as Error).message) };
  }
  if (!c.ativo) return { ok: true, pausado: true };
  const out: Record<string, unknown> = {};
  const horaBR = Number(new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(11, 13));
  const etapa = async (nome: string, fn: () => Promise<unknown>) => {
    try {
      out[nome] = await fn();
    } catch (e) {
      out[nome] = { erro: String((e as Error).message).slice(0, 300) };
    }
  };
  if (ligado(c, "publicador")) await etapa("publicador", () => rodarPublicador(agora));
  if (ligado(c, "radar") && c.ultimo_radar !== hojeBR(agora) && horaBR >= 6) await etapa("radar", () => rodarRadar(agora));
  if (ligado(c, "pauteiro")) await etapa("pauteiro", () => rodarPauteiro(c, agora, 4));
  if (ligado(c, "redator")) await etapa("redator", () => rodarRedator(agora, 2));
  if (ligado(c, "diretor")) await etapa("diretor", () => rodarDiretor(2));
  return { ok: true, ...out };
}
