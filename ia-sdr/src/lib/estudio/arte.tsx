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

/** Título com destaque: o que vier entre *asteriscos* sai na cor de destaque da marca. */
function Titulo(p: { texto: string; tamanho: number; cor?: string; caixaAlta?: boolean; centro?: boolean }) {
  const limpo = limparTexto(p.texto);
  const partes = limpo.split(/(\*[^*]+\*)/g).filter(Boolean);
  const palavras: { t: string; d: boolean }[] = [];
  for (const parte of partes) {
    const d = parte.startsWith("*") && parte.endsWith("*");
    for (const w of parte.replace(/\*/g, "").split(" ").filter(Boolean)) palavras.push({ t: p.caixaAlta ? w.toUpperCase() : w, d });
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: p.centro ? "center" : "flex-start", fontFamily: FONTE_TITULO, fontSize: p.tamanho, lineHeight: 1.06, color: p.cor ?? COR.branco }}>
      {palavras.map((w, i) => (
        <span key={i} style={{ color: w.d ? COR.lilas : undefined, marginRight: Math.round(p.tamanho * 0.24) }}>
          {w.t}
        </span>
      ))}
    </div>
  );
}

/** Tira os asteriscos de destaque (para textos que não usam o componente Titulo). */
const semMarca = (t: string | null | undefined) => limparTexto(t).replace(/\*/g, "");

function Logo() {
  return LOGO ? (
    <img src={LOGO} width={Math.round(72 * LOGO_PROPORCAO)} height={72} style={{ width: Math.round(72 * LOGO_PROPORCAO), height: 72, objectFit: "contain" }} />
  ) : (
    <div style={{ display: "flex", alignItems: "center", fontSize: 38, fontWeight: 700, letterSpacing: 0.5 }}>
      <span style={{ color: COR.branco }}>Demand</span>
      <span style={{ color: COR.roxo }}>IA</span>
    </div>
  );
}

/** Moldura de toda peça: logo em cima, conteúdo, rodapé. Com foto, ela cobre o fundo e um degradê garante a leitura. */
function Moldura(p: { children: ReactNode; pagina?: string; seta?: boolean; foto?: string | null; alinhar?: "center" | "flex-end" | "flex-start" }) {
  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", backgroundColor: COR.fundo, color: COR.branco, fontFamily: FONTE_TEXTO }}>
      {p.foto ? (
        <img src={p.foto} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", backgroundImage: `radial-gradient(circle at 80% 15%, ${COR.fundo2} 0%, ${COR.fundo} 60%)` }} />
      )}
      {p.foto ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            display: "flex",
            backgroundImage: `linear-gradient(180deg, ${COR.fundo}99 0%, ${COR.fundo}00 22%, ${COR.fundo}00 38%, ${COR.fundo}e6 66%, ${COR.fundo} 100%)`,
          }}
        />
      ) : null}
      <div style={{ position: "relative", width: W, height: H, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 90 }}>
        <Logo />
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: p.alinhar ?? "center" }}>{p.children}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: COR.suave }}>
          <span>@demand_ia</span>
          <span>{p.seta ? "arraste para o lado" : p.pagina ?? ""}</span>
        </div>
      </div>
    </div>
  );
}

function Capa(p: { titulo: string; texto?: string; pagina?: string; seta?: boolean; foto?: string | null }) {
  const titulo = limparTexto(p.titulo);
  return (
    <Moldura pagina={p.pagina} seta={p.seta} foto={p.foto} alinhar={p.foto ? "flex-end" : "center"}>
      <div style={{ display: "flex", width: 120, height: 10, backgroundColor: COR.roxo, marginBottom: 36 }} />
      <Titulo texto={titulo} tamanho={tamanhoTitulo(titulo.replace(/\*/g, ""), p.foto ? 112 : 128)} caixaAlta />
      {p.texto ? <div style={{ display: "flex", marginTop: 32, fontSize: 40, lineHeight: 1.35, color: p.foto ? COR.branco : COR.lilas }}>{semMarca(p.texto)}</div> : null}
    </Moldura>
  );
}

