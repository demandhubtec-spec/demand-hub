/**
 * Estúdio · os agentes, chamados pelo relógio (cron/estudio, a cada minuto) e pelo portal.
 *   Radar → Curador → Pauteiro → Redator → (aprovação da copy) → Diretor de arte → (aprovação da arte) → Publicador
 * Cada agente pega pouco trabalho por vez, para caber no tempo do relógio, e é ligado/desligado em estudio_config.
 */
import { db } from "../db.ts";
import type { Formato as FormatoFoto } from "./fotos.ts";
import { env } from "../env.ts";
import { sendText } from "../evolution.ts";
import { contaPublica, ErroMeta, minhasMidias, publicar } from "./graph.ts";
import { contextoDaMarca, estudarPerfil, gerarPautas, motivosDasReferencias, redigir, responderNoChat, type Marca, type PerfilPadrao, type Copy, type CopyCarrossel, type CopyEstatico, type CopyReels, type RefResumo } from "./ia.ts";
import {
  formatoDaMidia,
  hojeBR,
  horizonteDoPlano,
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
  inicio_em: string | null;
  marca: Marca | null;
  perfil_padrao: PerfilPadrao | null;
  ultimo_perfil: string | null;
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

/** Cada agente conta o que fez no canal interno do time (a Central mostra isso ao vivo). */
export async function registrar(autor: string, para: string, texto: string) {
  await db().from("estudio_mensagens").insert({ autor, para, texto: texto.slice(0, 1000) });
}

const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const NOME_FORMATO: Record<string, string> = { carrossel: "carrossel", estatico: "post estático", reels: "reels" };

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
    const erro =
      e instanceof ErroMeta && /not found|does not exist|Invalid user/i.test(e.message) ? "conta não encontrada ou não é profissional"
      : e instanceof ErroMeta && e.semPermissao ? "falta a permissão instagram_manage_insights no acesso da Meta (o Radar fica parado até liberar)"
      : String((e as Error).message).slice(0, 200);
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
      const msg = e instanceof ErroMeta && e.semPermissao
        ? "falta a permissão instagram_manage_insights no acesso da Meta (o Radar fica parado até liberar)"
        : String((e as Error).message).slice(0, 200);
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
  const destaque = top?.[0] as RefResumo | undefined;
  await registrar(
    "rita",
    "vera",
    `Radar de hoje feito: ${coletadas} posts lidos de ${fontes?.length ?? 0} perfis.${destaque ? ` Destaque: @${destaque.conta} (${destaque.formato}).` : ""}${erros.length ? ` ${erros.length} perfil(is) com erro, deixei anotado na aba Radar.` : ""}`,
  );
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

/* ---------------- Padrão do nosso perfil ---------------- */

/** Uma vez por semana a Rita estuda o @demand_ia (texto e imagens) e atualiza o padrão que o time segue. */
export async function rodarPerfil(agora = new Date()) {
  const midias = await minhasMidias(30);
  const posts = midias.map((m) => ({
    formato: formatoDaMidia(m),
    legenda: m.caption ?? "",
    curtidas: m.like_count ?? 0,
    comentarios: m.comments_count ?? 0,
    data: (m.timestamp ?? "").slice(0, 10),
    slides: m.children?.data?.length ?? 1,
  }));
  // Imagens dos posts que mais engajaram (capa do carrossel ou do vídeo)
  const imagens = [...midias]
    .sort((a, b) => (b.like_count ?? 0) + 3 * (b.comments_count ?? 0) - ((a.like_count ?? 0) + 3 * (a.comments_count ?? 0)))
    .map((m) => (m.media_type === "VIDEO" ? m.thumbnail_url : m.children?.data?.[0]?.media_url ?? m.media_url))
    .filter((u): u is string => !!u)
    .slice(0, 6);
  const perfil = await estudarPerfil(posts, imagens);
  await db().from("estudio_config").update({ perfil_padrao: perfil, ultimo_perfil: hojeBR(agora) }).eq("id", 1);
  await registrar("rita", "teo", `Estudei os últimos ${posts.length} posts do nosso perfil. O plano e as artes seguem esse padrão a partir de agora. ${perfil.resumo?.slice(0, 260) ?? ""}`);
  return { posts: posts.length, imagens: imagens.length };
}

/** Bloco de marca + padrão do perfil para os prompts. */
const contexto = (c: Config) => contextoDaMarca(c.marca, c.perfil_padrao);

/* ---------------- Pauteiro ---------------- */

/** Preenche os dias sem pauta até `dias_a_frente`, no máximo `limite` por vez. */
export async function rodarPauteiro(c: Config, agora = new Date(), limite = 7) {
  const hoje = hojeBR(agora);
  // Plano por mês: do início escolhido até o fim do mês (do dia 24 em diante, o mês seguinte também)
  const plano = horizonteDoPlano(hoje, c.inicio_em);
  const ate = plano.ate;
  const { data: existentes } = await db().from("estudio_pautas").select("dia,status,tema").gte("dia", somarDias(hoje, -30)).lte("dia", ate);
  const ocupados = new Set((existentes ?? []).filter((p) => p.status !== "descartado" && p.dia > hoje).map((p) => p.dia as string));
  const vagas = vagasDoCalendario({ hoje, diasAFrente: c.dias_a_frente, de: plano.de, ate, ocupados, horarios: c.horarios, mix: c.mix, pilares: c.pilares }).slice(0, limite);
  if (!vagas.length) return { criadas: 0 };
  const refs = await melhoresReferencias();
  const temas = (existentes ?? []).map((p) => p.tema as string);
  const geradas = await gerarPautas({ vagas, pilares: c.pilares, refs, temasRecentes: temas, contexto: contexto(c) });
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
    const faltam = vagasDoCalendario({ hoje, diasAFrente: c.dias_a_frente, de: plano.de, ate, ocupados: new Set([...ocupados, ...linhas.map((l) => l.dia)]), horarios: c.horarios, mix: c.mix, pilares: c.pilares }).length;
    await registrar(
      "teo",
      "vera",
      `Plano: ${linhas.length} pauta(s) nova(s), de ${dm(linhas[0].dia)} a ${dm(linhas[linhas.length - 1].dia)}. ${faltam ? `Faltam ${faltam} dia(s) até ${dm(ate)}, sigo na próxima rodada.` : `Plano fechado até ${dm(ate)}. Bia, pode escrever.`}`,
    );
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
export async function rodarRedator(agora = new Date(), limite = 3, c?: Config) {
  const cfg = c ?? (await lerConfig());
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
        contexto: contexto(cfg),
      });
      await db().from("estudio_pecas").insert({ pauta_id: p.id, tipo: "copy", versao: (anterior?.versao ?? 0) + 1, conteudo: copy, comentario: p.comentario });
      await db().from("estudio_pautas").update({ status: "revisar_copy", comentario: null, erro: null }).eq("id", p.id);
      await registrar("bia", "vera", `${p.comentario ? "Copy refeita com o seu ajuste" : "Copy pronta"}: ${NOME_FORMATO[p.formato]} de ${dm(p.dia)}, "${p.tema.slice(0, 80)}". Está na fila do Kelvin.`);
      feitas++;
    } catch (e) {
      await db().from("estudio_pautas").update({ erro: `Redator: ${String((e as Error).message).slice(0, 300)}` }).eq("id", p.id);
    }
  }
  return { feitas };
}

