/**
 * Lâmina do carrossel (1080×1350). Cinco modelos:
 *  capa      foto cheia com pessoa real, título enorme com marca-texto, "arraste"
 *  foto      foto grande em cima (cantos arredondados), número sobreposto, título e texto
 *  imersiva  foto cheia com o texto embaixo (quebra o ritmo entre as lâminas de foto)
 *  destaque  sem foto: frase de impacto sobre o fundo da marca, número gigante vazado
 *  chamada   fecho: "Comenta PALAVRA" em botão, assinatura da marca
 */
import { AbsoluteFill } from "remotion";
import { carregarFontes } from "./fontes";
import { Corpo, FotoCheia, FundoMarca, Logo, Pilula, Seta, Titulo, tamanhoTitulo } from "./pecas";
import type { MarcaArte, PropsLamina } from "./tipos";

const M = 84; // margem: nada corta no feed (4:5) nem na grade do perfil

function Topo(p: { marca: MarcaArte; pagina?: string }) {
  return (
    <div style={{ position: "absolute", top: M - 10, left: M, right: M, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Logo marca={p.marca} altura={58} />
      {p.pagina ? (
        <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 700, fontSize: 24, color: "rgba(255,255,255,0.75)", letterSpacing: 2 }}>{p.pagina}</div>
      ) : null}
    </div>
  );
}

function Rodape(p: { marca: MarcaArte; seta?: boolean }) {
  return (
    <div style={{ position: "absolute", bottom: M - 16, left: M, right: M, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 600, fontSize: 24, color: "rgba(255,255,255,0.7)" }}>{p.marca.arroba}</div>
      {p.seta ? (
        <Pilula marca={p.marca} cheia tamanho={24}>
          Arraste <Seta cor="#fff" tamanho={28} />
        </Pilula>
      ) : null}
    </div>
  );
}

function Capa(p: PropsLamina) {
  const c = p.marca.cores;
  return (
    <AbsoluteFill>
      {p.foto ? <FotoCheia foto={p.foto} marca={p.marca} forca={1.2} /> : <FundoMarca marca={p.marca} />}
      <Topo marca={p.marca} />
      <div style={{ position: "absolute", left: M, right: M, bottom: 190, display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ width: 110, height: 10, borderRadius: 10, backgroundColor: c.destaque }} />
        <Titulo texto={p.titulo} tamanho={tamanhoTitulo(p.titulo, 124)} marca={p.marca} marcaTexto />
        <Corpo texto={p.texto} marca={p.marca} tamanho={38} cor="rgba(255,255,255,0.92)" />
      </div>
      <Rodape marca={p.marca} seta />
    </AbsoluteFill>
  );
}

function Numero(p: { n: number; marca: MarcaArte; grande?: boolean }) {
  const c = p.marca.cores;
  const t = p.grande ? 120 : 92;
  return (
    <div
      style={{
        width: t,
        height: t,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.destaque,
        color: "#fff",
        fontFamily: "Titulo, Anton, sans-serif",
        fontSize: Math.round(t * 0.46),
        boxShadow: `0 14px 40px ${c.destaque}88, 0 0 0 8px ${c.fundo}`,
      }}
    >
      {String(p.n).padStart(2, "0")}
    </div>
  );
}

function ComFoto(p: PropsLamina) {
  const c = p.marca.cores;
  const alturaFoto = 608; // 912 × 608 = 3:2, o mesmo formato da foto horizontal: nada corta
  return (
    <AbsoluteFill>
      <FundoMarca marca={p.marca} />
      <Topo marca={p.marca} pagina={p.pagina} />
      <div style={{ position: "absolute", top: 170, left: M, right: M, height: alturaFoto, borderRadius: 44, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.55)" }}>
        <FotoCheia foto={p.foto!} marca={p.marca} forca={0} />
      </div>
      <div style={{ position: "absolute", top: 170 + alturaFoto - 58, left: M + 40 }}>
        <Numero n={p.numero ?? 1} marca={p.marca} />
      </div>
      <div style={{ position: "absolute", top: 170 + alturaFoto + 64, left: M, right: M, display: "flex", flexDirection: "column", gap: 20 }}>
        <Titulo texto={p.titulo} tamanho={tamanhoTitulo(p.titulo, 76)} marca={p.marca} />
        <Corpo texto={p.texto} marca={p.marca} tamanho={31} />
      </div>
      <Rodape marca={p.marca} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, background: `linear-gradient(90deg, ${c.destaque}, ${c.destaque2})` }} />
    </AbsoluteFill>
  );
}

