/**
 * Relatório em PDF para o cliente (12/11/2026): o Kelvin vê o relatório como link no portal, mas o cliente
 * recebe em PDF anexado no WhatsApp. Este robô abre a página do relatório, salva em PDF (A4, uma página por
 * área) e guarda no bucket "materiais". O link fica em outreach_leads.marca.pdf.
 *
 * Refaz o PDF quando o diagnóstico, a logo ou o site de demonstração mudam (marca.pdf_chave).
 *   node rodar.mjs          → gera os que faltam
 *   node rodar.mjs --checar → só diz se tem fila (tem=sim / tem=nao), sem abrir o navegador
 */
const URL_SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = (process.env.APP_URL || "https://demandia-sdr.vercel.app").replace(/\/$/, "");
if (!URL_SB || !KEY) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

export function chaveDoPdf(l) {
  return [l.diag_em ?? "", l.marca?.logo ?? "", l.site_tk ?? "", l.site_em ?? ""].join("|");
}

async function fila() {
  const sel = "place_id,empresa,relatorio_token,marca,diag_em:diagnosticos->>gerado_em,site_tk:site_preview->>token,site_em:site_preview->>gerado_em";
  const q = `${URL_SB}/rest/v1/outreach_leads?select=${encodeURIComponent(sel)}&relatorio_token=not.is.null&duda_status=in.(pendente,aprovado)&wa_status=eq.pendente&limit=200`;
  const r = await fetch(q, { headers: H });
  if (!r.ok) throw new Error(`fila ${r.status}: ${await r.text()}`);
  const itens = await r.json();
  return itens.filter((l) => l.diag_em && l.marca?.pdf_chave !== chaveDoPdf(l));
}

const nomeArquivo = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "empresa";

async function main() {
  const lista = await fila();
  if (process.argv.includes("--checar")) {
    console.log(lista.length ? "tem=sim" : "tem=nao");
    return;
  }
  if (!lista.length) return console.log("Nenhum PDF para gerar");
  const { chromium } = await import("playwright");
  const nav = await chromium.launch();
  let feitos = 0;
  for (const l of lista.slice(0, 40)) {
    try {
      const pag = await nav.newPage();
      await pag.goto(`${APP}/relatorio/${l.relatorio_token}`, { waitUntil: "networkidle", timeout: 60_000 });
      await pag.emulateMedia({ media: "print" });
      await pag.evaluate(() => document.fonts.ready);
      const pdf = await pag.pdf({ printBackground: true, preferCSSPageSize: true });
      await pag.close();
      const caminho = `relatorios/${nomeArquivo(l.empresa)}-${l.relatorio_token}-${Date.now()}.pdf`;
      const up = await fetch(`${URL_SB}/storage/v1/object/materiais/${caminho}`, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/pdf", "x-upsert": "true" },
        body: pdf,
      });
      if (!up.ok) throw new Error(`upload ${up.status}: ${await up.text()}`);
      const link = `${URL_SB}/storage/v1/object/public/materiais/${caminho}`;
      const marca = { ...(l.marca ?? {}), pdf: link, pdf_chave: chaveDoPdf(l) };
      const pt = await fetch(`${URL_SB}/rest/v1/outreach_leads?place_id=eq.${encodeURIComponent(l.place_id)}`, {
        method: "PATCH",
        headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ marca }),
      });
      if (!pt.ok) throw new Error(`salvar ${pt.status}: ${await pt.text()}`);
      feitos++;
      console.log(`PDF pronto: ${l.empresa}`);
    } catch (e) {
      console.error(`Falhou ${l.empresa}:`, e.message ?? e);
    }
  }
  await nav.close();
  console.log(`${feitos} PDF(s) gerado(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