/* ---------------- Diretor de arte ---------------- */

/** Todos os pedidos do Kelvin na arte desta pauta (o atual e os das versões anteriores), para nada se perder. */
async function pedidosDeArte(p: Pauta): Promise<string> {
  const { data } = await db().from("estudio_pecas").select("versao,comentario").eq("pauta_id", p.id).eq("tipo", "arte").not("comentario", "is", null).order("versao");
  const antigos = ((data ?? []) as { versao: number; comentario: string }[]).map((x) => `- (versão ${x.versao}) ${x.comentario}`);
  return [...antigos, p.comentario ? `- (agora) ${p.comentario}` : ""].filter(Boolean).join("\n");
}

/**
 * Monta a arte das pautas com copy aprovada (uma por rodada, para caber no tempo do relógio).
 * Pedido de ajuste na arte: a Bia aplica primeiro o que for de texto e só depois a Duda refaz a arte.
 * Fotos: geradas pelo ChatGPT a partir da cena de cada lâmina. Se uma pauta travar 3 vezes, ela sai da fila com aviso.
 */
/**
 * Quem monta a peça. Na Vercel é o padrão (imagens pelo next/og, vídeo pelo ffmpeg); o estúdio de produção
 * no GitHub (pasta estudio-render) passa o dele, com o Remotion e sem limite de tempo. `fotos`: índice → link público.
 */