function Imersiva(p: PropsLamina) {
  return (
    <AbsoluteFill>
      <FotoCheia foto={p.foto!} marca={p.marca} forca={1.4} />
      <Topo marca={p.marca} pagina={p.pagina} />
      <div style={{ position: "absolute", left: M, right: M, bottom: 170, display: "flex", flexDirection: "column", gap: 26 }}>
        <Numero n={p.numero ?? 1} marca={p.marca} />
        <Titulo texto={p.titulo} tamanho={tamanhoTitulo(p.titulo, 92)} marca={p.marca} />
        <Corpo texto={p.texto} marca={p.marca} tamanho={34} cor="rgba(255,255,255,0.92)" />
      </div>
      <Rodape marca={p.marca} />
    </AbsoluteFill>
  );
}

function Destaque(p: PropsLamina) {
  const c = p.marca.cores;
  return (
    <AbsoluteFill>
      <FundoMarca marca={p.marca} />
      <Topo marca={p.marca} pagina={p.pagina} />
      <div
        style={{
          position: "absolute",
          right: M - 20,
          top: 120,
          fontFamily: "Titulo, Anton, sans-serif",
          fontSize: 420,
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: `3px ${c.destaque}aa`,
        }}
      >
        {String(p.numero ?? 1).padStart(2, "0")}
      </div>
      <div style={{ position: "absolute", left: M, right: M, top: 470, display: "flex", flexDirection: "column", gap: 34 }}>
        <Titulo texto={p.titulo} tamanho={tamanhoTitulo(p.titulo, 104)} marca={p.marca} />
        {p.texto ? (
          <div style={{ display: "flex", gap: 26 }}>
            <div style={{ width: 8, borderRadius: 8, backgroundColor: c.destaque, flexShrink: 0 }} />
            <Corpo texto={p.texto} marca={p.marca} tamanho={37} cor="rgba(255,255,255,0.9)" />
          </div>
        ) : null}
      </div>
      <Rodape marca={p.marca} />
    </AbsoluteFill>
  );
}

function Chamada(p: PropsLamina) {
  const c = p.marca.cores;
  return (
    <AbsoluteFill>
      {p.foto ? <FotoCheia foto={p.foto} marca={p.marca} forca={1.8} /> : <FundoMarca marca={p.marca} />}
      <Topo marca={p.marca} pagina={p.pagina} />
      <div style={{ position: "absolute", left: M, right: M, bottom: 170, display: "flex", flexDirection: "column", alignItems: "center", gap: 30, textAlign: "center" }}>
        <Titulo texto={p.titulo} tamanho={tamanhoTitulo(p.titulo, 88)} marca={p.marca} centro />
        {p.palavra ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 10 }}>
            <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 700, fontSize: 30, letterSpacing: 4, color: c.destaque2 }}>COMENTA</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                padding: "22px 64px",
                borderRadius: 999,
                backgroundColor: c.destaque,
                color: "#fff",
                fontFamily: "Titulo, Anton, sans-serif",
                fontSize: p.palavra.length > 9 ? 84 : 112,
                boxShadow: `0 20px 60px ${c.destaque}99`,
              }}
            >
              {p.palavra.toUpperCase()}
            </div>
            <Corpo texto={p.texto} marca={p.marca} tamanho={32} centro estilo={{ marginTop: 14 }} />
          </div>
        ) : (
          <Corpo texto={p.texto} marca={p.marca} tamanho={36} centro />
        )}
        <div style={{ fontFamily: "Texto, Inter, sans-serif", fontWeight: 800, fontSize: 30, color: c.destaque2, marginTop: 8 }}>{p.marca.assinatura}</div>
      </div>
      <Rodape marca={p.marca} />
    </AbsoluteFill>
  );
}

export function Lamina(p: PropsLamina) {
  carregarFontes(p.marca.fontes.titulo, p.marca.fontes.texto);
  if (p.tipo === "capa") return <Capa {...p} />;
  if (p.tipo === "chamada") return <Chamada {...p} />;
  if (p.tipo === "foto" && p.foto) return <ComFoto {...p} />;
  if (p.tipo === "imersiva" && p.foto) return <Imersiva {...p} />;
  return <Destaque {...p} />;
}
