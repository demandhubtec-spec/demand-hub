/**
 * Prévia de site gratuita (isca da prospecção), modelo base v2 (12/11/2026).
 * Usa a identidade do cliente: logo, cores tiradas da logo e fotos do Instagram. Sem logo, cai na paleta do
 * segmento. Página única: topo, serviços, galeria, sobre, como funciona, dúvidas e contato.
 */
import { PALETAS, type SitePreview } from "@/src/lib/extras.ts";
import { marcaCriada, paletaDoNicho } from "@/src/lib/identidade-nicho.ts";
import { EmblemaMarca, MarcaCompleta } from "./EmblemaMarca.tsx";

const iniciais = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ú0-9]/.test(w) && !/^(de|da|do|das|dos|e|&)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

function coresDoSite(p: SitePreview) {
  if (p.cores) return p.cores;
  // Sem logo: identidade criada a partir do padrão do nicho (cores e emblema)
  if (!p.logo) return paletaDoNicho(p.nicho, p.empresa);
  const c = PALETAS[p.paleta] ?? PALETAS.azul;
  return { cor: c.cor, escura: c.escura, clara: c.clara, texto_no_destaque: "#FFFFFF", cor2: c.cor };
}

export function PreviaSite({ p }: { p: SitePreview }) {
  const c = coresDoSite(p);
  const criada = p.logo ? null : marcaCriada(p.empresa, p.nicho);
  const nota = p.nota ? String(p.nota).replace(".", ",") : null;
  const fotos = p.fotos ?? [];
  const wa = p.whatsapp ? `https://wa.me/${p.whatsapp}?text=${encodeURIComponent(`Olá! Vim pelo site da ${p.empresa} e quero mais informações.`)}` : "#contato";
  const ig = p.instagram ? `https://instagram.com/${p.instagram}` : null;
  const etapas = p.etapas ?? [];
  const faq = p.faq ?? [];

  const Marca = ({ claro = false, id = "topo" }: { claro?: boolean; id?: string }) => (
    <div className={`marca${claro ? " clara" : ""}`}>
      {criada ? (
        <MarcaCompleta m={criada} c={c} clara={claro} id={id} />
      ) : (
        <>
          <img src={p.logo!} alt={p.empresa} className={`logo${p.logo_fundo === "escuro" ? " chip" : ""}`} />
          <span>{p.empresa}</span>
        </>
      )}
    </div>
  );

  const css = `
  *{box-sizing:border-box}html{scroll-behavior:smooth}
  .pv{--c:${c.cor};--e:${c.escura};--l:${c.clara};--t:${c.texto_no_destaque};--c2:${c.cor2 ?? c.cor};font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#16181D;background:#fff;min-height:100vh;overflow-x:hidden}
  .pv a{color:inherit;text-decoration:none}
  .faixa{background:#0E0F13;color:#D9DAE0;font-size:12.5px;padding:9px 16px;text-align:center;line-height:1.5}
  .faixa b{color:#fff}.faixa a{color:#fff;text-decoration:underline;margin-left:6px}
  .wrap{max-width:1160px;margin:0 auto;padding:0 20px}
  header.topo{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.88);backdrop-filter:blur(12px);border-bottom:1px solid #EEF0F3}
  .nav{display:flex;align-items:center;justify-content:space-between;padding:12px 0;gap:14px}
  .marca{display:flex;align-items:center;gap:12px;font-weight:800;font-size:17px;color:var(--e);min-width:0}
  .marca span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
  .marca.clara{color:#fff}
  .logo{height:46px;width:auto;max-width:150px;object-fit:contain;border-radius:10px}
  .logo.chip{background:var(--e);padding:6px 10px;height:52px}
  .arte .bg2 img.chip{background:transparent}
  .mono{width:44px;height:44px;border-radius:14px;background:var(--c);color:var(--t);display:grid;place-items:center;font-size:15px;letter-spacing:.5px;flex:none}
  .links{display:flex;gap:26px;font-size:14px;color:#4A4F5C;font-weight:500}
  .links a:hover{color:var(--c)}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;background:var(--c);color:var(--t)!important;font-weight:700;border-radius:999px;padding:14px 24px;font-size:15px;box-shadow:0 12px 28px -14px var(--c);transition:transform .2s,box-shadow .2s;white-space:nowrap}
  .btn:hover{transform:translateY(-2px);box-shadow:0 18px 34px -14px var(--c)}
  .btn.pq{padding:10px 18px;font-size:14px}
  .btn.sec{background:#fff;color:var(--e)!important;border:1px solid #DADCE3;box-shadow:none}
  .btn svg{width:18px;height:18px;flex:none}
  .hero{position:relative;padding:64px 0 84px;background:radial-gradient(70% 90% at 100% 0%,var(--l) 0%,#fff 60%)}
  .hero:before{content:"";position:absolute;width:520px;height:520px;border-radius:50%;background:var(--c);opacity:.07;left:-220px;bottom:-260px}
  .hgrid{position:relative;display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center}
  .selo{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid #E3E5EB;border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;color:#3A3F4B;box-shadow:0 6px 18px -12px rgba(0,0,0,.25)}
  .selo i{color:var(--c2);font-style:normal;letter-spacing:1px}
  h1{font-size:clamp(36px,5.2vw,60px);line-height:1.03;letter-spacing:-1.8px;margin:20px 0 18px;color:var(--e)}
  h1 em{font-style:normal;color:var(--c)}
  .sub{font-size:18px;line-height:1.65;color:#4A4F5C;margin:0 0 30px;max-width:540px}
  .acoes{display:flex;gap:12px;flex-wrap:wrap}
  .prova{display:flex;gap:22px;margin-top:34px;flex-wrap:wrap;color:#5A5F6C;font-size:13.5px}
  .prova b{display:block;font-size:22px;color:var(--e)}
  .colagem{position:relative;aspect-ratio:1/1.05;max-width:500px;width:100%;justify-self:end}
  .colagem .f1{position:absolute;inset:0 18% 14% 0;border-radius:32px;overflow:hidden;box-shadow:0 30px 60px -30px rgba(0,0,0,.45);background:var(--e)}
  .colagem .f2{position:absolute;width:44%;aspect-ratio:1/1;right:0;bottom:0;border-radius:26px;overflow:hidden;border:6px solid #fff;box-shadow:0 24px 50px -24px rgba(0,0,0,.45);background:var(--l)}
  .colagem img{width:100%;height:100%;object-fit:cover;display:block}
  .colagem .card{position:absolute;left:-6%;bottom:22%;background:#fff;border-radius:18px;padding:14px 18px;box-shadow:0 22px 44px -20px rgba(0,0,0,.4);min-width:190px}
  .colagem .card b{display:block;font-size:24px;color:var(--e)}.colagem .card span{font-size:12.5px;color:#6A6F7C}
  .arte{position:relative;aspect-ratio:1/1;max-width:460px;width:100%;justify-self:end}
  .arte .bg{position:absolute;inset:8% 0 0 10%;border-radius:40px;background:var(--c)}
  .arte .bg2{position:absolute;inset:0 12% 12% 0;border-radius:40px;background:var(--e);display:grid;place-items:center;overflow:hidden}
  .arte .bg2 img{width:58%;height:auto;max-height:62%;object-fit:contain;background:#fff;border-radius:26px;padding:22px}
  .arte .emblema{background:#fff;border-radius:34px;padding:26px;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
  .arte .big{color:#fff;font-weight:800;font-size:clamp(70px,11vw,130px);letter-spacing:-4px}
  .arte .anel{position:absolute;width:38%;aspect-ratio:1/1;border-radius:50%;border:14px solid var(--c2);right:-4%;top:-4%;opacity:.85}
  .arte .card{position:absolute;left:-4%;bottom:8%;background:#fff;border-radius:18px;padding:14px 18px;box-shadow:0 22px 44px -20px rgba(0,0,0,.4);min-width:190px}
  .arte .card b{display:block;font-size:24px;color:var(--e)}.arte .card span{font-size:12.5px;color:#6A6F7C}
  .confianca{background:var(--e);color:#fff}
  .confianca .wrap{display:flex;justify-content:space-around;gap:20px;flex-wrap:wrap;padding:22px 20px;font-size:14px;font-weight:600}
  .confianca span{display:flex;align-items:center;gap:10px;opacity:.92}
  .confianca span:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--c2);box-shadow:0 0 0 4px rgba(255,255,255,.12)}
  section.bloco{padding:84px 0}
  .kicker{font-size:12.5px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:var(--c)}
  h2{font-size:clamp(28px,3.6vw,42px);letter-spacing:-1px;margin:12px 0 40px;color:var(--e);line-height:1.12;max-width:720px}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
  .svc{border:1px solid #E7E9EE;border-radius:22px;padding:26px;background:#fff;transition:transform .25s,box-shadow .25s,border-color .25s;position:relative;overflow:hidden}
  .svc:after{content:"";position:absolute;inset:auto -30% -60% auto;width:160px;height:160px;border-radius:50%;background:var(--l);opacity:0;transition:opacity .25s}
  .svc:hover{transform:translateY(-4px);box-shadow:0 22px 40px -26px rgba(0,0,0,.35);border-color:transparent}
  .svc:hover:after{opacity:1}
  .svc .n{width:46px;height:46px;border-radius:14px;background:var(--l);color:var(--c);display:grid;place-items:center;font-weight:800;margin-bottom:20px;position:relative;z-index:1}
  .svc h3{margin:0 0 8px;font-size:18px;color:var(--e);position:relative;z-index:1}
  .svc p{margin:0;color:#5A5F6C;line-height:1.6;font-size:14.5px;position:relative;z-index:1}
  .galeria{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:190px;gap:14px}
  .galeria div{border-radius:20px;overflow:hidden;background:var(--l)}
  .galeria div:nth-child(1){grid-column:span 2;grid-row:span 2}
  .galeria img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s}
  .galeria div:hover img{transform:scale(1.05)}
  .sobre{background:var(--e);color:#fff;border-radius:32px;padding:56px;display:grid;grid-template-columns:1.15fr .85fr;gap:48px;position:relative;overflow:hidden}
  .sobre:before{content:"";position:absolute;width:420px;height:420px;border-radius:50%;background:var(--c);opacity:.18;right:-140px;top:-160px}
  .sobre>*{position:relative}
  .sobre h2{color:#fff;margin-bottom:16px}.sobre .kicker{color:#fff;opacity:.7}
  .sobre p{color:rgba(255,255,255,.84);line-height:1.75;font-size:16.5px;margin:0 0 26px}
  .dif{list-style:none;padding:0;margin:0;display:grid;gap:12px;align-content:center}
  .dif li{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:16px 18px;font-weight:600;display:flex;gap:12px;align-items:center}
  .dif li:before{content:"✓";width:26px;height:26px;border-radius:50%;background:var(--c2);color:#fff;display:grid;place-items:center;font-size:13px;flex:none}
  .passos{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;counter-reset:p}
  .passo{padding:28px;border-radius:22px;background:var(--l);position:relative}
  .passo:before{counter-increment:p;content:counter(p);position:absolute;top:22px;right:24px;font-size:54px;font-weight:800;color:var(--c);opacity:.18;line-height:1}
  .passo h3{margin:0 0 8px;color:var(--e);font-size:18px}.passo p{margin:0;color:#4A4F5C;line-height:1.6;font-size:14.5px}
  .faq{display:grid;gap:12px;max-width:820px}
  .faq details{border:1px solid #E7E9EE;border-radius:18px;padding:18px 22px;background:#fff}
  .faq summary{cursor:pointer;font-weight:700;color:var(--e);list-style:none;display:flex;justify-content:space-between;gap:16px;font-size:16px}
  .faq summary::-webkit-details-marker{display:none}
  .faq summary:after{content:"+";color:var(--c);font-size:22px;line-height:1}
  .faq details[open] summary:after{content:"−"}
  .faq p{margin:12px 0 0;color:#4A4F5C;line-height:1.65}
  .final{background:linear-gradient(135deg,var(--c),var(--e));border-radius:32px;padding:56px;color:#fff;display:grid;grid-template-columns:1.3fr .7fr;gap:30px;align-items:center}
  .final h2{color:#fff;margin:0 0 12px}.final p{margin:0;color:rgba(255,255,255,.85);line-height:1.6}
  .final .btn{background:#fff;color:var(--e)!important;box-shadow:none}
  .contato{display:grid;gap:10px;font-size:14.5px;color:rgba(255,255,255,.9)}
  footer{padding:36px 0;color:#7A7F8C;font-size:13px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;border-top:1px solid #EEF0F3;margin-top:56px}
  .flutua{position:fixed;right:18px;bottom:18px;z-index:30;width:58px;height:58px;border-radius:50%;background:#25D366;display:grid;place-items:center;box-shadow:0 14px 30px -10px rgba(0,0,0,.45)}
  .flutua svg{width:30px;height:30px}
  @media (max-width:980px){.cards{grid-template-columns:repeat(2,1fr)}.galeria{grid-template-columns:repeat(2,1fr);grid-auto-rows:160px}}
  @media (max-width:860px){.hgrid,.sobre,.final{grid-template-columns:1fr}.colagem,.arte{justify-self:center;max-width:360px}.links{display:none}.sobre,.final{padding:34px 22px}.hero{padding:40px 0 60px}section.bloco{padding:60px 0}.passos{grid-template-columns:1fr}.marca span{max-width:150px}}
  @media (max-width:520px){.cards{grid-template-columns:1fr}.nav .btn{display:none}}
  `;

  const IconeWa = ({ cor = "currentColor" }: { cor?: string }) => (
    <svg viewBox="0 0 24 24" fill={cor} aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.2 1.3Z" />
    </svg>
  );

  return (
    <div className="pv">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="faixa">
        {p.tipo === "melhoria" ? (
          <>
            <b>Prévia gratuita</b> feita pela DemandIA: como o site da {p.empresa} poderia ficar melhor. Não é o site oficial.
          </>
        ) : (
          <>
            <b>Prévia gratuita</b> feita pela DemandIA para a {p.empresa}. É um rascunho de como o site poderia ficar, não o site oficial.
          </>
        )}
        <a href="https://demandhub.com.br" target="_blank" rel="noreferrer">Quero o site completo</a>
      </div>

      <header className="topo">
        <div className="wrap nav">
          <Marca />
          <nav className="links">
            <a href="#servicos">Serviços</a>
            {etapas.length > 0 && <a href="#como">Como funciona</a>}
            {faq.length > 0 && <a href="#duvidas">Dúvidas</a>}
            <a href="#contato">Contato</a>
          </nav>
          <a className="btn pq" href={wa} target={p.whatsapp ? "_blank" : undefined} rel="noreferrer">
            <IconeWa /> Fale conosco
          </a>
        </div>
      </header>

      <div className="hero">
        <div className="wrap hgrid">
          <div>
            {nota && (
              <span className="selo">
                <i>★★★★★</i> {nota} no Google{p.avaliacoes ? ` · ${p.avaliacoes} avaliações` : ""}
              </span>
            )}
            <h1>{p.titulo}</h1>
            <p className="sub">{p.subtitulo}</p>
            <div className="acoes">
              <a className="btn" href={wa} target={p.whatsapp ? "_blank" : undefined} rel="noreferrer">
                <IconeWa /> {p.cta}
              </a>
              <a className="btn sec" href="#servicos">Ver serviços</a>
            </div>
            <div className="prova">
              {nota && (
                <div>
                  <b>★ {nota}</b>nota no Google
                </div>
              )}
              {p.avaliacoes ? (
                <div>
                  <b>{p.avaliacoes}</b>avaliações
                </div>
              ) : null}
              {p.cidade && (
                <div>
                  <b>{p.cidade}</b>atendimento local
                </div>
              )}
            </div>
          </div>
          {fotos.length > 0 ? (
            <div className="colagem" aria-hidden>
              <div className="f1">
                <img src={fotos[0]} alt="" />
              </div>
              {fotos[1] && (
                <div className="f2">
                  <img src={fotos[1]} alt="" />
                </div>
              )}
              <div className="card">
                <b>{nota ? `★ ${nota}` : p.nicho ?? "Atendimento"}</b>
                <span>{nota ? `${p.avaliacoes ?? ""} avaliações no Google` : p.cidade ?? ""}</span>
              </div>
            </div>
          ) : (
            <div className="arte" aria-hidden>
              <div className="bg" />
              <div className="anel" />
              <div className="bg2">{p.logo ? <img src={p.logo} alt="" className={p.logo_fundo === "escuro" ? "chip" : undefined} /> : criada ? <div className="emblema"><EmblemaMarca m={criada} c={c} tamanho={150} id="arte" /></div> : <div className="big">{iniciais(p.empresa)}</div>}</div>
              <div className="card">
                <b>{nota ? `★ ${nota}` : p.nicho ?? "Atendimento"}</b>
                <span>{nota ? `${p.avaliacoes ?? ""} avaliações no Google` : p.cidade ?? ""}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="confianca">
        <div className="wrap">
          {(p.diferenciais.length ? p.diferenciais : ["Atendimento próximo", "Agendamento rápido", "Fale pelo WhatsApp"]).map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
      </div>

      <section className="bloco" id="servicos">
        <div className="wrap">
          <div className="kicker">Serviços</div>
          <h2>O que a {p.empresa} faz por você</h2>
          <div className="cards" style={p.servicos.length < 4 ? { gridTemplateColumns: `repeat(${p.servicos.length},1fr)` } : undefined}>
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

      {fotos.length >= 3 && (
        <section className="bloco" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="kicker">Por dentro</div>
            <h2>Um pouco do nosso dia a dia</h2>
            <div className="galeria">
              {fotos.slice(0, 6).map((f, i) => (
                <div key={i}>
                  <img src={f} alt="" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="bloco" id="sobre" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sobre">
            <div>
              <div className="kicker">Sobre</div>
              <h2>{p.cidade ? `Atendimento de confiança em ${p.cidade}` : "Como atendemos"}</h2>
              <p>{p.sobre}</p>
              <a className="btn" href={wa} target={p.whatsapp ? "_blank" : undefined} rel="noreferrer">
                <IconeWa /> {p.cta}
              </a>
            </div>
            {p.diferenciais.length > 0 && (
              <ul className="dif">
                {p.diferenciais.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {etapas.length > 0 && (
        <section className="bloco" id="como" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="kicker">Como funciona</div>
            <h2>Do primeiro contato ao atendimento</h2>
            <div className="passos">
              {etapas.map((e, i) => (
                <div className="passo" key={i}>
                  <h3>{e.titulo}</h3>
                  <p>{e.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {faq.length > 0 && (
        <section className="bloco" id="duvidas" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="kicker">Dúvidas</div>
            <h2>Perguntas frequentes</h2>
            <div className="faq">
              {faq.map((f, i) => (
                <details key={i} open={i === 0}>
                  <summary>{f.pergunta}</summary>
                  <p>{f.resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="bloco" id="contato" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="final">
            <div>
              <h2>{p.chamada_final || `Fale com a ${p.empresa}`}</h2>
              <div className="contato">
                {p.endereco && <span>{p.endereco}</span>}
                {ig && (
                  <a href={ig} target="_blank" rel="noreferrer">
                    @{p.instagram}
                  </a>
                )}
              </div>
            </div>
            <div>
              <a className="btn" href={wa} target={p.whatsapp ? "_blank" : undefined} rel="noreferrer">
                <IconeWa /> Chamar no WhatsApp
              </a>
            </div>
          </div>
          <footer>
            <Marca id="rodape" />
            <span>
              © {p.empresa}
              {p.cidade ? ` · ${p.cidade}` : ""} · Prévia criada pela DemandIA
            </span>
          </footer>
        </div>
      </section>

      {p.whatsapp && (
        <a className="flutua" href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp">
          <IconeWa cor="#fff" />
        </a>
      )}
    </div>
  );
}
