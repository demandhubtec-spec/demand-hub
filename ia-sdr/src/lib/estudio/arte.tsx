/**
 * Estúdio · Diretor de arte: transforma a copy aprovada em imagens 1080×1350 no visual da DemandIA
 * (fundo roxo escuro, título condensado em caixa alta, destaque lilás) e sobe no bucket público "estudio".
 * Margens de 90px: nada fica cortado no feed (4:5) nem na grade do perfil.
 */
import { ImageResponse } from "next/og";
import type { ReactElement, ReactNode } from "react";
import { db } from "../db.ts";
import { limparTexto } from "./regras.ts";
import { duracaoDaCena } from "./video-args.ts";
import type { CopyCarrossel, CopyEstatico, CopyReels, Marca } from "./ia.ts";

const W = 1080;
let H = 1350;
const PADRAO = { fundo: "#0d0a1a", fundo2: "#1e1145", roxo: "#8b5cf6", lilas: "#c4b5fd", branco: "#ffffff", suave: "rgba(255,255,255,0.72)" };
export const COR = { ...PADRAO };
let ASSINATURA = "A DemandIA trabalha. Você fatura.";
let LOGO: string | null = null;
/** Largura ÷ altura da logo (o portal mede quando ela sobe). */
let LOGO_PROPORCAO = 3;
const FONTE_TITULO = "Titulo";
const FONTE_TEXTO = "Texto";
let familias = { titulo: "anton", texto: "inter" };

const hex = (c: string | undefined) => (c && /^#[0-9a-f]{3,8}$/i.test(c.trim()) ? c.trim() : undefined);
/** Nome da fonte no Fontsource: "Montserrat Bold" → "montserrat". */
const familia = (f: string | undefined) => (f ?? "").toLowerCase().replace(/\b(regular|bold|black|light|medium|semibold|extrabold|italic|\d{3})\b/g, "").trim().replace(/\s+/g, "-");

/** Aplica o manual de marca (cores, fontes, logo e assinatura) nas próximas artes. */
export async function usarMarca(m: Marca | null | undefined) {
  Object.assign(COR, PADRAO, {
    fundo: hex(m?.cores?.fundo) ?? PADRAO.fundo,
    fundo2: hex(m?.cores?.fundo2) ?? PADRAO.fundo2,
    roxo: hex(m?.cores?.destaque) ?? PADRAO.roxo,
    lilas: hex(m?.cores?.destaque2) ?? PADRAO.lilas,
    branco: hex(m?.cores?.texto) ?? PADRAO.branco,
  });
  ASSINATURA = m?.assinatura?.trim() || "A DemandIA trabalha. Você fatura.";
  LOGO = m?.logo_url?.trim() || null;
  LOGO_PROPORCAO = m?.logo_proporcao && m.logo_proporcao > 0.2 && m.logo_proporcao < 12 ? m.logo_proporcao : 3;
  const novas = { titulo: familia(m?.fontes?.titulo) || "anton", texto: familia(m?.fontes?.texto) || "inter" };
  if (novas.titulo !== familias.titulo || novas.texto !== familias.texto) {
    familias = novas;
    fontes = null;
  }
}

/** Altura da peça: 1350 (feed 4:5) ou 1920 (reels 9:16). */
export function usarAltura(h: 1350 | 1920) {
  H = h;
}

type Fonte = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };
let fontes: Fonte[] | null = null;

async function carregarFontes(): Promise<Fonte[]> {
  if (fontes) return fontes;
  // Dois endereços por fonte: o CDN do Fontsource e o pacote npm servido pelo jsDelivr
  const baixar = async (familia: string, peso: number) => {
    const urls = [
      `https://cdn.jsdelivr.net/fontsource/fonts/${familia}@latest/latin-${peso}-normal.woff`,
      `https://cdn.jsdelivr.net/npm/@fontsource/${familia}@5/files/${familia}-latin-${peso}-normal.woff`,
    ];
    for (const url of urls) {
      const r = await fetch(url).catch(() => null);
      if (r?.ok) return r.arrayBuffer();
    }
    throw new Error(`fonte ${familia} ${peso} indisponível`);
  };
  const tentar = async (fam: string, padrao: string, peso: number) => baixar(fam, peso).catch(() => baixar(fam, 400)).catch(() => baixar(padrao, peso === 700 && padrao === "anton" ? 400 : peso));
  try {
    const [titulo, texto4, texto7] = await Promise.all([
      tentar(familias.titulo, "anton", familias.titulo === "anton" ? 400 : 700),
      tentar(familias.texto, "inter", 400),
      tentar(familias.texto, "inter", 700),
    ]);
    fontes = [
      { name: "Titulo", data: titulo, weight: 400, style: "normal" },
      { name: "Texto", data: texto4, weight: 400, style: "normal" },
      { name: "Texto", data: texto7, weight: 700, style: "normal" },
    ];
  } catch (e) {
    console.error("Estúdio: fontes da marca indisponíveis, usando a padrão", e);
    fontes = [];
  }
  return fontes;
}

