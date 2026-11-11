/**
 * Carrossel contínuo (padrão V5, pedido do Kelvin em 10/11 comparando com a V4 Company).
 *
 * As lâminas são pedaços de uma tira só: o fundo, o brilho e o fio de luz atravessam de uma lâmina para a outra,
 * e cada lâmina mostra a próxima num botão embaixo. Cada lâmina é renderizada deslocando a tira inteira.
 *
 * Layouts: capa (pessoa recortada na frente do título gigante), cena (foto na moldura), imersiva (foto cheia),
 * chat (celular com a conversa da IA), lista (cartões) e chamada (a mesma pessoa da capa + a palavra para comentar).
 */
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img } from "remotion";
import { carregarFontes } from "./fontes";
import { Logo, limpar, semAsterisco } from "./pecas";
import type { MarcaArte, PropsCarrossel, SlideArte } from "./tipos";

export const L = 1080;
export const A = 1350;
const M = 84;

/** Partes do título: o que está entre *asteriscos* é destaque. */
function partes(t: string): { t: string; d: boolean }[] {
  return limpar(t)
    .split(/(\*[^*]+\*)/g)
    .filter(Boolean)
    .map((p) => ({ t: p.replace(/\*/g, ""), d: p.startsWith("*") && p.endsWith("*") }));
}

/** Título das lâminas de dentro: fonte forte, destaque com marca-texto na cor da marca. */
function TituloForte(p: { texto: string; marca: MarcaArte; tamanho?: number; cor?: string; centro?: boolean }) {
  const c = p.marca.cores;
  const n = semAsterisco(p.texto).length;
  const t = p.tamanho ?? (n <= 26 ? 74 : n <= 44 ? 64 : 56);
  return (
    <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 800, fontSize: t, lineHeight: 1.12, letterSpacing: -1, color: p.cor ?? c.texto, textAlign: p.centro ? "center" : "left" }}>
      {partes(p.texto).map((x, i) =>
        x.d ? (
          <span key={i} style={{ backgroundColor: c.destaque, color: "#fff", padding: `0 ${Math.round(t * 0.16)}px`, borderRadius: Math.round(t * 0.14), boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
            {x.t.trim()}
          </span>
        ) : (
          <span key={i}>{x.t}</span>
        ),
      )}
    </div>
  );
}

function Corpo(p: { texto?: string; tamanho?: number; centro?: boolean; estilo?: CSSProperties }) {
  if (!p.texto) return null;
  return (
    <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 400, fontSize: p.tamanho ?? 32, lineHeight: 1.45, color: "rgba(255,255,255,0.86)", textAlign: p.centro ? "center" : "left", ...p.estilo }}>
      {partes(p.texto).map((x, i) => (
        <span key={i} style={x.d ? { fontWeight: 700, color: "#fff" } : undefined}>
          {x.t}
        </span>
      ))}
    </div>
  );
}