function Miolo(p: { numero: number; titulo: string; texto?: string; pagina: string; foto?: string | null }) {
  const titulo = limparTexto(p.titulo);
  const tam = tamanhoTitulo(titulo.replace(/\*/g, ""), p.foto ? 76 : 92);
  if (p.foto) {
    // Foto em cima (cantos arredondados), número, título e texto embaixo: o layout que mais aparece nos carrosséis da V4
    return (
      <Moldura pagina={p.pagina} alinhar="flex-start">
        <div style={{ display: "flex", marginTop: 34, width: W - 180, height: 520, borderRadius: 36, overflow: "hidden" }}>
          <img src={p.foto} width={W - 180} height={520} style={{ width: W - 180, height: 520, objectFit: "cover" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 40 }}>
          <div style={{ display: "flex", padding: "6px 22px", borderRadius: 999, backgroundColor: COR.roxo, fontFamily: FONTE_TITULO, fontSize: 40, color: COR.branco }}>{String(p.numero).padStart(2, "0")}</div>
        </div>
        <div style={{ display: "flex", marginTop: 22 }}>
          <Titulo texto={titulo} tamanho={tam} caixaAlta />
        </div>
        {p.texto ? <div style={{ display: "flex", marginTop: 20, fontSize: 34, lineHeight: 1.4, color: COR.suave }}>{semMarca(p.texto)}</div> : null}
      </Moldura>
    );
  }
  return (
    <Moldura pagina={p.pagina}>
      <div style={{ display: "flex", fontFamily: FONTE_TITULO, fontSize: 150, color: COR.roxo, lineHeight: 1 }}>{String(p.numero).padStart(2, "0")}</div>
      <div style={{ display: "flex", marginTop: 30 }}>
        <Titulo texto={titulo} tamanho={tam} caixaAlta />
      </div>
      {p.texto ? (
        <div style={{ display: "flex", marginTop: 40, paddingLeft: 30, borderLeft: `8px solid ${COR.roxo}`, fontSize: 40, lineHeight: 1.4, color: COR.branco }}>{semMarca(p.texto)}</div>
      ) : null}
    </Moldura>
  );
}

function Chamada(p: { titulo: string; texto?: string; palavra: string | null; pagina?: string; foto?: string | null }) {
  return (
    <Moldura pagina={p.pagina} foto={p.foto} alinhar={p.foto ? "flex-end" : "center"}>
      {p.palavra ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontFamily: FONTE_TITULO, fontSize: 64, color: COR.lilas, letterSpacing: 2 }}>COMENTA</div>
          <div style={{ display: "flex", marginTop: 10, padding: "10px 60px", backgroundColor: COR.roxo, borderRadius: 28, fontFamily: FONTE_TITULO, fontSize: p.palavra.length > 8 ? (p.foto ? 100 : 130) : p.foto ? 130 : 190, color: COR.branco }}>{p.palavra}</div>
          <div style={{ display: "flex", marginTop: 36, fontSize: 38, lineHeight: 1.35, color: COR.branco, textAlign: "center" }}>{semMarca(p.texto || p.titulo)}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Titulo texto={limparTexto(p.titulo)} tamanho={tamanhoTitulo(semMarca(p.titulo), 110)} caixaAlta />
          {p.texto ? <div style={{ display: "flex", marginTop: 36, fontSize: 40, lineHeight: 1.35, color: COR.lilas }}>{semMarca(p.texto)}</div> : null}
        </div>
      )}
      <div style={{ display: "flex", marginTop: 60, fontSize: 32, fontWeight: 700, color: COR.lilas, justifyContent: p.palavra ? "center" : "flex-start" }}>{ASSINATURA}</div>
    </Moldura>
  );
}

export async function png(el: ReactElement): Promise<Buffer> {
  const fonts = await carregarFontes();
  const r = new ImageResponse(el, { width: W, height: H, ...(fonts.length ? { fonts } : {}) });
  return Buffer.from(await r.arrayBuffer());
}

