/**
 * Relatório do diagnóstico (Rita escreve, Duda monta): página pública com a marca da DemandIA e a logo do
 * cliente. Fora do Google (noindex), acessada só por quem tem o link. "Baixar PDF" usa a impressão do navegador.
 */
import type React from "react";
import { notFound } from "next/navigation";
import { db } from "@/src/lib/db.ts";
import { SDR_CONFIG } from "@/src/config/sdr.ts";
import type { AreaDiagnostico, Diagnosticos } from "@/src/lib/rita.ts";
import { linkPrevia } from "@/src/lib/extras.ts";
import { BotaoPdf } from "./BotaoPdf.tsx";
import { marcaCriada, paletaDoNicho } from "@/src/lib/identidade-nicho.ts";
import { EmblemaMarca, MarcaCompleta } from "@/app/previa/EmblemaMarca.tsx";

export const dynamic = "force-dynamic";

interface Relatorio {
  empresa: string;
  nicho: string | null;
  cidade: string | null;
  diagnosticos: Diagnosticos;
  marca: { logo?: string | null; pdf?: string | null; logo_fundo?: "claro" | "escuro" | null } | null;
  site_preview: { token?: string } | null;
}

async function carregar(token: string): Promise<Relatorio | null> {
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(token)) return null;
  const { data } = await db().from("outreach_leads").select("empresa,nicho,cidade,diagnosticos,marca,site_preview").eq("relatorio_token", token).maybeSingle();
  return data && (data as Relatorio).diagnosticos ? (data as Relatorio) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const r = await carregar((await params).token);
  return { title: r ? `${r.empresa} · diagnóstico DemandIA` : "Diagnóstico DemandIA", robots: { index: false, follow: false } };
}

const cor = (n: number) => (n >= 70 ? "#3ddc97" : n >= 50 ? "#ffc857" : "#ff6b81");

/** Topo de cada página do PDF (some na tela). */
function TopoPdf({ empresa, logo, escuro, criada }: { empresa: string; logo?: string | null; escuro?: boolean; criada?: React.ReactNode }) {
  return (
    <div className="pdf-topo">
      <img src="/diagnostico/logo.svg" alt="DemandIA" />
      <span>Diagnóstico digital · {empresa}</span>
      {logo ? <img src={logo} alt="" className={`pdf-logo${escuro ? " escuro" : ""}`} referrerPolicy="no-referrer" /> : criada}
    </div>
  );
}