/** Botão embaixo que puxa para a próxima lâmina (como "Primeiro, a briga →" nas referências). */
function Proximo(p: { texto: string; marca: MarcaArte; esquerda?: boolean }) {
  const c = p.marca.cores;
  return (
    <div style={{ position: "absolute", left: p.esquerda ? M : 0, right: 0, bottom: 62, display: "flex", justifyContent: p.esquerda ? "flex-start" : "center", zIndex: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          maxWidth: 640,
          padding: "18px 22px 18px 34px",
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.96)",
          color: c.fundo,
          fontFamily: "Texto, Inter, sans-serif",
          fontWeight: 700,
          fontSize: 27,
          boxShadow: `0 18px 50px ${c.destaque}66`,
        }}
      >
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.texto}</span>
        <span style={{ width: 46, height: 46, borderRadius: 999, backgroundColor: c.destaque, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

function Topo(p: { marca: MarcaArte; pagina?: string }) {
  return (
    <div style={{ position: "absolute", top: 62, left: M, right: M, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
      <Logo marca={p.marca} altura={56} />
      {p.pagina ? (
        <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 700, fontSize: 24, letterSpacing: 2, color: "rgba(255,255,255,0.7)" }}>{p.pagina}</div>
      ) : null}
    </div>
  );
}

/* ---------------- fundo contínuo (a tira inteira) ---------------- */

function FundoContinuo(p: { n: number; marca: MarcaArte; palavra: string | null }) {
  const c = p.marca.cores;
  const W = p.n * L;
  // Fio de luz que atravessa todas as lâminas
  const pontos: string[] = [];
  for (let x = -40; x <= W + 40; x += 40) {
    const y = 1000 + 150 * Math.sin(x / 520) + 60 * Math.sin(x / 190);
    pontos.push(`${x},${y.toFixed(1)}`);
  }
  const caminho = `M ${pontos.join(" L ")}`;
  const marca = (p.marca.arroba.replace(/^@/, "").replace(/[_.]/g, " ") || "DemandIA").toUpperCase();
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: A, overflow: "hidden", background: `linear-gradient(100deg, ${c.fundo} 0%, ${c.fundo2} 30%, ${c.fundo} 55%, ${c.fundo2} 80%, ${c.fundo} 100%)` }}>
      {/* brilhos em cima das emendas: começam numa lâmina e terminam na outra */}
      {Array.from({ length: p.n + 1 }, (_, k) => (
        <div
          key={k}
          style={{
            position: "absolute",
            left: k * L - 520,
            top: k % 2 ? 620 : -260,
            width: 1040,
            height: 1040,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${c.destaque}70 0%, ${c.destaque}00 62%)`,
          }}
        />
      ))}
      {/* palavra gigante vazada correndo pela tira */}
      <div
        style={{
          position: "absolute",
          top: 330,
          left: -200,
          width: W + 400,
          whiteSpace: "nowrap",
          fontFamily: "Titulo, Anton, sans-serif",
          fontSize: 560,
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: `2px ${c.texto}10`,
          letterSpacing: 10,
        }}
      >
        {Array.from({ length: Math.ceil(W / (marca.length * 260)) + 2 }, () => marca).join("  ·  ")}
      </div>
      {/* grade fina */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(${c.texto}07 1px, transparent 1px), linear-gradient(90deg, ${c.texto}07 1px, transparent 1px)`, backgroundSize: "54px 54px" }} />
      <svg width={W} height={A} style={{ position: "absolute", left: 0, top: 0 }}>
        <defs>
          <filter id="brilho" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        <path d={caminho} fill="none" stroke={c.destaque} strokeWidth={14} opacity={0.5} filter="url(#brilho)" />
        <path d={caminho} fill="none" stroke={c.destaque2} strokeWidth={3.5} opacity={0.9} />
      </svg>
    </div>
  );
}

/* ---------------- layouts ---------------- */

function Capa(p: { s: SlideArte; marca: MarcaArte }) {
  const c = p.marca.cores;
  const ps = partes(p.s.titulo);
  const temDestaque = ps.some((x) => x.d);
  const kicker = temDestaque ? ps.filter((x) => !x.d).map((x) => x.t).join(" ").replace(/\s+/g, " ").trim() : "";
  const gigante = (temDestaque ? ps.filter((x) => x.d).map((x) => x.t).join(" ") : semAsterisco(p.s.titulo)).toUpperCase();
  const palavras = gigante.split(/\s+/).filter(Boolean);
  const meio = Math.ceil(palavras.length / 2);
  const linhas = palavras.length > 2 ? [palavras.slice(0, meio).join(" "), palavras.slice(meio).join(" ")] : [gigante];
  const maior = Math.max(...linhas.map((l) => l.length));
  const tam = Math.min(260, Math.floor(940 / (Math.max(maior, 3) * 0.5)));
  const pessoa = p.s.foto;
  return (
    <>
      {pessoa ? (
        <>
          <div style={{ position: "absolute", left: 90, right: 90, top: 140, height: 900, borderRadius: "50%", background: `radial-gradient(circle, ${c.destaque}b0 0%, ${c.destaque}00 62%)` }} />
          <Img src={pessoa} style={{ position: "absolute", left: "50%", bottom: 0, height: 1180, transform: "translateX(-50%)", objectFit: "contain", filter: `drop-shadow(0 0 36px ${c.destaque}99)` }} />
        </>
      ) : null}
      {/* degradê embaixo para o título gigante ler bem por cima da pessoa */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 700, background: `linear-gradient(180deg, ${c.fundo}00 0%, ${c.fundo}cc 45%, ${c.fundo}f2 100%)` }} />
      <div style={{ position: "absolute", left: 40, right: 40, bottom: pessoa ? 175 : 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {kicker ? <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 800, fontSize: 50, color: c.texto, textAlign: "center", lineHeight: 1.1, marginBottom: 6, textShadow: "0 4px 24px rgba(0,0,0,0.6)" }}>{kicker}</div> : null}
        {linhas.map((l, i) => (
          <div key={i} style={{ fontFamily: "Titulo, Anton, sans-serif", fontSize: tam, lineHeight: 0.95, color: i === linhas.length - 1 ? c.destaque2 : c.texto, textAlign: "center", textShadow: `0 10px 50px ${c.fundo}` }}>
            {l}
          </div>
        ))}
        {p.s.texto ? (
          <div style={{ marginTop: 18, maxWidth: 880, padding: "14px 28px", borderRadius: 16, backgroundColor: c.destaque, color: "#fff", fontFamily: "Texto, Inter, sans-serif", fontWeight: 700, fontSize: 32, textAlign: "center", lineHeight: 1.25 }}>
            {semAsterisco(p.s.texto)}
          </div>
        ) : null}
      </div>
    </>
  );
}

