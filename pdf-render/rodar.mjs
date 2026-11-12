/**
 * Robô de marca e PDF do time comercial (roda no GitHub Actions, com navegador de verdade).
 *
 * 1. Logo do cliente (12/11/2026, pedido do Kelvin: "tira um print da logo, do site, do Instagram ou do Google"):
 *    abre o site da empresa e pega a logo do topo (o arquivo original ou um print dela); sem site, pega a foto
 *    do perfil do Instagram; por último, a imagem que a Rita achou. Mede as cores na própria imagem, pixel a
 *    pixel, e guarda tudo no bucket "materiais". Logo subida pelo Kelvin no portal: só mede as cores.
 * 2. Relatório em PDF: abre a página do relatório, salva em PDF A4 (uma página por área) e guarda no storage.
 *    O link fica em outreach_leads.marca.pdf e vai anexado na mensagem da Gabi. Refaz quando o diagnóstico,
 *    a logo ou o site de demonstração mudam (marca.pdf_chave).
 *
 *   node rodar.mjs          → faz o que estiver na fila
 *   node rodar.mjs --checar → só diz se tem fila (tem=sim / tem=nao), sem abrir o navegador
 */
const URL_SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = (process.env.APP_URL || "https://demandia-sdr.vercel.app").replace(/\/$/, "");
if ((!URL_SB || !KEY) && import.meta.url === `file://${process.argv[1]}`) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const NAO_E_SITE = /(mechameaqui|guiamais|apontador|telelistas|solutudo|facebook\.com|instagram\.com|linktr\.ee|wa\.me|whatsapp\.com|negocio\.site|business\.site|google\.com|goo\.gl|ifood|doctoralia|booksy|kiwify|canva\.com)/i;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif", "image/avif": "avif" };

export function chaveDoPdf(l) {
  return [l.diag_em ?? "", l.marca?.logo ?? "", l.site_tk ?? "", l.site_em ?? ""].join("|");
}

async function rest(caminho) {
  const r = await fetch(`${URL_SB}/rest/v1/${caminho}`, { headers: H });
  if (!r.ok) throw new Error(`${caminho.split("?")[0]} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function salvarLead(placeId, patch) {
  const r = await fetch(`${URL_SB}/rest/v1/outreach_leads?place_id=eq.${encodeURIComponent(placeId)}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`salvar ${r.status}: ${await r.text()}`);
}

async function subir(caminho, corpo, tipo) {
  const r = await fetch(`${URL_SB}/storage/v1/object/materiais/${caminho}`, {
    method: "POST",
    headers: { ...H, "Content-Type": tipo, "x-upsert": "true" },
    body: corpo,
  });
  if (!r.ok) throw new Error(`upload ${r.status}: ${await r.text()}`);
  return `${URL_SB}/storage/v1/object/public/materiais/${caminho}`;
}

const filaLogos = () =>
  rest(
    `outreach_leads?select=place_id,empresa,site,instagram,marca,duda_status,site_preview&wa_status=eq.pendente&rita_status=in.(pendente,aprovado,ajuste)&marca->>logo_checado=is.null&limit=25`,
  );

async function filaPdfs() {
  const sel = "place_id,empresa,relatorio_token,marca,diag_em:diagnosticos->>gerado_em,site_tk:site_preview->>token,site_em:site_preview->>gerado_em";
  const itens = await rest(`outreach_leads?select=${encodeURIComponent(sel)}&relatorio_token=not.is.null&duda_status=in.(pendente,aprovado)&wa_status=eq.pendente&limit=200`);
  return itens.filter((l) => l.diag_em && l.marca?.pdf_chave !== chaveDoPdf(l));
}

const nomeArquivo = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "empresa";
const handle = (ig) => (ig ?? "").match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1] ?? null;

/* ───────────── Logo ───────────── */

