/**
 * Relatório do diagnóstico (Rita escreve, Duda monta): página pública com a marca da DemandIA e a logo do
 * cliente. Fora do Google (noindex), acessada só por quem tem o link. "Baixar PDF" usa a impressão do navegador.
 */
import { notFound } from "next/navigation";
import { db } from "@/src/lib/db.ts";
import { SDR_CONFIG } from "@/src/config/sdr.ts";
import type { AreaDiagnostico, Diagnosticos } from "@/src/lib/rita.ts";
import { BotaoPdf } from "./BotaoPdf.tsx";

export const dynamic = "force-dynamic";

interface Relatorio {
  empresa: string;
  nicho: string | null;
  cidade: string | null;
  diagnosticos: Diagnosticos;
  marca: { logo?: string | null } | null;
}

async function carregar(token: string): Promise<Relatorio | null> {
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(token)) return null;
  const { data } = await db().from("outreach_leads").select("empresa,nicho,cidade,diagnosticos,marca").eq("relatorio_token", token).maybeSingle();
  return data && (data as Relatorio).diagnosticos ? (data as Relatorio) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const r = await carregar((await params).token);
  return { title: r ? `${r.empresa} · diagnóstico DemandIA` : "Diagnóstico DemandIA", robots: { index: false, follow: false } };
}

const cor = (n: number) => (n >= 70 ? "#3ddc97" : n >= 50 ? "#ffc857" : "#ff6b81");

function Area({ titulo, a, extra }: { titulo: string; a: AreaDiagnostico; extra?: string }) {
  return (
    <section className="area">
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
    </section>
  );
}

export default async function RelatorioPage({ params }: { params: Promise<{ token: string }> }) {
  const r = await carregar((await params).token);
  if (!r) notFound();
  const d = r.diagnosticos;
  const wa = `https://wa.me/${SDR_CONFIG.whatsapp.numero}?text=${encodeURIComponent(`Oi! Vi o diagnóstico da ${r.empresa} e quero conversar.`)}`;
  return (
    <main>
      <style>{CSS}</style>
      <header className="capa">
        <div className="marcas">
          <img src="/diagnostico/logo.svg" alt="DemandIA" className="logo-demandia" />
          {r.marca?.logo && <img src={r.marca.logo} alt={r.empresa} className="logo-cliente" referrerPolicy="no-referrer" />}
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

      {d.cliente_oculto && <Area titulo="Atendimento · cliente oculto (fizemos um teste como se fôssemos cliente)" a={d.cliente_oculto} />}
      {d.google && <Area titulo="Google Meu Negócio · como você aparece na busca" a={d.google} />}
      {d.site ? (
        <Area titulo="Site · velocidade, texto e estrutura" a={d.site} />
      ) : (
        <section className="area">
          <div className="eyebrow">Site</div>
          <h2>Hoje a empresa não tem site próprio. Conferimos no Google, no WhatsApp e no Instagram.</h2>
          <div className="ganho">
            <b>O que você ganha com um site:</b> quem pesquisa no Google e não encontra um site acaba indo para o concorrente que tem. Já preparamos uma
            demonstração de como ficaria o seu.
          </div>
        </section>
      )}
      {d.instagram && <Area titulo="Instagram · comparado com os concorrentes da região" a={d.instagram} />}

      <section className="solucao">
        <div className="eyebrow">Como a DemandIA resolve</div>
        <p>{d.geral?.solucao}</p>
        <a className="cta" href={wa}>
          Quero conversar sobre o diagnóstico
        </a>
      </section>
      <footer>
        Diagnóstico feito pela DemandIA com dados públicos em {new Date(d.gerado_em).toLocaleDateString("pt-BR")}. <BotaoPdf />
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
.marcas{display:flex;align-items:center;gap:16px;margin-bottom:22px}.logo-demandia{height:26px}.logo-cliente{height:54px;width:54px;object-fit:cover;border-radius:14px;background:#fff;margin-left:auto}
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
@media print{body{background:#fff;color:#111}.capa,.area{background:#fff;border-color:#ddd}.frase,.mini,.extra{color:#333}.solucao{color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ganho{background:#f4f0ff;color:#222}footer button{display:none}.area{break-inside:avoid}}
`;