export interface Renderizador {
  carrossel(c: CopyCarrossel, palavra: string | null, fotos: Map<number, string>, marca: Marca | null | undefined): Promise<Buffer[]>;
  reels(c: CopyReels, palavra: string | null, fotos: Map<number, string>, marca: Marca | null | undefined): Promise<{ video: Buffer; capa: Buffer }>;
}

/** Guarda as fotos cruas (sem texto) da versão: servem para remontar a arte sem gerar foto de novo. */
async function subirFotos(pautaId: string, versao: number, fotos: Map<number, string>): Promise<Map<number, string>> {
  const links = new Map<number, string>();
  for (const [i, dataUrl] of fotos) {
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) continue;
    const ext = m[1].includes("png") ? "png" : m[1].includes("webp") ? "webp" : "jpg";
    const caminho = `pautas/${pautaId}/fotos/v${versao}-${String(i + 1).padStart(2, "0")}.${ext}`;
    const { error } = await db().storage.from("estudio").upload(caminho, Buffer.from(m[2], "base64"), { contentType: m[1], upsert: true });
    if (!error) links.set(i, db().storage.from("estudio").getPublicUrl(caminho).data.publicUrl);
  }
  return links;
}

/** Sobe um arquivo no bucket público "estudio" (sem carregar o next/og, que só a Vercel usa). */
async function subirArquivo(caminho: string, corpo: Buffer, tipo: string): Promise<string> {
  const { error } = await db().storage.from("estudio").upload(caminho, corpo, { contentType: tipo, upsert: true });
  if (error) throw new Error(`upload da arte: ${error.message}`);
  return db().storage.from("estudio").getPublicUrl(caminho).data.publicUrl;
}

/** Sobe as lâminas (PNG), igual ao subirImagens da arte.tsx. */
async function subirPngs(pautaId: string, versao: number, imagens: Buffer[]): Promise<string[]> {
  const links: string[] = [];
  for (let i = 0; i < imagens.length; i++) links.push(await subirArquivo(`pautas/${pautaId}/v${versao}-${String(i + 1).padStart(2, "0")}.png`, imagens[i], "image/png"));
  return links;
}

/**
 * Ajustes por lâmina (ou cena) pedidos no portal: a Bia reescreve só as lâminas com pedido e as outras ficam
 * exatamente como estavam. A foto de cada lâmina segue a escolha do Kelvin (manter, nova ou a dele).
 */