function Cena(p: { s: SlideArte; marca: MarcaArte }) {
  const c = p.marca.cores;
  return (
    <>
      {p.s.foto ? (
        <div style={{ position: "absolute", top: 160, left: M, right: M, height: 600, borderRadius: 40, overflow: "hidden", border: "2px solid rgba(255,255,255,0.14)", boxShadow: `0 30px 90px rgba(0,0,0,0.55), 0 0 0 10px ${c.destaque}22` }}>
          <Img src={p.s.foto} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 35%" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 60%, ${c.fundo}aa 100%)` }} />
        </div>
      ) : null}
      <div style={{ position: "absolute", top: p.s.foto ? 810 : 300, left: M, right: M, display: "flex", flexDirection: "column", gap: 22 }}>
        <TituloForte texto={p.s.titulo} marca={p.marca} />
        <Corpo texto={p.s.texto} />
      </div>
    </>
  );
}

function Imersiva(p: { s: SlideArte; marca: MarcaArte }) {
  const f = p.marca.cores.fundo;
  return (
    <>
      {p.s.foto ? (
        <div style={{ position: "absolute", inset: 0 }}>
          <Img src={p.s.foto} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 25%" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${f}cc 0%, ${f}00 20%, ${f}00 38%, ${f}e6 64%, ${f} 100%)` }} />
        </div>
      ) : null}
      <div style={{ position: "absolute", left: M, right: M, bottom: 190, display: "flex", flexDirection: "column", gap: 22 }}>
        <TituloForte texto={p.s.titulo} marca={p.marca} />
        <Corpo texto={p.s.texto} />
      </div>
    </>
  );
}

