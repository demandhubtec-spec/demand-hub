/** Layout da prévia de site grátis (3 seções). */
import { PALETAS, type SitePreview } from "@/src/lib/extras.ts";

const iniciais = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ú0-9]/.test(w) && !/^(de|da|do|das|dos|e|&)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

export function PreviaSite({ p }: { p: SitePreview }) {
  const c = PALETAS[p.paleta] ?? PALETAS.azul;
  const nota = p.nota ? String(p.nota).replace(".", ",") : null;

  const css = `
  *{box-sizing:border-box}
  .pv{--c:${c.cor};--e:${c.escura};--l:${c.clara};font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#15171C;background:#fff;min-height:100vh}
  .pv a{color:inherit;text-decoration:none}
  .faixa{background:#15171C;color:#E9E9EE;font-size:13px;padding:10px 16px;text-align:center;line-height:1.5}
  .faixa b{color:#fff}.faixa a{color:#fff;text-decoration:underline;margin-left:6px}
  .wrap{max-width:1120px;margin:0 auto;padding:0 20px}
  .nav{display:flex;align-items:center;justify-content:space-between;padding:18px 0;gap:12px}
  .marca{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px}
  .mono{width:40px;height:40px;border-radius:12px;background:var(--c);color:#fff;display:grid;place-items:center;font-size:15px;letter-spacing:.5px}
  .links{display:flex;gap:26px;font-size:14px;color:#4A4F5C}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--c);color:#fff!important;font-weight:700;border-radius:999px;padding:13px 22px;font-size:15px;box-shadow:0 8px 24px -10px var(--c)}
  .btn.sec{background:#fff;color:var(--e)!important;border:1px solid #DADCE3;box-shadow:none}
  .hero{background:linear-gradient(180deg,var(--l),#fff);padding:56px 0 72px}
  .hgrid{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center}
  .selo{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid #E3E5EB;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;color:#3A3F4B}
  .selo i{color:#F5A623;font-style:normal}
  h1{font-size:clamp(34px,5vw,54px);line-height:1.05;letter-spacing:-1.5px;margin:18px 0 16px;color:var(--e)}
  .sub{font-size:18px;line-height:1.6;color:#4A4F5C;margin:0 0 28px;max-width:540px}
  .acoes{display:flex;gap:12px;flex-wrap:wrap}
  .arte{position:relative;aspect-ratio:1/1;max-width:440px;width:100%;justify-self:end}
  .arte .bg{position:absolute;inset:6% 0 0 8%;border-radius:36px;background:var(--c);opacity:.95}
  .arte .bg2{position:absolute;inset:0 10% 12% 0;border-radius:36px;background:var(--e)}
  .arte .card{position:absolute;left:-4%;bottom:10%;background:#fff;border-radius:18px;padding:16px 18px;box-shadow:0 20px 40px -18px rgba(0,0,0,.35);min-width:220px}
  .arte .card b{display:block;font-size:26px;color:var(--e)}
  .arte .card span{font-size:13px;color:#6A6F7C}
  .arte .tag{position:absolute;right:4%;top:12%;background:#fff;border-radius:14px;padding:10px 14px;font-size:13px;font-weight:700;color:var(--e);box-shadow:0 16px 30px -16px rgba(0,0,0,.4)}
  .arte .big{position:absolute;inset:0 10% 12% 0;display:grid;place-items:center;color:#fff;font-weight:800;font-size:clamp(64px,10vw,120px);letter-spacing:-4px;opacity:.95}
  section.bloco{padding:72px 0}
  .kicker{font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--c)}
  h2{font-size:clamp(26px,3.4vw,38px);letter-spacing:-.8px;margin:10px 0 36px;color:var(--e);line-height:1.15}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
  .svc{border:1px solid #E7E9EE;border-radius:20px;padding:26px;background:#fff;transition:transform .2s}
  .svc:hover{transform:translateY(-3px)}
  .svc .n{width:44px;height:44px;border-radius:12px;background:var(--l);color:var(--c);display:grid;place-items:center;font-weight:800;margin-bottom:18px}
  .svc h3{margin:0 0 8px;font-size:19px;color:var(--e)}
  .svc p{margin:0;color:#5A5F6C;line-height:1.6;font-size:15px}
  .sobre{background:var(--e);color:#fff;border-radius:28px;padding:48px;display:grid;grid-template-columns:1.2fr .8fr;gap:40px}
  .sobre h2{color:#fff;margin-bottom:16px}.sobre .kicker{color:#fff;opacity:.7}
  .sobre p{color:rgba(255,255,255,.82);line-height:1.7;font-size:16px;margin:0 0 24px}
  .dif{list-style:none;padding:0;margin:0;display:grid;gap:12px}
  .dif li{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px 16px;font-weight:600;display:flex;gap:10px;align-items:center}
  .dif li:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--c);flex:none;box-shadow:0 0 0 4px rgba(255,255,255,.12)}
  .end{margin-top:18px;font-size:14px;color:rgba(255,255,255,.7)}
  footer{padding:36px 0;color:#7A7F8C;font-size:13px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;border-top:1px solid #EEF0F3;margin-top:24px}
  @media (max-width:860px){.hgrid,.sobre{grid-template-columns:1fr}.arte{justify-self:center;max-width:340px}.cards{grid-template-columns:1fr}.links{display:none}.sobre{padding:30px 22px}.hero{padding:36px 0 56px}section.bloco{padding:52px 0}}
  `;

  return (
    <div className="pv">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="faixa">
        <b>Prévia gratuita</b> feita pela DemandIA para a {p.empresa}. É um rascunho de como o site poderia ficar, não o site oficial.
        <a href="https://demandhub.com.br" target="_blank" rel="noreferrer">Quero o site completo</a>
      </div>

      <div className="hero">
        <div className="wrap">
          <nav className="nav">
            <div className="marca">
              <div className="mono">{iniciais(p.empresa) || "•"}</div>
              {p.empresa}
            </div>
            <div className="links">
              <a href="#servicos">Serviços</a>
              <a href="#sobre">Sobre</a>
              <a href="#contato">Contato</a>
            </div>
          </nav>

          <div className="hgrid">
            <div>
              {nota && (
                <span className="selo">
                  <i>★</i> {nota} no Google{p.avaliacoes ? ` · ${p.avaliacoes} avaliações` : ""}
                </span>
              )}
              <h1>{p.titulo}</h1>
              <p className="sub">{p.subtitulo}</p>
              <div className="acoes">
                <a className="btn" href="#contato">{p.cta}</a>
                <a className="btn sec" href="#servicos">Ver serviços</a>
              </div>
            </div>
            <div className="arte" aria-hidden>
              <div className="bg" />
              <div className="bg2" />
              <div className="big">{iniciais(p.empresa)}</div>
              {p.cidade && <div className="tag">{p.cidade}</div>}
              <div className="card">
                {nota ? (
                  <>
                    <b>★ {nota}</b>
                    <span>{p.avaliacoes ? `${p.avaliacoes} avaliações no Google` : "nota no Google"}</span>
                  </>
                ) : (
                  <>
                    <b>{p.nicho ?? "Atendimento"}</b>
                    <span>{p.cidade ?? ""}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="bloco" id="servicos">
        <div className="wrap">
          <div className="kicker">Serviços</div>
          <h2>O que a {p.empresa} faz por você</h2>
          <div className="cards">
            {p.servicos.map((s, i) => (
              <div className="svc" key={i}>
                <div className="n">{String(i + 1).padStart(2, "0")}</div>
                <h3>{s.titulo}</h3>
                <p>{s.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bloco" id="sobre" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sobre" id="contato">
            <div>
              <div className="kicker">Sobre</div>
              <h2>{p.cidade ? `Atendimento em ${p.cidade}` : "Como atendemos"}</h2>
              <p>{p.sobre}</p>
              <a className="btn" href="#contato">{p.cta}</a>
              {p.endereco && <div className="end">{p.endereco}</div>}
            </div>
            {p.diferenciais.length > 0 && (
              <ul className="dif">
                {p.diferenciais.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
          <footer>
            <span>
              © {p.empresa}
              {p.cidade ? ` · ${p.cidade}` : ""}
            </span>
            <span>Prévia criada pela DemandIA</span>
          </footer>
        </div>
      </section>
    </div>
  );
}