async function ajustarPorLamina(p: Pauta, conteudo: Copy, formato: Formato, cfg: Config): Promise<Copy> {
  type Item = { pedido?: string; foto_url?: string; foto_prompt?: string; foto_fixa?: boolean } & Record<string, unknown>;
  const chave = (conteudo as CopyCarrossel).slides ? "slides" : "cenas";
  const itens = ((conteudo as unknown as Record<string, Item[]>)[chave] ?? []) as Item[];
  const nome = formato === "reels" ? "Cena" : "Lâmina";
  const pedidos = itens.map((x, i) => (x.pedido?.trim() ? `${nome} ${i + 1}: ${x.pedido.trim()}` : null)).filter(Boolean) as string[];
  const limpo = (x: Item): Item => {
    const { pedido: _p, ...resto } = x;
    return resto as Item;
  };
  if (!pedidos.length) return { ...conteudo, [chave]: itens.map(limpo) } as Copy;
  const nova = await redigir({
    formato,
    tema: p.tema,
    gancho: p.gancho,
    pilar: p.pilar,
    palavra: p.palavra_gatilho,
    refs: await refsDaPauta(p),
    ajuste: {
      comentario: `Ajustes que o Kelvin pediu, criativo por criativo. Mude SÓ o que foi pedido nestas ${nome.toLowerCase()}s e mantenha todas as outras exatamente iguais, na mesma ordem:\n${pedidos.join("\n")}`,
      anterior: { ...conteudo, [chave]: itens.map(limpo) } as Copy,
    },
    contexto: contexto(cfg),
  });
  const novos = ((nova as unknown as Record<string, Item[]>)[chave] ?? []) as Item[];
  const final = itens.map((x, i) => {
    if (!x.pedido?.trim() || !novos[i]) return limpo(x);
    // Texto novo da Bia, mas a foto continua do jeito que o Kelvin escolheu no portal
    const n = limpo({ ...novos[i] });
    delete n.foto_url;
    delete n.foto_prompt;
    delete n.foto_fixa;
    if (x.foto_url) n.foto_url = x.foto_url;
    if (x.foto_prompt) n.foto_prompt = x.foto_prompt;
    if (x.foto_fixa) n.foto_fixa = x.foto_fixa;
    return n;
  });
  return { ...conteudo, [chave]: final } as Copy;
}

