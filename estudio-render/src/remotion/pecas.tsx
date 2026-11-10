/**
 * Peças visuais da DemandIA (estilo editorial, referência V4 e concorrentes cadastrados):
 * foto grande, título condensado forte com palavras destacadas, numeração e chamada final.
 * Usado pelas lâminas do carrossel (1080×1350) e pelas cenas do reels (1080×1920).
 */
import type { CSSProperties, ReactNode } from "react";
import { Img } from "remotion";
import type { MarcaArte } from "./tipos";

export const limpar = (t: string | null | undefined) =>
  (t ?? "")
    .replace(/\s[—–]\s/g, ", ")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
export const semAsterisco = (t: string | null | undefined) => limpar(t).replace(/\*/g, "");

/** Tamanho do título pelo comprimento, para caber sem cortar. */
export function tamanhoTitulo(t: string, max: number): number {
  const n = semAsterisco(t).length;
  if (n <= 18) return max;
  if (n <= 32) return Math.round(max * 0.84);
  if (n <= 48) return Math.round(max * 0.7);
  if (n <= 70) return Math.round(max * 0.58);
  return Math.round(max * 0.5);
}

/**
 * Título com destaque: o que vier entre *asteriscos* ganha a cor de destaque (ou um marca-texto na capa).
 * `visiveis` permite animar palavra por palavra no reels.
 */
export function Titulo(p: { texto: string; tamanho: number; marca: MarcaArte; marcaTexto?: boolean; centro?: boolean; visiveis?: number; estilo?: CSSProperties }) {
  const partes = limpar(p.texto).split(/(\*[^*]+\*)/g).filter(Boolean);
  const palavras: { t: string; d: boolean }[] = [];
  for (const parte of partes) {
    const d = parte.startsWith("*") && parte.endsWith("*");
    for (const w of parte.replace(/\*/g, "").split(" ").filter(Boolean)) {
      // Pontuação colada no destaque ("*ao vivo*?") fica junto da palavra anterior
      if (/^[?!.,:;)]+$/.test(w) && palavras.length) palavras[palavras.length - 1].t += w;
      else palavras.push({ t: w.toUpperCase(), d });
    }
  }
  if (!palavras.some((w) => w.d) && palavras.length > 2) {
    // Sem destaque marcado pela copy: destaca as duas últimas palavras (onde costuma estar a ideia principal)
    palavras[palavras.length - 1].d = true;
    palavras[palavras.length - 2].d = true;
  }
  const c = p.marca.cores;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: p.centro ? "center" : "flex-start",
        fontFamily: "Titulo, Anton, Impact, sans-serif",
        fontSize: p.tamanho,
        lineHeight: 1.02,
        letterSpacing: -0.5,
        color: c.texto,
        textShadow: "0 4px 24px rgba(0,0,0,0.35)",
        ...p.estilo,
      }}
    >
      {palavras.map((w, i) => {
        const vis = p.visiveis === undefined ? 1 : Math.max(0, Math.min(1, p.visiveis - i));
        const destaque: CSSProperties = w.d
          ? p.marcaTexto
            ? { backgroundColor: c.destaque, color: "#fff", padding: `0 ${Math.round(p.tamanho * 0.12)}px`, borderRadius: Math.round(p.tamanho * 0.08), textShadow: "none" }
            : { color: c.destaque2 }
          : {};
        return (
          <span
            key={i}
            style={{
              marginRight: Math.round(p.tamanho * 0.22),
              marginBottom: Math.round(p.tamanho * 0.06),
              opacity: vis,
              transform: `translateY(${(1 - vis) * 30}px)`,
              ...destaque,
            }}
          >
            {w.t}
          </span>
        );
      })}
    </div>
  );
}

