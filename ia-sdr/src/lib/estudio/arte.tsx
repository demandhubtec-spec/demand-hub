/**
 * Estúdio · Diretor de arte: transforma a copy aprovada em imagens 1080×1350 no visual da DemandIA
 * (fundo roxo escuro, título condensado em caixa alta, destaque lilás) e sobe no bucket público "estudio".
 * Margens de 90px: nada fica cortado no feed (4:5) nem na grade do perfil.
 */
import { ImageResponse } from "next/og";
import type { ReactElement, ReactNode } from "react";
import { db } from "../db.ts";
import { limparTexto } from "./regras.ts";
import type { CopyCarrossel, CopyEstatico } from "./ia.ts";

const W = 1080;
const H = 1350;
const COR = { fundo: "#0d0a1a", fundo2: "#1e1145", roxo: "#8b5cf6", lilas: "#c4b5fd", branco: "#ffffff", suave: "rgba(255,255,255,0.72)" };
const ASSINATURA = "A DemandIA trabalha. Você fatura.";

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
  try {
    const [anton, inter4, inter7] = await Promise.all([baixar("anton", 400), baixar("inter", 400), baixar("inter", 700)]);
    fontes = [
      { name: "Anton", data: anton, weight: 400, style: "normal" },
      { name: "Inter", data: inter4, weight: 400, style: "normal" },
      { name: "Inter", data: inter7, weight: 700, style: "normal" },
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
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700, letterSpacing: 0.5 }}>
        <span style={{ color: COR.branco }}>Demand</span>
        <span style={{ color: COR.roxo }}>IA</span>
      </div>
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
      <div style={{ display: "flex", fontFamily: "Anton", fontSize: tamanhoTitulo(titulo, 128), lineHeight: 1.05, color: COR.branco }}>{titulo}</div>
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
      <div style={{ display: "flex", fontFamily: "Anton", fontSize: 150, color: COR.roxo, lineHeight: 1 }}>{String(p.numero).padStart(2, "0")}</div>
      <div style={{ display: "flex", marginTop: 30, fontFamily: "Anton", fontSize: tamanhoTitulo(titulo, 92), lineHeight: 1.08, color: COR.branco }}>{titulo}</div>
      {p.texto ? <div style={{ display: "flex", marginTop: 36, fontSize: 38, lineHeight: 1.4, color: COR.suave }}>{limparTexto(p.texto)}</div> : null}
    </Moldura>
  );
}

function Chamada(p: { titulo: string; texto?: string; palavra: string | null; pagina?: string }) {
  return (
    <Moldura pagina={p.pagina}>
      {p.palavra ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: 64, color: COR.lilas, letterSpacing: 2 }}>COMENTA</div>
          <div style={{ display: "flex", marginTop: 10, padding: "10px 60px", backgroundColor: COR.roxo, borderRadius: 28, fontFamily: "Anton", fontSize: p.palavra.length > 8 ? 130 : 190, color: COR.branco }}>{p.palavra}</div>
          <div style={{ display: "flex", marginTop: 50, fontSize: 40, lineHeight: 1.35, color: COR.branco, textAlign: "center" }}>{limparTexto(p.texto || p.titulo)}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: tamanhoTitulo(p.titulo, 110), lineHeight: 1.05 }}>{limparTexto(p.titulo).toUpperCase()}</div>
          {p.texto ? <div style={{ display: "flex", marginTop: 36, fontSize: 40, lineHeight: 1.35, color: COR.lilas }}>{limparTexto(p.texto)}</div> : null}
        </div>
      )}
      <div style={{ display: "flex", marginTop: 70, fontSize: 32, fontWeight: 700, color: COR.roxo, justifyContent: p.palavra ? "center" : "flex-start" }}>{ASSINATURA}</div>
    </Moldura>
  );
}

async function png(el: ReactElement): Promise<Buffer> {
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
