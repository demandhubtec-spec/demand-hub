/**
 * Prospecção ativa · completa e-mail e Instagram lendo o site da própria empresa
 * (a ficha do Google quase nunca traz e-mail: em 30/10 só 7 de 36 empresas tinham).
 */
import { semSiteProprio } from "./extras.ts";

const NAO_E_EMAIL = /\.(png|jpe?g|gif|webp|svg|css|js)$|@(sentry|wixpress|example|exemplo|email|seudominio|dominio)\.|^(nome|seu|seuemail|email|user|usuario)@/i;
const PREFERIDOS = /^(contato|comercial|marketing|atendimento|adm|administrativo|financeiro|secretaria|recepcao|clinica|escritorio)@/i;
const NAO_E_PERFIL = new Set(["p", "reel", "reels", "explore", "accounts", "stories", "tv", "share", "sharer.php"]);

/** E-mails e Instagram encontrados no HTML de uma página. O e-mail do próprio domínio vem primeiro. */
export function extrairContatos(html: string, site: string): { emails: string[]; instagram: string | null } {
  const dominio = (() => {
    try {
      return new URL(/^https?:/i.test(site) ? site : `https://${site}`).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const texto = html.replace(/&#64;|&commat;|\[at\]|\(at\)/gi, "@");
  const achados = [...new Set((texto.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map((e) => e.toLowerCase().replace(/\.$/, "")))].filter(
    (e) => !NAO_E_EMAIL.test(e),
  );
  const peso = (e: string) => (dominio && e.endsWith(`@${dominio}`) ? 0 : 2) + (PREFERIDOS.test(e) ? 0 : 1);
  const emails = achados.sort((a, b) => peso(a) - peso(b)).slice(0, 3);
  const ig = [...texto.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/gi)].map((m) => m[1].replace(/\.$/, "")).find((h) => !NAO_E_PERFIL.has(h.toLowerCase()));
  return { emails, instagram: ig ? `https://www.instagram.com/${ig}/` : null };
}

async function baixar(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; DemandHub/1.0)" }, redirect: "follow" });
    if (!r.ok) return "";
    return (await r.text()).slice(0, 600_000);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

/** Lê a página inicial e a de contato do site; devolve o melhor e-mail e o Instagram, se achar. */
export async function contatosDoSite(site: string | null | undefined): Promise<{ email: string | null; instagram: string | null }> {
  if (!site || semSiteProprio(site)) return { email: null, instagram: null };
  const base = (/^https?:/i.test(site) ? site : `https://${site}`).replace(/\/+$/, "");
  let email: string | null = null;
  let instagram: string | null = null;
  for (const url of [base, `${base}/contato`, `${base}/fale-conosco`, `${base}/contact`]) {
    const html = await baixar(url);
    if (!html) continue;
    const c = extrairContatos(html, site);
    email ??= c.emails[0] ?? null;
    instagram ??= c.instagram;
    if (email && instagram) break;
  }
  return { email, instagram };
}