export async function rodarDiretor(limite = 1, c?: Config, render?: Renderizador) {
  const cfg = c ?? (await lerConfig());
  const { data } = await db().from("estudio_pautas").select("*").eq("status", "copy_aprovada").lt("tentativas", 3).order("tentativas").order("dia").limit(limite);
  let feitas = 0;
  for (const p of (data ?? []) as Pauta[]) {
    await db().from("estudio_pautas").update({ tentativas: (p.tentativas ?? 0) + 1 }).eq("id", p.id);
    try {
      let copy = await ultimaPeca(p.id, "copy");
      if (!copy) throw new Error("sem copy");
      const formato: Formato = p.formato === "estatico" ? "carrossel" : p.formato;
      // Ajuste pedido na arte: a copy muda junto (texto da capa, lâminas repetidas, estrutura).
      // "[fotos]" é só troca de foto pelo portal: a copy fica como está.
      if (p.comentario?.startsWith("[lâminas]")) {
        // Ajuste criativo por criativo (portal): a Bia mexe só nas lâminas com pedido; o resto fica idêntico
        copy = { ...copy, versao: copy.versao + 1, conteudo: await ajustarPorLamina(p, copy.conteudo, formato, cfg) };
        await db().from("estudio_pecas").insert({ pauta_id: p.id, tipo: "copy", versao: copy.versao, conteudo: copy.conteudo, comentario: p.comentario });
        await registrar("bia", "duda", `Apliquei os ajustes por lâmina que o Kelvin pediu em ${dm(p.dia)}. Duda, segue com as fotos e a arte.`);
      } else if (p.comentario && !p.comentario.startsWith("[fotos]")) {
        const pedidos = await pedidosDeArte(p);
        const nova = await redigir({
          formato,
          tema: p.tema,
          gancho: p.gancho,
          pilar: p.pilar,
          palavra: p.palavra_gatilho,
          refs: await refsDaPauta(p),
          ajuste: { comentario: `Pedidos do Kelvin na arte (aplique TODOS os que forem de texto, estrutura ou foto):\n${pedidos}`, anterior: copy.conteudo },
          contexto: contexto(cfg),
        });
        // As fotos que o Kelvin subiu continuam valendo na versão nova (as só "mantidas" num ajuste por lâmina, não)
        const { fotosManuais } = await import("./fotos.ts");
        const itens = ((nova as CopyCarrossel).slides ?? (nova as CopyReels).cenas ?? []) as { foto_url?: string }[];
        const antigos = ((copy.conteudo as CopyCarrossel).slides ?? (copy.conteudo as CopyReels).cenas ?? []) as { foto_fixa?: boolean }[];
        for (const [i, url] of fotosManuais(copy.conteudo)) if (itens[i] && !antigos[i]?.foto_fixa) itens[i].foto_url = url;
        await db().from("estudio_pecas").insert({ pauta_id: p.id, tipo: "copy", versao: copy.versao + 1, conteudo: nova, comentario: p.comentario });
        await registrar("bia", "duda", `Apliquei no texto o que o Kelvin pediu na arte de ${dm(p.dia)}. Duda, segue com as fotos e a arte.`);
        copy = { ...copy, versao: copy.versao + 1, conteudo: nova };
      }
      // O estúdio de produção (Remotion) não carrega o next/og: só a Vercel usa os modelos antigos
      const arte = render ? null : await import("./arte.tsx");
      const { gerarFotos, cenasDasFotos, fotosManuais, promptsManuais, baixarReferencias, promptDaFoto, modelosDasLaminas, formatoDaFoto } = await import("./fotos.ts");
      if (arte) await arte.usarMarca(cfg.marca);
      const anterior = await ultimaPeca(p.id, "arte");
      const versao = (anterior?.versao ?? 0) + 1;
      const legado = p.formato === "estatico" && !(copy.conteudo as CopyCarrossel).slides;
      // Referências da pauta (posts que funcionaram): a foto segue o estilo delas
      const { data: refsDb } = p.referencias?.length ? await db().from("estudio_referencias").select("conta,ig_media_id,link").in("id", p.referencias) : { data: [] };
      const refs = (refsDb ?? []) as { conta: string | null; ig_media_id: string | null; link: string | null }[];
      const { imagensDasReferencias } = await import("./graph.ts");
      const referencias = legado ? [] : await baixarReferencias(await imagensDasReferencias(refs).catch(() => []));
      const prontos = promptsManuais(copy.conteudo);
      const cenas = cenasDasFotos(copy.conteudo, formato).map((c, i) => c ?? (prontos.has(i) ? prontos.get(i)! : null));
      // Cada foto já nasce no formato do espaço dela na arte (foto em cima = horizontal, fundo = em pé): nada corta
      const modelos = modelosDasLaminas(cenas.length, (i) => !!cenas[i]);
      const tipoFoto = (i: number): FormatoFoto => (formato === "reels" ? "vertical" : render ? formatoDaFoto(modelos[i]) : "retrato");
      const { fotos, erro: erroFoto } = legado ? { fotos: new Map<number, string>(), erro: null } : await gerarFotos(cenas, tipoFoto, 6, { referencias, manuais: fotosManuais(copy.conteudo), prontos, motor: cfg.agentes?.fotos_kairogen ? "kairogen" : "openai" });
      // O prompt de cada foto fica salvo para o Kelvin copiar e gerar no ChatGPT dele, se quiser trocar
      const linksRefs = refs.map((r) => r.link).filter(Boolean) as string[];
      const prompts = cenas.map((c, i) => (c ? { indice: i, prompt: prontos.get(i) ?? promptDaFoto(c, tipoFoto(i), linksRefs.length > 0), referencias: linksRefs } : null)).filter(Boolean);
      if (erroFoto) await registrar("duda", "vera", `Não consegui gerar ${fotos.size ? "todas as fotos" : "as fotos"} no ChatGPT para ${dm(p.dia)}: ${erroFoto.slice(0, 200)}`);
      // Sem nenhuma foto a peça não vai para o Kelvin: carrossel e reels só de texto não servem (pedido dele, 10/11)
      if (!legado && !fotos.size && cenas.some(Boolean)) throw new Error(`sem fotos: ${(erroFoto ?? "nenhuma foto gerada").slice(0, 250)}`);
      const fotosLinks = await subirFotos(p.id, versao, fotos).catch(() => new Map<number, string>());
      let links: string[];
      if (render && formato === "reels") {
        const v = await render.reels(copy.conteudo as CopyReels, p.palavra_gatilho, fotosLinks, cfg.marca);
        links = [await subirArquivo(`pautas/${p.id}/v${versao}-reels.mp4`, v.video, "video/mp4"), await subirArquivo(`pautas/${p.id}/v${versao}-capa.png`, v.capa, "image/png")];
      } else if (render && !legado) {
        links = await subirPngs(p.id, versao, await render.carrossel(copy.conteudo as CopyCarrossel, p.palavra_gatilho, fotosLinks, cfg.marca));
      } else if (formato === "reels") {
        const { videoDoReels, subirVideo } = await import("./video.ts");
        const v = await videoDoReels(copy.conteudo as CopyReels, p.palavra_gatilho, fotos);
        links = await subirVideo(p.id, versao, v.video, v.capa);
      } else {
        if (!arte) throw new Error("estúdio de produção sem modelo para post estático antigo");
        const imagens = legado ? await arte.imagemEstatico(copy.conteudo as CopyEstatico, p.palavra_gatilho) : await arte.imagensCarrossel(copy.conteudo as CopyCarrossel, p.palavra_gatilho, fotos);
        links = await arte.subirImagens(p.id, versao, imagens);
      }
      await db().from("estudio_pecas").insert({ pauta_id: p.id, tipo: "arte", versao, conteudo: { modelo: formato === "reels" ? "video_ia" : formato, estudio: render ? "remotion" : "vercel", fotos: fotos.size, fotos_links: Object.fromEntries(fotosLinks), prompts }, arquivos: links, comentario: p.comentario });
      await db().from("estudio_pautas").update({ status: "revisar_arte", comentario: null, erro: null, tentativas: 0 }).eq("id", p.id);
      await registrar(
        "duda",
        "vera",
        `${formato === "reels" ? "Vídeo" : "Carrossel"} pronto: ${dm(p.dia)}${fotos.size ? `, com ${fotos.size} foto(s) geradas no ChatGPT` : ""}${p.comentario ? ", já com o ajuste pedido" : ""}. Rui conferiu, está na fila do Kelvin.`,
      );
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
    await registrar("lara", "vera", `Publicado agora: ${NOME_FORMATO[p.formato]} de ${dm(p.dia)} às ${p.horario}.${p.palavra_gatilho ? ` Gatilho ${p.palavra_gatilho} ligado no Direct.` : ""}${pub.link ? ` ${pub.link}` : ""}`);
    return { publicadas: 1, link: pub.link };
  } catch (e) {
    const msg = e instanceof ErroMeta && e.semPermissao ? `A Meta recusou: falta a permissão de publicar (instagram_content_publish) no token. ${e.message}` : String((e as Error).message);
    const tentativas = (p.tentativas ?? 0) + 1;
    const desiste = tentativas >= 3 || (e instanceof ErroMeta && e.semPermissao);
    await db()
      .from("estudio_pautas")
      .update({ status: desiste ? "erro" : "agendado", erro: msg.slice(0, 500), tentativas })
      .eq("id", p.id);
    await registrar("lara", "vera", `Não consegui publicar o post de ${dm(p.dia)} (tentativa ${tentativas}). ${msg.slice(0, 200)}`);
    if (desiste) await avisarKelvin(`⚠️ Estúdio: o post de ${p.dia} (${p.tema.slice(0, 60)}) não foi publicado.\n${msg.slice(0, 300)}\nVeja em Marketing › Estúdio.`);
    await db().from("estudio_publicacoes").insert({ pauta_id: p.id, erro: msg.slice(0, 500) });
    return { publicadas: 0, erro: msg };
  }
}

/* ---------------- Relógio ---------------- */

/** Chamado pelo relógio do Estúdio a cada minuto (uma rodada por vez). Cada etapa falha sozinha, sem derrubar as outras. */
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
  // Padrão do nosso perfil: revisto uma vez por semana (e logo na primeira rodada)
  if (ligado(c, "radar") && (!c.ultimo_perfil || c.ultimo_perfil <= somarDias(hojeBR(agora), -7))) await etapa("perfil", () => rodarPerfil(agora));
  if (ligado(c, "pauteiro")) await etapa("pauteiro", () => rodarPauteiro(c, agora, 7));
  // A arte vem antes da copy: o vídeo e as fotos são o que mais demora, e o Redator só entra se sobrar tempo na rodada
  const inicio = Date.now();
  // Com o estúdio de produção ligado (GitHub, a cada 10 min), a arte sai de lá; a Vercel só cuida do resto
  if (ligado(c, "diretor") && c.agentes?.estudio_externo !== true) await etapa("diretor", () => rodarDiretor(1, c));
  if (ligado(c, "redator") && Date.now() - inicio < 90_000) await etapa("redator", () => rodarRedator(agora, 2, c));
  return { ok: true, ...out };
}