/** Tamanho do título pelo comprimento, para caber sem cortar. */
function tamanhoTitulo(t: string, max: number): number {
  const n = t.length;
  if (n <= 20) return max;
  if (n <= 40) return Math.round(max * 0.8);
  if (n <= 60) return Math.round(max * 0.66);
  return Math.round(max * 0.55);
}

function Moldura(p: { children: ReactNode; pagina?: string; seta?: boolean }) {
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 90,
        backgroundColor: COR.fundo,
        backgroundImage: `radial-gradient(circle at 80% 15%, ${COR.fundo2} 0%, ${COR.fundo} 60%)`,
        color: COR.branco,
        fontFamily: FONTE_TEXTO,
      }}
    >
      {LOGO ? (
        <img src={LOGO} width={Math.round(56 * LOGO_PROPORCAO)} height={56} style={{ width: Math.round(56 * LOGO_PROPORCAO), height: 56, objectFit: "contain" }} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700, letterSpacing: 0.5 }}>
          <span style={{ color: COR.branco }}>Demand</span>
          <span style={{ color: COR.roxo }}>IA</span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>{p.children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: COR.suave }}>
        <span>@demand_ia</span>
        <span>{p.seta ? "arraste para o lado" : p.pagina ?? ""}</span>
      </div>
    </div>
  );
}

function Capa(p: { titulo: string; texto?: string; pagina?: string; seta?: boolean }) {
  const titulo = limparTexto(p.titulo).toUpperCase();
  return (
    <Moldura pagina={p.pagina} seta={p.seta}>
      <div style={{ display: "flex", width: 120, height: 10, backgroundColor: COR.roxo, marginBottom: 40 }} />
      <div style={{ display: "flex", fontFamily: FONTE_TITULO, fontSize: tamanhoTitulo(titulo, 128), lineHeight: 1.05, color: COR.branco }}>{titulo}</div>
      {p.texto ? (
        <div style={{ display: "flex", marginTop: 40, fontSize: 40, lineHeight: 1.35, color: COR.lilas }}>{limparTexto(p.texto)}</div>
      ) : null}
    </Moldura>
  );
}

function Miolo(p: { numero: number; titulo: string; texto?: string; pagina: string }) {
  const titulo = limparTexto(p.titulo).toUpperCase();
  return (
    <Moldura pagina={p.pagina}>
      <div style={{ display: "flex", fontFamily: FONTE_TITULO, fontSize: 150, color: COR.roxo, lineHeight: 1 }}>{String(p.numero).padStart(2, "0")}</div>
      <div style={{ display: "flex", marginTop: 30, fontFamily: FONTE_TITULO, fontSize: tamanhoTitulo(titulo, 92), lineHeight: 1.08, color: COR.branco }}>{titulo}</div>
      {p.texto ? <div style={{ display: "flex", marginTop: 36, fontSize: 38, lineHeight: 1.4, color: COR.suave }}>{limparTexto(p.texto)}</div> : null}
    </Moldura>
  );
}

function Chamada(p: { titulo: string; texto?: string; palavra: string | null; pagina?: string }) {
  return (
    <Moldura pagina={p.pagina}>
      {p.palavra ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontFamily: FONTE_TITULO, fontSize: 64, color: COR.lilas, letterSpacing: 2 }}>COMENTA</div>
          <div style={{ display: "flex", marginTop: 10, padding: "10px 60px", backgroundColor: COR.roxo, borderRadius: 28, fontFamily: FONTE_TITULO, fontSize: p.palavra.length > 8 ? 130 : 190, color: COR.branco }}>{p.palavra}</div>
          <div style={{ display: "flex", marginTop: 50, fontSize: 40, lineHeight: 1.35, color: COR.branco, textAlign: "center" }}>{limparTexto(p.texto || p.titulo)}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: FONTE_TITULO, fontSize: tamanhoTitulo(p.titulo, 110), lineHeight: 1.05 }}>{limparTexto(p.titulo).toUpperCase()}</div>
          {p.texto ? <div style={{ display: "flex", marginTop: 36, fontSize: 40, lineHeight: 1.35, color: COR.lilas }}>{limparTexto(p.texto)}</div> : null}
        </div>
      )}
      <div style={{ display: "flex", marginTop: 70, fontSize: 32, fontWeight: 700, color: COR.roxo, justifyContent: p.palavra ? "center" : "flex-start" }}>{ASSINATURA}</div>
    </Moldura>
  );
}

export async function png(el: ReactElement): Promise<Buffer> {
  const fonts = await carregarFontes();
  const r = new ImageResponse(el, { width: W, height: H, ...(fonts.length ? { fonts } : {}) });
  return Buffer.from(await r.arrayBuffer());
}

