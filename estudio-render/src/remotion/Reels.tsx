/**
 * Reels (1080×1920, 30 qps): cada cena do roteiro vira um trecho com a foto se movendo (zoom e deslize lentos),
 * o texto entrando palavra por palavra, barra de progresso no topo e transição suave entre as cenas.
 * A última cena é a chamada: "Comenta PALAVRA" com o botão pulsando.
 */
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { carregarFontes } from "./fontes";
import { Corpo, FotoCheia, FundoMarca, Logo, Titulo, semAsterisco, tamanhoTitulo } from "./pecas";
import type { CenaVideo, MarcaArte, PropsReels } from "./tipos";

export const FPS = 30;
export const TRANSICAO = 12; // quadros de sobreposição entre cenas

export function duracaoTotal(cenas: CenaVideo[]): number {
  const quadros = cenas.reduce((a, c) => a + Math.round(c.segundos * FPS), 0);
  return Math.max(FPS, quadros - TRANSICAO * Math.max(0, cenas.length - 1));
}

const M = 90;

function Cena(p: { cena: CenaVideo; indice: number; total: number; final: boolean; palavra: string | null; marca: MarcaArte; quadros: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = p.marca.cores;
  const entra = interpolate(f, [0, TRANSICAO], [0, 1], { extrapolateRight: "clamp" });
  const sai = interpolate(f, [p.quadros - TRANSICAO, p.quadros], [1, 0], { extrapolateLeft: "clamp" });
  const opacidade = p.indice === 0 ? sai : Math.min(entra, p.final ? 1 : sai);
  const zoom = interpolate(f, [0, p.quadros], [1.04, 1.16], { easing: Easing.inOut(Easing.quad) });
  const deslize = interpolate(f, [0, p.quadros], p.indice % 2 ? [-30, 30] : [30, -30]);
  const palavras = semAsterisco(p.cena.texto).split(" ").length;
  const visiveis = interpolate(f, [6, 6 + Math.min(palavras * 4, fps * 1.6)], [0, palavras + 1], { extrapolateRight: "clamp" });
  const subir = spring({ frame: f - 2, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ opacity: opacidade }}>
      {p.cena.foto ? <FotoCheia foto={p.cena.foto} marca={p.marca} zoom={zoom} x={deslize} forca={1.3} /> : <FundoMarca marca={p.marca} deslocamento={f * 1.2} />}
      {p.final && p.palavra ? (
        <Chamada palavra={p.palavra} texto={p.cena.texto} marca={p.marca} />
      ) : (
        <div style={{ position: "absolute", left: M, right: M, bottom: p.cena.foto ? 340 : 700, display: "flex", flexDirection: "column", gap: 34, transform: `translateY(${(1 - subir) * 60}px)` }}>
          {p.cena.destaque && !p.cena.foto ? (
            <div style={{ fontFamily: "Titulo, Anton, sans-serif", fontSize: p.cena.destaque.length > 6 ? 170 : 250, lineHeight: 1, color: c.destaque2 }}>{semAsterisco(p.cena.destaque).toUpperCase()}</div>
          ) : null}
          <div style={{ width: 130, height: 12, borderRadius: 12, backgroundColor: c.destaque }} />
          <Titulo texto={p.cena.texto} tamanho={tamanhoTitulo(p.cena.texto, 128)} marca={p.marca} marcaTexto={p.indice === 0} visiveis={visiveis} />
        </div>
      )}
    </AbsoluteFill>
  );
}

function Chamada(p: { palavra: string; texto: string; marca: MarcaArte }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = p.marca.cores;
  const entra = spring({ frame: f - 4, fps, config: { damping: 12, mass: 0.6 } });
  const pulso = 1 + 0.04 * Math.sin((f / fps) * Math.PI * 2);
  return (
    <div style={{ position: "absolute", left: M, right: M, top: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36, textAlign: "center" }}>
      <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 800, fontSize: 52, letterSpacing: 6, color: c.destaque2, opacity: entra }}>COMENTA</div>
      <div
        style={{
          padding: "30px 80px",
          borderRadius: 999,
          backgroundColor: c.destaque,
          color: "#fff",
          fontFamily: "Titulo, Anton, sans-serif",
          fontSize: p.palavra.length > 9 ? 130 : 180,
          transform: `scale(${entra * pulso})`,
          boxShadow: `0 30px 90px ${c.destaque}aa`,
        }}
      >
        {p.palavra.toUpperCase()}
      </div>
      <Corpo texto={p.texto} marca={p.marca} tamanho={50} centro cor="#fff" estilo={{ opacity: entra, marginTop: 20 }} />
      <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 800, fontSize: 40, color: c.destaque2, opacity: entra, marginTop: 30 }}>{p.marca.assinatura}</div>
    </div>
  );
}

function Moldura(p: { marca: MarcaArte; total: number }) {
  const f = useCurrentFrame();
  const progresso = Math.min(1, f / Math.max(1, p.total - 1));
  return (
    <>
      <div style={{ position: "absolute", top: 70, left: M, right: M, height: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.22)", overflow: "hidden" }}>
        <div style={{ width: `${progresso * 100}%`, height: "100%", backgroundColor: p.marca.cores.destaque2 }} />
      </div>
      <div style={{ position: "absolute", top: 120, left: M }}>
        <Logo marca={p.marca} altura={66} />
      </div>
      <div style={{ position: "absolute", bottom: 90, left: M, fontFamily: "Texto, Inter, sans-serif", fontWeight: 700, fontSize: 30, color: "rgba(255,255,255,0.75)" }}>{p.marca.arroba}</div>
    </>
  );
}

export function Reels(p: PropsReels) {
  carregarFontes(p.marca.fontes.titulo, p.marca.fontes.texto);
  const total = duracaoTotal(p.cenas);
  let inicio = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: p.marca.cores.fundo }}>
      {p.cenas.map((cena, i) => {
        const quadros = Math.round(cena.segundos * FPS);
        const de = inicio;
        inicio += quadros - TRANSICAO;
        return (
          <Sequence key={i} from={de} durationInFrames={quadros}>
            <Cena cena={cena} indice={i} total={p.cenas.length} final={i === p.cenas.length - 1} palavra={p.palavra} marca={p.marca} quadros={quadros} />
            {cena.voz ? <Audio src={cena.voz} volume={1} /> : null}
          </Sequence>
        );
      })}
      {p.trilha ? <Audio src={p.trilha} loop volume={(f) => interpolate(f, [0, 15, total - 30, total], [0, 0.14, 0.14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} /> : null}
      <Moldura marca={p.marca} total={total} />
    </AbsoluteFill>
  );
}