/* ---------------- Chat com o time ---------------- */

/** Estado real do Estúdio em texto, para o time responder sem inventar. */
async function estadoParaChat(c: Config, agora = new Date()): Promise<string> {
  const hoje = hojeBR(agora);
  const plano = horizonteDoPlano(hoje, c.inicio_em);
  const { data: pautas } = await db()
    .from("estudio_pautas")
    .select("dia,horario,formato,pilar,tema,status,palavra_gatilho,erro")
    .gte("dia", somarDias(hoje, -7))
    .lte("dia", plano.ate)
    .neq("status", "descartado")
    .order("dia");
  const linhas = ((pautas ?? []) as (Pauta & { erro: string | null })[]).map(
    (p) => `- ${p.dia} ${p.horario} | ${p.formato} | ${p.pilar ?? "-"} | ${p.status}${p.palavra_gatilho ? ` | ${p.palavra_gatilho}` : ""} | ${p.tema.slice(0, 90)}${p.erro ? ` | erro: ${p.erro.slice(0, 80)}` : ""}`,
  );
  const { data: refs } = await db().from("estudio_referencias").select("conta,formato,nota,motivo").order("nota", { ascending: false }).limit(5);
  const { data: fontes } = await db().from("estudio_fontes").select("valor,erro,ativo").eq("ativo", true);
  const { data: canal } = await db().from("estudio_mensagens").select("autor,para,texto,created_at").neq("autor", "kelvin").neq("para", "time").order("id", { ascending: false }).limit(8);
  return [
    `Hoje: ${hoje}. Começo das postagens: ${c.inicio_em ?? "não definido"}. Plano vai até ${plano.ate}. Um post por dia, horários ${c.horarios.join(" e ")}.`,
    `Agentes ligados: ${Object.entries(c.agentes ?? {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "nenhum"}.`,
    `Manual de marca: ${c.marca?.tom || c.marca?.regras ? "carregado" : "ainda não carregado"}. Padrão do perfil estudado em: ${c.ultimo_perfil ?? "ainda não"}.`,
    `Radar: ${fontes?.length ?? 0} perfis ativos, última rodada ${c.ultimo_radar ?? "nunca"}.${(fontes ?? []).filter((f) => f.erro).length ? ` Com erro: ${(fontes ?? []).filter((f) => f.erro).map((f) => f.valor).join(", ")}.` : ""}`,
    `Top referências: ${(refs ?? []).map((r) => `@${r.conta} (${r.formato}, nota ${r.nota}${r.motivo ? `: ${r.motivo}` : ""})`).join("; ") || "nenhuma"}.`,
    `Status possíveis: pauta (Bia escrevendo), revisar_copy (esperando o Kelvin aprovar a copy), copy_aprovada (Duda fazendo arte ou vídeo), revisar_arte (esperando o Kelvin aprovar a arte), agendado (Lara publica no horário), publicado, erro.`,
    `Calendário:\n${linhas.join("\n") || "- vazio (o Téo ainda vai montar)"}`,
    `Últimas mensagens do canal interno:\n${((canal ?? []) as { autor: string; para: string; texto: string }[]).reverse().map((m) => `- ${m.autor} → ${m.para}: ${m.texto.slice(0, 160)}`).join("\n") || "- nenhuma"}`,
  ].join("\n");
}