export function Logo(p: { marca: MarcaArte; altura?: number }) {
  const h = p.altura ?? 64;
  if (p.marca.logo) return <Img src={p.marca.logo} style={{ height: h, width: Math.round(h * p.marca.logoProporcao), objectFit: "contain" }} />;
  return (
    <div style={{ display: "flex", alignItems: "center", fontFamily: "Texto, Inter, sans-serif", fontWeight: 800, fontSize: Math.round(h * 0.56), letterSpacing: 0.3 }}>
      <span style={{ color: p.marca.cores.texto }}>Demand</span>
      <span style={{ color: p.marca.cores.destaque }}>IA</span>
    </div>
  );
}

/** Fundo da marca sem foto: degradê com brilho, nunca chapado. */
export function FundoMarca(p: { marca: MarcaArte; deslocamento?: number }) {
  const c = p.marca.cores;
  const d = p.deslocamento ?? 0;
  return (
    <div style={{ position: "absolute", inset: 0, backgroundColor: c.fundo, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1100, height: 1100, borderRadius: "50%", left: 380 + d, top: -420, background: `radial-gradient(circle, ${c.destaque}88 0%, ${c.destaque}00 65%)`, filter: "blur(20px)" }} />
      <div style={{ position: "absolute", width: 900, height: 900, borderRadius: "50%", left: -420 - d, bottom: -380, background: `radial-gradient(circle, ${c.fundo2} 0%, ${c.fundo2}00 70%)` }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${c.texto}08 1px, transparent 1px), linear-gradient(90deg, ${c.texto}08 1px, transparent 1px)`,
          backgroundSize: "54px 54px",
        }}
      />
    </div>
  );
}

/** Foto ocupando tudo, com degradê da marca embaixo para o texto ler bem. `zoom` e `x` animam no reels. */
export function FotoCheia(p: { foto: string; marca: MarcaArte; zoom?: number; x?: number; forca?: number }) {
  const f = p.marca.cores.fundo;
  const forca = p.forca ?? 1;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", backgroundColor: f }}>
      <Img src={p.foto} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${p.zoom ?? 1}) translateX(${p.x ?? 0}px)` }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, ${f}cc 0%, ${f}00 18%, ${f}00 ${Math.round(40 - 8 * forca)}%, ${f}d9 ${Math.round(68 - 6 * forca)}%, ${f} 100%)`,
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${p.marca.cores.destaque}22, transparent 45%)` }} />
    </div>
  );
}

export function Pilula(p: { children: ReactNode; marca: MarcaArte; cheia?: boolean; tamanho?: number }) {
  const c = p.marca.cores;
  const t = p.tamanho ?? 26;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: `${Math.round(t * 0.4)}px ${Math.round(t * 0.9)}px`,
        borderRadius: 999,
        fontFamily: "Texto, Inter, sans-serif",
        fontWeight: 700,
        fontSize: t,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: p.cheia ? "#fff" : c.texto,
        backgroundColor: p.cheia ? c.destaque : "rgba(255,255,255,0.10)",
        border: p.cheia ? "none" : "1.5px solid rgba(255,255,255,0.28)",
        backdropFilter: "blur(14px)",
      }}
    >
      {p.children}
    </div>
  );
}

export const Seta = (p: { cor: string; tamanho?: number }) => (
  <svg width={p.tamanho ?? 34} height={p.tamanho ?? 34} viewBox="0 0 24 24" fill="none">
    <path d="M5 12h14M13 6l6 6-6 6" stroke={p.cor} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Texto de apoio (corpo), com quebra automática e sem asteriscos. */
export function Corpo(p: { texto?: string; marca: MarcaArte; tamanho?: number; cor?: string; centro?: boolean; estilo?: CSSProperties }) {
  if (!p.texto) return null;
  return (
    <div
      style={{
        fontFamily: "Texto, Inter, sans-serif",
        fontWeight: 400,
        fontSize: p.tamanho ?? 36,
        lineHeight: 1.42,
        color: p.cor ?? "rgba(255,255,255,0.86)",
        textAlign: p.centro ? "center" : "left",
        ...p.estilo,
      }}
    >
      {semAsterisco(p.texto)}
    </div>
  );
}