async function baixar(ctx, url) {
  try {
    if (!/^https?:\/\//i.test(url ?? "")) return null;
    const r = await ctx.request.get(url, { timeout: 20_000 });
    if (!r.ok()) return null;
    const tipo = (r.headers()["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!EXT[tipo]) return null;
    const corpo = await r.body();
    return corpo.length > 400 && corpo.length < 6_000_000 ? { corpo, tipo } : null;
  } catch {
    return null;
  }
}

/** Logo do topo do site: o arquivo original da imagem (melhor qualidade) ou um print do elemento. */
export async function logoDoSite(ctx, site) {
  const url = /^[a-z]+:\/\//i.test(site) ? site : `https://${site}`;
  const pag = await ctx.newPage();
  try {
    await pag.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await pag.waitForTimeout(2500);
    const alvo = await pag.evaluateHandle(() => {
      const visivel = (el) => {
        const r = el.getBoundingClientRect();
        return r.width >= 24 && r.height >= 16 && r.width <= 700 && r.height <= 320 && r.top < 900 && getComputedStyle(el).visibility !== "hidden";
      };
      const nota = (el) => {
        const cls = typeof el.className === "string" ? el.className : el.className?.baseVal ?? "";
        const txt = `${cls} ${el.id ?? ""} ${el.getAttribute("alt") ?? ""} ${el.getAttribute("src") ?? ""} ${el.parentElement?.className ?? ""}`;
        let p = 0;
        if (/logo|marca|brand/i.test(txt)) p += 5;
        if (el.closest("header, nav, [class*=header], [id*=header], [class*=topo]")) p += 3;
        const href = el.closest("a")?.getAttribute("href") ?? "";
        if (href === "/" || href === location.origin || href === `${location.origin}/` || href === "#") p += 2;
        if (el.getBoundingClientRect().top < 220) p += 2;
        if (/favicon|whatsapp|instagram|facebook|banner|slide|hero|seta|arrow|icon-|ico-/i.test(txt)) p -= 6;
        return p;
      };
      const cands = [...document.querySelectorAll("img, svg")].filter(visivel);
      cands.sort((a, b) => nota(b) - nota(a));
      return cands[0] && nota(cands[0]) >= 4 ? cands[0] : null;
    });
    const el = alvo.asElement();
    if (!el) return null;
    const src = await el.evaluate((e) => (e.tagName === "IMG" ? e.currentSrc || e.src : null));
    const original = src ? await baixar(ctx, src) : null;
    if (original && original.tipo !== "image/gif") return { ...original, fonte: "site" };
    const print = await el.screenshot({ omitBackground: true, type: "png" });
    return { corpo: print, tipo: "image/png", fonte: "site" };
  } catch {
    return null;
  } finally {
    await pag.close();
  }
}

/** Foto do perfil do Instagram (a maioria das empresas usa a logo). */
async function logoDoInstagram(ctx, ig) {
  const h = handle(ig);
  if (!h) return null;
  const pag = await ctx.newPage();
  try {
    await pag.goto(`https://www.instagram.com/${h}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const og = await pag.locator('meta[property="og:image"]').first().getAttribute("content", { timeout: 5000 }).catch(() => null);
    const img = og ? await baixar(ctx, og) : null;
    return img ? { ...img, fonte: "Instagram" } : null;
  } catch {
    return null;
  } finally {
    await pag.close();
  }
}

/**
 * Mede a logo: as duas cores principais (ignorando branco, preto e cinza quando há cor) e se ela pede fundo
 * escuro (logo branca em fundo transparente). Nulo se a imagem estiver vazia ou quebrada.
 */
export async function medir(ctx, img) {
  const pag = await ctx.newPage();
  try {
    const dataUrl = `data:${img.tipo};base64,${Buffer.from(img.corpo).toString("base64")}`;
    return await pag.evaluate(async (src) => {
      const im = new Image();
      im.src = src;
      await im.decode();
      const w = Math.min(im.naturalWidth || 300, 400);
      const h = Math.round(w * ((im.naturalHeight || 300) / (im.naturalWidth || 300))) || w;
      if (w < 24 || h < 16) return null;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.drawImage(im, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      let opacos = 0;
      let claros = 0;
      let transp = 0;
      const baldes = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const [r, gg, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
        if (a < 60) {
          transp++;
          continue;
        }
        opacos++;
        const max = Math.max(r, gg, b);
        const min = Math.min(r, gg, b);
        const sat = max ? (max - min) / max : 0;
        const lum = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
        if (lum > 0.86) claros++;
        if (sat < 0.22 || lum < 0.06 || lum > 0.93) continue;
        const k = `${r >> 4},${gg >> 4},${b >> 4}`;
        const o = baldes.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
        o.n++;
        o.r += r;
        o.g += gg;
        o.b += b;
        baldes.set(k, o);
      }
      if (opacos < 200) return null;
      const hex = (o) => "#" + [o.r / o.n, o.g / o.n, o.b / o.n].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("").toUpperCase();
      const matiz = (o) => {
        const [r, gg, b] = [o.r / o.n / 255, o.g / o.n / 255, o.b / o.n / 255];
        const max = Math.max(r, gg, b);
        const min = Math.min(r, gg, b);
        if (max === min) return 0;
        const dd = max - min;
        const hh = max === r ? ((gg - b) / dd) % 6 : max === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
        return (hh * 60 + 360) % 360;
      };
      const vivas = [...baldes.values()].filter((o) => o.n >= opacos * 0.01).sort((a, b) => b.n - a.n);
      const primaria = vivas[0] ?? null;
      const segunda = vivas.find((o) => o !== primaria && Math.min(Math.abs(matiz(o) - matiz(primaria)), 360 - Math.abs(matiz(o) - matiz(primaria))) > 35) ?? null;
      const fundo = transp > (opacos + transp) * 0.15 && claros > opacos * 0.3 ? "escuro" : "claro";
      return { primaria: primaria ? hex(primaria) : "#111111", secundaria: segunda ? hex(segunda) : null, fundo };
    }, dataUrl);
  } catch {
    return null;
  } finally {
    await pag.close();
  }
}

async function rodarLogos(ctx, fila) {
  let feitos = 0;
  for (const l of fila) {
    try {
      const marca = { ...(l.marca ?? {}) };
      let img = null;
      if (marca.logo_manual && marca.logo) {
        img = await baixar(ctx, marca.logo);
        if (img) img.fonte = "portal";
      } else {
        if (l.site && !NAO_E_SITE.test(l.site)) img = await logoDoSite(ctx, l.site);
        if (!img && l.instagram) img = await logoDoInstagram(ctx, l.instagram);
        if (!img && marca.logo && !/static\.canva\.com|^data:/i.test(marca.logo)) {
          img = await baixar(ctx, marca.logo);
          if (img) img.fonte = "Google";
        }
      }
      const medida = img ? await medir(ctx, img) : null;
      const patch = {};
      if (img && medida) {
        const link = marca.logo_manual
          ? marca.logo
          : await subir(`marcas/${nomeArquivo(l.empresa)}-${l.place_id.replace(/[^A-Za-z0-9_-]/g, "").slice(-24)}-${Date.now()}.${EXT[img.tipo]}`, img.corpo, img.tipo);
        Object.assign(marca, { logo: link, logo_fonte: img.fonte, cores: { primaria: medida.primaria, secundaria: medida.secundaria }, logo_fundo: medida.fundo });
        console.log(`Logo: ${l.empresa} (${img.fonte}) ${medida.primaria} ${medida.secundaria ?? ""} fundo ${medida.fundo}`);
        // Site de demonstração já montado sem a logo: a Duda refaz com a logo e as cores (só se ainda não foi aprovado)
        const semSite = !l.site || NAO_E_SITE.test(l.site);
        if (semSite && l.duda_status === "pendente" && l.site_preview) {
          patch.duda_status = "ajuste";
          patch.duda_nota = "Logo e cores do cliente capturadas: refaça o site com elas.";
        }
      } else {
        console.log(`Logo: ${l.empresa} sem logo encontrada`);
      }
      marca.logo_checado = true;
      patch.marca = marca;
      await salvarLead(l.place_id, patch);
      feitos++;
    } catch (e) {
      console.error(`Logo falhou ${l.empresa}:`, e.message ?? e);
    }
  }
  return feitos;
}

/* ───────────── PDF ───────────── */

async function rodarPdfs(nav, lista) {
  let feitos = 0;
  for (const l of lista.slice(0, 40)) {
    try {
      const pag = await nav.newPage();
      await pag.goto(`${APP}/relatorio/${l.relatorio_token}`, { waitUntil: "networkidle", timeout: 60_000 });
      await pag.emulateMedia({ media: "print" });
      await pag.evaluate(() => document.fonts.ready);
      // Espera as logos (DemandIA e cliente) carregarem antes de salvar
      await pag.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((ok) => ((i.onload = ok), (i.onerror = ok)))))));
      const pdf = await pag.pdf({ printBackground: true, preferCSSPageSize: true });
      await pag.close();
      const link = await subir(`relatorios/${nomeArquivo(l.empresa)}-${l.relatorio_token}-${Date.now()}.pdf`, pdf, "application/pdf");
      await salvarLead(l.place_id, { marca: { ...(l.marca ?? {}), pdf: link, pdf_chave: chaveDoPdf(l) } });
      feitos++;
      console.log(`PDF pronto: ${l.empresa}`);
    } catch (e) {
      console.error(`PDF falhou ${l.empresa}:`, e.message ?? e);
    }
  }
  return feitos;
}

async function main() {
  const logos = await filaLogos();
  const pdfs = await filaPdfs();
  if (process.argv.includes("--checar")) {
    console.log(logos.length || pdfs.length ? "tem=sim" : "tem=nao");
    return;
  }
  if (!logos.length && !pdfs.length) return console.log("Nada na fila");
  const { chromium } = await import("playwright");
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", viewport: { width: 1366, height: 900 } });
  const nLogos = logos.length ? await rodarLogos(ctx, logos) : 0;
  // A fila do PDF é lida de novo: a logo nova muda a chave do PDF
  const nPdfs = await rodarPdfs(nav, nLogos ? await filaPdfs() : pdfs);
  await nav.close();
  console.log(`${nLogos} logo(s) e ${nPdfs} PDF(s)`);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