/** Kelvin fala com o time (grupo "time" ou um agente). Salva a conversa e aplica os pedidos de mudança. */
export async function conversar(para: string, texto: string) {
  const c = await lerConfig();
  await db().from("estudio_mensagens").insert({ autor: "kelvin", para, texto: texto.slice(0, 2000) });
  const filtro = para === "time" ? "para.eq.time" : `and(autor.eq.kelvin,para.eq.${para}),and(autor.eq.${para},para.eq.kelvin)`;
  const { data: hist } = await db().from("estudio_mensagens").select("autor,texto").or(filtro).order("id", { ascending: false }).limit(16);
  const historico = ((hist ?? []) as { autor: string; texto: string }[])
    .reverse()
    .slice(0, -1)
    .map((m) => `${m.autor === "kelvin" ? "Kelvin" : m.autor}: ${m.texto.slice(0, 400)}`)
    .join("\n");
  const r = await responderNoChat({ para, texto, historico, estado: await estadoParaChat(c) });
  const feitas: string[] = [];
  for (const a of r.acoes ?? []) {
    const { data: p } = await db().from("estudio_pautas").select("id,status,dia").eq("dia", a.dia).neq("status", "descartado").limit(1).maybeSingle();
    if (!p) continue;
    if (a.tipo === "mudar_formato" && a.formato && !["publicando", "publicado"].includes(p.status)) {
      await db().from("estudio_pautas").update({ formato: a.formato, status: "pauta", comentario: a.comentario.slice(0, 500), erro: null }).eq("id", p.id);
      feitas.push(`${dm(a.dia)}: vira ${NOME_FORMATO[a.formato]}, a Bia reescreve`);
    } else if (a.tipo === "trocar_tema" && !["publicando", "publicado"].includes(p.status)) {
      await db().from("estudio_pautas").update({ status: "descartado", comentario: a.comentario.slice(0, 500) }).eq("id", p.id);
      feitas.push(`${dm(a.dia)}: tema descartado, o Téo planeja outro`);
    } else if (a.tipo === "ajustar" && ["pauta", "revisar_copy"].includes(p.status)) {
      await db().from("estudio_pautas").update({ status: "pauta", comentario: a.comentario.slice(0, 500), erro: null }).eq("id", p.id);
      feitas.push(`${dm(a.dia)}: Bia refaz a copy`);
    } else if (a.tipo === "ajustar" && ["copy_aprovada", "revisar_arte", "agendado"].includes(p.status)) {
      await db().from("estudio_pautas").update({ status: "copy_aprovada", comentario: a.comentario.slice(0, 500), erro: null }).eq("id", p.id);
      feitas.push(`${dm(a.dia)}: Duda refaz a arte`);
    }
  }
  const destino = para === "time" ? "time" : "kelvin";
  for (const resp of r.respostas) await db().from("estudio_mensagens").insert({ autor: resp.agente, para: destino, texto: resp.texto });
  if (feitas.length) await registrar("vera", "kelvin", `Mudanças aplicadas pelo chat: ${feitas.join("; ")}.`);
  return { respostas: r.respostas, feitas };
}