function Area({ titulo, a, extra, topo, acao }: { titulo: string; a: AreaDiagnostico; extra?: string; topo?: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="area">
      {topo}
      <div className="area-topo">
        <div>
          <div className="eyebrow">{titulo}</div>
          <h2>{a.resumo}</h2>
          {extra && <div className="extra">{extra}</div>}
        </div>
        <div className="nota" style={{ borderColor: cor(a.nota), color: cor(a.nota) }}>
          <b>{a.nota}</b>
          <span>{a.aprovado ? "aprovado" : "reprovado"}</span>
        </div>
      </div>
      <div className="colunas">
        <div>
          <h3>O que está bom</h3>
          <ul>{a.positivos.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
        <div>
          <h3>Onde está perdendo cliente</h3>
          <ul className="criticos">{a.criticos.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      </div>
      {a.ganho && (
        <div className="ganho">
          <b>O que você ganha melhorando:</b> {a.ganho}
        </div>
      )}
      {acao}
    </section>
  );
}

export default async function RelatorioPage({ params }: { params: Promise<{ token: string }> }) {
  const r = await carregar((await params).token);
  if (!r) notFound();
  const d = r.diagnosticos;
  // Sem logo: a mesma identidade criada pelo nicho que aparece no site de demonstração
  const criada = r.marca?.logo ? null : marcaCriada(r.empresa, r.nicho);
  const coresCriada = criada ? paletaDoNicho(r.nicho, r.empresa) : null;
  const topo = (
    <TopoPdf
      empresa={r.empresa}
      logo={r.marca?.logo}
      escuro={r.marca?.logo_fundo === "escuro"}
      criada={criada && coresCriada ? <span className="pdf-emblema"><EmblemaMarca m={criada} c={coresCriada} tamanho={30} id="pdf" /></span> : null}
    />
  );
  const previa = r.site_preview?.token ? linkPrevia(r.site_preview.token) : null;
  const wa = `https://wa.me/${SDR_CONFIG.whatsapp.numero}?text=${encodeURIComponent(`Oi! Vi o diagnóstico da ${r.empresa} e quero conversar.`)}`;
  return (
    <main>
      <style>{CSS}</style>
      <header className="capa">
        <div className="marcas">
          <img src="/diagnostico/logo.svg" alt="DemandIA" className="logo-demandia" />
          {r.marca?.logo ? (
            <img src={r.marca.logo} alt={r.empresa} className={`logo-cliente${r.marca.logo_fundo === "escuro" ? " escuro" : ""}`} referrerPolicy="no-referrer" />
          ) : criada && coresCriada ? (
            <div className="logo-criada">
              <MarcaCompleta m={criada} c={coresCriada} tamanho={52} id="capa" />
            </div>
          ) : null}
        </div>
        <div className="eyebrow">Diagnóstico digital · {[r.nicho, r.cidade].filter(Boolean).join(" · ")}</div>
        <h1>{r.empresa}</h1>
        <p className="frase">{d.geral?.frase}</p>
        <div className="geral">
          <div className="nota grande" style={{ borderColor: cor(d.geral?.nota ?? 0), color: cor(d.geral?.nota ?? 0) }}>
            <b>{d.geral?.nota ?? "-"}</b>
            <span>nota geral</span>
          </div>
          <div className="mini">
            {d.google && <span>Google <b style={{ color: cor(d.google.nota) }}>{d.google.nota}</b></span>}
            {d.site && <span>Site <b style={{ color: cor(d.site.nota) }}>{d.site.nota}</b></span>}
            {!d.site && <span>Site <b style={{ color: "#ff6b81" }}>não tem</b></span>}
            {d.instagram && <span>Instagram <b style={{ color: cor(d.instagram.nota) }}>{d.instagram.nota}</b></span>}
            {d.cliente_oculto && <span>Atendimento <b style={{ color: cor(d.cliente_oculto.nota) }}>{d.cliente_oculto.nota}</b></span>}
          </div>
        </div>
      </header>

      {d.cliente_oculto && <Area topo={topo} titulo="Atendimento · cliente oculto (fizemos um teste como se fôssemos cliente)" a={d.cliente_oculto} />}
      {d.google && <Area topo={topo} titulo="Google Meu Negócio · como você aparece na busca" a={d.google} />}
      {d.site ? (
        <Area
          topo={topo}
          titulo="Site · velocidade, texto e estrutura"
          a={d.site}
          acao={
            previa ? (
              <a className="cta previa" href={previa}>
                Ver a versão melhorada do seu site
              </a>
            ) : undefined
          }
        />
      ) : (
        <section className="area">
          {topo}
          <div className="eyebrow">Site</div>
          <h2>Hoje a empresa não tem site próprio. Conferimos no Google, no WhatsApp e no Instagram.</h2>
          <div className="ganho">
            <b>O que você ganha com um site:</b> quem pesquisa no Google e não encontra um site acaba indo para o concorrente que tem.
            {previa ? " Já preparamos uma demonstração de como ficaria o seu, com a sua logo e as suas cores." : " Podemos preparar uma demonstração de como ficaria o seu."}
          </div>
          {previa && (
            <a className="cta previa" href={previa}>
              Ver a demonstração do seu site
            </a>
          )}
        </section>
      )}
      {d.instagram && <Area topo={topo} titulo="Instagram · comparado com os concorrentes da região" a={d.instagram} />}

      <section className="solucao">
        {topo}
        <div className="eyebrow">Como a DemandIA resolve</div>
        <p>{d.geral?.solucao}</p>
        <a className="cta" href={wa}>
          Quero conversar sobre o diagnóstico
        </a>
      </section>
      <footer>
        Diagnóstico feito pela DemandIA com dados públicos em {new Date(d.gerado_em).toLocaleDateString("pt-BR")}. <BotaoPdf pdf={r.marca?.pdf ?? null} />
      </footer>
    </main>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@600&family=Geist:wght@300;400;500;600&display=swap');
*{box-sizing:border-box}body{margin:0;background:#0b0718;color:#ece8ff;font-family:Geist,system-ui,sans-serif}
main{max-width:920px;margin:0 auto;padding:40px 20px 60px}
.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#a47bff;margin-bottom:8px}
.capa{padding:28px;border-radius:22px;background:radial-gradient(120% 120% at 0% 0%,#2a1460 0%,#120a2a 55%,#0b0718 100%);border:1px solid #2c2150;margin-bottom:22px}
.marcas{display:flex;align-items:center;gap:16px;margin-bottom:22px}.logo-demandia{height:26px}.logo-cliente{height:64px;width:auto;max-width:180px;object-fit:contain;border-radius:14px;background:#fff;padding:8px;margin-left:auto}.logo-cliente.escuro{background:#05030c;border:1px solid #2c2150}.logo-criada{margin-left:auto;background:#fff;border-radius:16px;padding:10px 16px;max-width:340px}.pdf-emblema{margin-left:auto;display:flex}
h1{font-family:'Archivo Narrow',sans-serif;font-size:44px;margin:0 0 8px;line-height:1.05}.frase{font-size:18px;color:#cfc6f5;margin:0 0 20px}
.geral{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.mini{display:flex;gap:16px;flex-wrap:wrap;color:#b9b0dc;font-size:14px}.mini b{font-size:18px;margin-left:4px}
.nota{border:2px solid;border-radius:16px;padding:8px 14px;text-align:center;min-width:92px}.nota b{display:block;font-size:30px;line-height:1}.nota span{font-size:12px;text-transform:uppercase;letter-spacing:.08em}.nota.grande b{font-size:42px}
.area{padding:24px;border-radius:18px;background:#120c26;border:1px solid #2a2048;margin-bottom:16px}
.area-topo{display:flex;gap:16px;justify-content:space-between;align-items:flex-start}.area h2{font-size:20px;font-weight:500;margin:0;line-height:1.35}.extra{color:#b9b0dc;font-size:14px;margin-top:6px}
.colunas{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16px}h3{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#9d93c7;margin:0 0 8px}
ul{margin:0;padding-left:18px;line-height:1.55}li{margin-bottom:4px}.criticos li::marker{color:#ff6b81}
.ganho{margin-top:16px;padding:12px 14px;border-radius:12px;background:#1b1238;border:1px solid #3a2a72;color:#e2dcff}
.solucao{padding:26px;border-radius:18px;background:linear-gradient(135deg,#5a28e0,#8a5cff);margin-top:22px}.solucao .eyebrow{color:#efe8ff}.solucao p{font-size:18px;margin:0 0 18px}
.cta{display:inline-block;background:#3ddc97;color:#06210f;font-weight:600;padding:14px 22px;border-radius:999px;text-decoration:none}
footer{margin-top:22px;color:#8f86b8;font-size:13px}
@media(max-width:640px){.colunas{grid-template-columns:1fr}h1{font-size:34px}.area-topo{flex-direction:column}}
.cta.previa{margin-top:16px;background:#a47bff;color:#120a2a}
.pdf-topo{display:none}
/* PDF (uma página por área, no tema escuro da DemandIA): gerado pelo robô no GitHub e anexado na mensagem */
@page{size:A4;margin:0}
@media print{
  html,body{background:#0b0718;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  main{max-width:none;padding:0}
  .capa,.area,.solucao{min-height:297mm;margin:0;border-radius:0;border:none;padding:16mm 16mm 18mm;break-inside:avoid}
  .capa{display:flex;flex-direction:column;justify-content:center;padding:26mm 18mm}
  .capa h1{font-size:68px}.capa .frase{font-size:26px;line-height:1.4}.capa .eyebrow{font-size:15px}.marcas{margin-bottom:40px}.logo-demandia{height:34px}.logo-cliente{height:96px;max-width:240px}
  .area,.solucao{break-before:page}
  .area{background:#0b0718}
  .pdf-topo{display:flex;align-items:center;gap:12px;color:#8f86b8;font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding-bottom:12px;margin-bottom:22mm;border-bottom:1px solid #2a2048}
  .pdf-topo img{height:18px}.pdf-topo .pdf-logo{height:34px;width:auto;max-width:120px;object-fit:contain;border-radius:8px;background:#fff;padding:3px 6px;margin-left:auto}.pdf-topo .pdf-logo.escuro{background:#05030c}
  .area h2{font-size:34px;line-height:1.25}.eyebrow{font-size:14px}.area li{font-size:19px;margin-bottom:12px;line-height:1.45}h3{font-size:15px}.colunas{margin-top:34px;gap:30px}.ganho{font-size:19px;line-height:1.5;margin-top:34px;padding:20px 22px}
  .nota{min-width:110px}.nota b{font-size:46px}.nota span{font-size:13px}.cta{font-size:18px;padding:16px 26px}
  .mini{font-size:17px}.mini b{font-size:22px}
  .solucao{display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#5a28e0,#8a5cff)}
  .solucao .pdf-topo{position:absolute;top:16mm;left:16mm;right:16mm;color:#efe8ff;border-color:rgba(255,255,255,.3)}
  .solucao{position:relative}.solucao p{font-size:28px;line-height:1.45}.solucao .cta{align-self:flex-start}
  footer{display:none}
}
`;