/** As imagens (PNG) de um carrossel: capa, um ponto por lâmina e a chamada final. `fotos`: índice da lâmina → foto. */
export async function imagensCarrossel(c: CopyCarrossel, palavra: string | null, fotos: Map<number, string> = new Map()): Promise<Buffer[]> {
  const slides = (c.slides ?? []).filter((s) => s.titulo).slice(0, 10);
  const total = slides.length;
  const out: Buffer[] = [];
  for (let i = 0; i < total; i++) {
    const s = slides[i];
    const pagina = `${i + 1}/${total}`;
    const foto = fotos.get(i) ?? null;
    if (i === 0) out.push(await png(<Capa titulo={s.titulo} texto={s.texto} seta foto={foto} />));
    else if (i === total - 1) out.push(await png(<Chamada titulo={s.titulo} texto={s.texto} palavra={palavra} pagina={pagina} foto={foto} />));
    else out.push(await png(<Miolo numero={i} titulo={s.titulo} texto={s.texto} pagina={pagina} foto={foto} />));
  }
  return out;
}

/** A imagem de um post estático. Com palavra-chave, vira o modelo de chamada. */
export async function imagemEstatico(c: CopyEstatico, palavra: string | null): Promise<Buffer[]> {
  if (palavra) return [await png(<Chamada titulo={c.titulo} texto={c.subtitulo} palavra={palavra} />)];
  return [await png(<Capa titulo={c.titulo} texto={c.subtitulo} />)];
}

function CenaReels(p: { texto: string; destaque?: string; numero: number; total: number; final?: boolean; palavra?: string | null; foto?: string | null }) {
  const texto = limparTexto(p.texto);
  return (
    <Moldura pagina={`${p.numero}/${p.total}`} foto={p.foto} alinhar={p.foto ? "flex-end" : "center"}>
      {p.final && p.palavra ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: p.foto ? 120 : 0 }}>
          <div style={{ display: "flex", fontFamily: FONTE_TITULO, fontSize: 80, color: COR.lilas, letterSpacing: 2 }}>COMENTA</div>
          <div style={{ display: "flex", marginTop: 16, padding: "14px 70px", backgroundColor: COR.roxo, borderRadius: 32, fontFamily: FONTE_TITULO, fontSize: p.palavra.length > 8 ? 140 : 200, color: COR.branco }}>{p.palavra}</div>
          <div style={{ display: "flex", marginTop: 60, fontSize: 52, lineHeight: 1.3, color: COR.branco, textAlign: "center" }}>{semMarca(texto)}</div>
          <div style={{ display: "flex", marginTop: 80, fontSize: 38, fontWeight: 700, color: COR.lilas }}>{ASSINATURA}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", marginBottom: p.foto ? 160 : 0 }}>
          {p.destaque ? <div style={{ display: "flex", fontFamily: FONTE_TITULO, fontSize: p.destaque.length > 6 ? 150 : 230, color: COR.lilas, lineHeight: 1 }}>{semMarca(p.destaque).toUpperCase()}</div> : null}
          <div style={{ display: "flex", width: 140, height: 12, backgroundColor: COR.roxo, marginTop: p.destaque ? 40 : 0, marginBottom: 44 }} />
          <Titulo texto={texto} tamanho={tamanhoTitulo(semMarca(texto), 120)} caixaAlta />
        </div>
      )}
    </Moldura>
  );
}

/** Quadros do reels (1080×1920): uma imagem por cena, a duração de cada uma e a capa. `fotos`: índice da cena → foto. */
export async function imagensReels(c: CopyReels, palavra: string | null, fotos: Map<number, string> = new Map()): Promise<{ quadros: Buffer[]; duracoes: number[]; capa: Buffer }> {
  const cenas = (c.cenas ?? []).filter((x) => x.texto_tela?.trim()).slice(0, 10);
  if (!cenas.length) throw new Error("roteiro sem cenas");
  usarAltura(1920);
  try {
    const quadros: Buffer[] = [];
    const duracoes: number[] = [];
    for (let i = 0; i < cenas.length; i++) {
      const cena = cenas[i];
      const final = i === cenas.length - 1;
      const foto = fotos.get(i) ?? null;
      quadros.push(await png(<CenaReels texto={cena.texto_tela} destaque={!final && !foto ? cena.imagem?.trim().slice(0, 12) || undefined : undefined} numero={i + 1} total={cenas.length} final={final} palavra={palavra} foto={foto} />));
      duracoes.push(duracaoDaCena(cena.tempo) + (final ? 1 : 0));
    }
    const capa = await png(<Capa titulo={c.capa_titulo || cenas[0].texto_tela} foto={fotos.get(0) ?? null} />);
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