function Chat(p: { s: SlideArte; marca: MarcaArte }) {
  const c = p.marca.cores;
  const msgs = (p.s.conversa ?? []).filter((m) => m.texto?.trim()).slice(0, 6);
  const hora = (i: number) => `14:${String(17 + i).padStart(2, "0")}`;
  return (
    <>
      <div style={{ position: "absolute", top: 160, left: M, right: M, display: "flex", flexDirection: "column", gap: 18 }}>
        <TituloForte texto={p.s.titulo} marca={p.marca} tamanho={60} />
        <Corpo texto={p.s.texto} tamanho={29} estilo={{ maxWidth: 860 }} />
      </div>
      {/* brilho atrás do celular */}
      <div style={{ position: "absolute", right: -120, bottom: -200, width: 900, height: 900, borderRadius: "50%", background: `radial-gradient(circle, ${c.destaque}88 0%, ${c.destaque}00 65%)` }} />
      {/* celular (desenhado, sem marca de aplicativo) */}
      <div
        style={{
          position: "absolute",
          left: 440,
          top: 400,
          width: 580,
          height: 1060,
          borderRadius: 74,
          backgroundColor: "#0b0b10",
          padding: 16,
          transform: "rotate(-5deg)",
          boxShadow: `0 40px 120px rgba(0,0,0,0.7), 0 0 0 3px rgba(255,255,255,0.12)`,
        }}
      >
        <div style={{ width: "100%", height: "100%", borderRadius: 60, overflow: "hidden", background: "linear-gradient(180deg, #f4f1fb 0%, #ece7f8 100%)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "46px 28px 20px", backgroundColor: c.fundo2 }}>
            <div style={{ width: 58, height: 58, borderRadius: 999, background: `linear-gradient(135deg, ${c.destaque}, ${c.destaque2})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "Texto, Inter, sans-serif", fontWeight: 800, fontSize: 24 }}>IA</div>
            <div style={{ fontFamily: "Texto, Inter, sans-serif", color: "#fff" }}>
              <div style={{ fontWeight: 700, fontSize: 26 }}>Atendimento</div>
              <div style={{ fontSize: 19, opacity: 0.75 }}>online agora</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "26px 22px" }}>
            {msgs.map((m, i) => {
              const ia = m.quem === "ia";
              return (
                <div key={i} style={{ display: "flex", justifyContent: ia ? "flex-end" : "flex-start" }}>
                  <div
                    style={{
                      maxWidth: "82%",
                      padding: "14px 18px 10px",
                      borderRadius: 24,
                      borderBottomRightRadius: ia ? 6 : 24,
                      borderBottomLeftRadius: ia ? 24 : 6,
                      backgroundColor: ia ? c.destaque : "#ffffff",
                      color: ia ? "#fff" : "#1b1630",
                      fontFamily: "Texto, Inter, sans-serif",
                      fontSize: 23,
                      lineHeight: 1.35,
                      boxShadow: "0 4px 14px rgba(20,10,40,0.10)",
                    }}
                  >
                    {semAsterisco(m.texto)}
                    <div style={{ fontSize: 15, opacity: 0.65, textAlign: "right", marginTop: 4 }}>{hora(i)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function Lista(p: { s: SlideArte; marca: MarcaArte }) {
  const c = p.marca.cores;
  const itens = (p.s.itens ?? []).filter((x) => x?.trim()).slice(0, 5);
  return (
    <div style={{ position: "absolute", top: 190, left: M, right: M, display: "flex", flexDirection: "column", gap: 22 }}>
      <TituloForte texto={p.s.titulo} marca={p.marca} />
      <Corpo texto={p.s.texto} tamanho={30} />
      <div style={{ display: "flex", flexDirection: "column", gap: 30, marginTop: 50 }}>
        {itens.map((it, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "36px 34px",
              borderRadius: 30,
              background: "linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.05))",
              border: "1.5px solid rgba(255,255,255,0.18)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.30)",
              marginLeft: i % 2 ? 40 : 0,
              marginRight: i % 2 ? 0 : 40,
            }}
          >
            <div style={{ width: 54, height: 54, borderRadius: 999, backgroundColor: c.destaque, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 0 30px ${c.destaque}aa` }}>
              <svg width={30} height={30} viewBox="0 0 24 24" fill="none">
                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 600, fontSize: 37, lineHeight: 1.3, color: "#fff" }}>{semAsterisco(it)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chamada(p: { s: SlideArte; marca: MarcaArte; palavra: string | null }) {
  const c = p.marca.cores;
  const pessoa = p.s.foto;
  return (
    <>
      {pessoa ? (
        <>
          <div style={{ position: "absolute", right: -220, bottom: -80, width: 900, height: 900, borderRadius: "50%", background: `radial-gradient(circle, ${c.destaque}aa 0%, ${c.destaque}00 65%)` }} />
          <Img src={pessoa} style={{ position: "absolute", right: -150, bottom: 0, height: 880, objectFit: "contain", filter: `drop-shadow(0 0 40px ${c.destaque}88)` }} />
        </>
      ) : null}
      <div style={{ position: "absolute", top: 190, left: M, width: pessoa ? 600 : L - 2 * M, display: "flex", flexDirection: "column", gap: 30, alignItems: pessoa ? "flex-start" : "center" }}>
        <TituloForte texto={p.s.titulo} marca={p.marca} tamanho={68} centro={!pessoa} />
        <Corpo texto={p.s.texto} tamanho={31} centro={!pessoa} />
        {p.palavra ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: pessoa ? "flex-start" : "center", marginTop: 10 }}>
            <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: 5, color: c.destaque2 }}>COMENTA</div>
            <div style={{ padding: "20px 56px", borderRadius: 999, backgroundColor: c.destaque, color: "#fff", fontFamily: "Titulo, Anton, sans-serif", fontSize: p.palavra.length > 9 ? 80 : 104, lineHeight: 1.05, boxShadow: `0 24px 70px ${c.destaque}aa` }}>
              {p.palavra.toUpperCase()}
            </div>
          </div>
        ) : null}
        <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 800, fontSize: 30, color: c.destaque2, marginTop: 10 }}>{p.marca.assinatura}</div>
      </div>
    </>
  );
}