/** As imagens (PNG) de um carrossel: capa, um ponto por lâmina e a chamada final. */
export async function imagensCarrossel(c: CopyCarrossel, palavra: string | null): Promise<Buffer[]> {
  const slides = (c.slides ?? []).filter((s) => s.titulo).slice(0, 10);
  const total = slides.length;
  const out: Buffer[] = [];
  for (let i = 0; i < total; i++) {
    const s = slides[i];
    const pagina = `${i + 1}/${total}`;
    if (i === 0) out.push(await png(<Capa titulo={s.titulo} texto={s.texto} seta />));
    else if (i === total - 1) out.push(await png(<Chamada titulo={s.titulo} texto={s.texto} palavra={palavra} pagina={pagina} />));
    else out.push(await png(<Miolo numero={i} titulo={s.titulo} texto={s.texto} pagina={pagina} />));
  }
  return out;
}

/** A imagem de um post estático. Com palavra-chave, vira o modelo de chamada. */
export async function imagemEstatico(c: CopyEstatico, palavra: string | null): Promise<Buffer[]> {
  if (palavra) return [await png(<Chamada titulo={c.titulo} texto={c.subtitulo} palavra={palavra} />)];
  return [await png(<Capa titulo={c.titulo} texto={c.subtitulo} />)];
}

function CenaReels(p: { texto: string; destaque?: string; numero: number; total: number; final?: boolean; palavra?: string | null }) {
  const texto = limparTexto(p.texto);
  return (
    <Moldura pagina={`${p.numero}/${p.total}`}>
      {p.final && p.palavra ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontFamily: FONTE_TITULO, fontSize: 80, color: COR.lilas, letterSpacing: 2 }}>COMENTA</div>
          <div style={{ display: "flex", marginTop: 16, padding: "14px 70px", backgroundColor: COR.roxo, borderRadius: 32, fontFamily: FONTE_TITULO, fontSize: p.palavra.length > 8 ? 140 : 200, color: COR.branco }}>{p.palavra}</div>
          <div style={{ display: "flex", marginTop: 60, fontSize: 52, lineHeight: 1.3, color: COR.branco, textAlign: "center" }}>{texto}</div>
          <div style={{ display: "flex", marginTop: 80, fontSize: 38, fontWeight: 700, color: COR.roxo }}>{ASSINATURA}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {p.destaque ? <div style={{ display: "flex", fontFamily: FONTE_TITULO, fontSize: p.destaque.length > 6 ? 150 : 230, color: COR.roxo, lineHeight: 1 }}>{limparTexto(p.destaque).toUpperCase()}</div> : null}
          <div style={{ display: "flex", width: 140, height: 12, backgroundColor: COR.roxo, marginTop: p.destaque ? 40 : 0, marginBottom: 44 }} />
          <div style={{ display: "flex", fontFamily: FONTE_TITULO, fontSize: tamanhoTitulo(texto, 120), lineHeight: 1.08, color: COR.branco }}>{texto.toUpperCase()}</div>
        </div>
      )}
    </Moldura>
  );
}

/** Quadros do reels (1080×1920): uma imagem por cena, a duração de cada uma e a capa. */
export async function imagensReels(c: CopyReels, palavra: string | null): Promise<{ quadros: Buffer[]; duracoes: number[]; capa: Buffer }> {
  const cenas = (c.cenas ?? []).filter((x) => x.texto_tela?.trim()).slice(0, 10);
  if (!cenas.length) throw new Error("roteiro sem cenas");
  usarAltura(1920);
  try {
    const quadros: Buffer[] = [];
    const duracoes: number[] = [];
    for (let i = 0; i < cenas.length; i++) {
      const cena = cenas[i];
      const final = i === cenas.length - 1;
      quadros.push(await png(<CenaReels texto={cena.texto_tela} destaque={!final ? cena.imagem?.trim().slice(0, 12) || undefined : undefined} numero={i + 1} total={cenas.length} final={final} palavra={palavra} />));
      duracoes.push(duracaoDaCena(cena.tempo) + (final ? 1 : 0));
    }
    const capa = await png(<Capa titulo={c.capa_titulo || cenas[0].texto_tela} />);
    return { quadros, duracoes, capa };
  } finally {
    usarAltura(1350);
  }
}

/** Sobe as imagens no bucket público e devolve os links. */
export async function subirImagens(pautaId: string, versao: number, imagens: Buffer[]): Promise<string[]> {
  const links: string[] = [];
  for (let i = 0; i < imagens.length; i++) {
    const caminho = `pautas/${pautaId}/v${versao}-${String(i + 1).padStart(2, "0")}.png`;
    const { error } = await db().storage.from("estudio").upload(caminho, imagens[i], { contentType: "image/png", upsert: true });
    if (error) throw new Error(`upload da arte: ${error.message}`);
    links.push(db().storage.from("estudio").getPublicUrl(caminho).data.publicUrl);
  }
  return links;
}