function Lamina(p: { s: SlideArte; i: number; n: number; marca: MarcaArte; palavra: string | null }) {
  const { s } = p;
  let corpo: ReactNode;
  if (s.modelo === "capa") corpo = <Capa s={s} marca={p.marca} />;
  else if (s.modelo === "chat" && (s.conversa ?? []).length >= 2) corpo = <Chat s={s} marca={p.marca} />;
  else if (s.modelo === "lista" && (s.itens ?? []).length >= 2) corpo = <Lista s={s} marca={p.marca} />;
  else if (s.modelo === "chamada") corpo = <Chamada s={s} marca={p.marca} palavra={p.palavra} />;
  else if (s.modelo === "imersiva" && s.foto) corpo = <Imersiva s={s} marca={p.marca} />;
  else corpo = <Cena s={s} marca={p.marca} />;
  return (
    <div style={{ position: "absolute", left: p.i * L, top: 0, width: L, height: A, overflow: "hidden" }}>
      {corpo}
      <Topo marca={p.marca} pagina={p.i === 0 ? undefined : `${p.i + 1}/${p.n}`} />
      {p.i < p.n - 1 ? <Proximo texto={p.i === 0 ? "Arraste para o lado" : s.proximo || "Continua"} marca={p.marca} esquerda={s.modelo === "chat"} /> : null}
      {p.i > 0 ? <div style={{ position: "absolute", left: M, bottom: 24, fontFamily: "Texto, Inter, sans-serif", fontWeight: 600, fontSize: 20, color: "rgba(255,255,255,0.55)" }}>{p.marca.arroba}</div> : null}
    </div>
  );
}

/** Uma lâmina = a tira inteira deslocada até ela. */
export function Carrossel(p: PropsCarrossel) {
  carregarFontes(p.marca.fontes.titulo, p.marca.fontes.texto);
  const n = p.slides.length;
  return (
    <AbsoluteFill style={{ backgroundColor: p.marca.cores.fundo, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: -p.indice * L, width: n * L, height: A }}>
        <FundoContinuo n={n} marca={p.marca} palavra={p.palavra} />
        {p.slides.map((s, i) => (
          <Lamina key={i} s={s} i={i} n={n} marca={p.marca} palavra={p.palavra} />
        ))}
      </div>
    </AbsoluteFill>
  );
}
