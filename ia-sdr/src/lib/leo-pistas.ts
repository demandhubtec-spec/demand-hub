/**
 * Léo (LDR) · leitura de pistas: CNPJ, sites, Instagram, LinkedIn e e-mails em textos soltos
 * (HTML do site, recado do WhatsApp, bio do Instagram, resultados de busca do Google).
 * Tudo puro e testável; quem busca na internet é o leo.ts.
 */

/** Só os dígitos do CNPJ, se for válido (confere os dígitos verificadores). */
export function cnpjValido(t: string): string | null {
  const d = (t ?? "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return null;
  const calc = (base: string, pesos: number[]) => {
    const s = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  if (calc(d, p1) !== Number(d[12]) || calc(d, p2) !== Number(d[13])) return null;
  return d;
}

/** Todos os CNPJs válidos de um texto (com ou sem pontuação), sem repetir. */
export function acharCnpjs(texto: string): string[] {
  const achados = (texto ?? "").match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-.\s]?\d{2}\b/g) ?? [];
  return [...new Set(achados.map(cnpjValido).filter(Boolean) as string[])];
}

export const formatarCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

const NAO_E_PERFIL_IG = new Set(["p", "reel", "reels", "explore", "accounts", "stories", "tv", "share", "sharer.php", "direct", "about", "legal", "developer"]);

/** Links e contatos que aparecem num texto (HTML, bio, recado do WhatsApp). */
export function linksDoTexto(texto: string): { sites: string[]; instagrams: string[]; linkedins: string[]; emails: string[] } {
  const t = (texto ?? "").replace(/&#64;|&commat;|\[at\]|\(at\)/gi, "@");
  const semEmails = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, " ");
  const urls = semEmails.match(/\bhttps?:\/\/[^\s"'<>)]+|\bwww\.[^\s"'<>)]+|\b[a-z0-9-]+\.(?:com\.br|com|net\.br|med\.br|adv\.br|odo\.br|vet\.br|site|online|br)(?:\/[^\s"'<>)]*)?/gi) ?? [];
  const instagrams = [
    ...new Set(
      [...t.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/gi)]
        .map((m) => m[1].replace(/\.$/, "").toLowerCase())
        .filter((h) => !NAO_E_PERFIL_IG.has(h)),
    ),
  ];
  const linkedins = [...new Set([...t.matchAll(/linkedin\.com\/(?:company|in)\/[A-Za-z0-9-_%]+/gi)].map((m) => `https://www.${m[0].toLowerCase()}`))];
  const emails = [
    ...new Set(
      (t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [])
        .map((e) => e.toLowerCase().replace(/\.$/, ""))
        .filter((e) => !/\.(png|jpe?g|gif|webp|svg|css|js)$|@(sentry|wixpress|example|exemplo|email|seudominio|dominio)\./.test(e)),
    ),
  ];
  const sites = [
    ...new Set(
      urls
        .map((u) => u.replace(/[.,;]+$/, ""))
        .filter((u) => !/instagram\.com|facebook\.com|linkedin\.com|wa\.me|whatsapp\.com|google\.|goo\.gl|youtube\.com|tiktok\.com|twitter\.com|x\.com\//i.test(u))
        .filter((u) => !/@/.test(u))
        .map((u) => (/^https?:/i.test(u) ? u : `https://${u}`)),
    ),
  ];
  return { sites, instagrams, linkedins, emails };
}

/** Palavras que contam numa comparação de nomes (sem acento, sem palavras genéricas). */
export function palavras(nome: string): string[] {
  const GENERICAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "clinica", "ltda", "me", "eireli", "epp", "sa", "s/a", "servicos", "comercio", "the", "and", "&", "-", "|"]);
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !GENERICAS.has(w));
}

/** Quanto dois nomes se parecem (0 a 1): fatia das palavras do primeiro que aparecem no segundo. */
export function parecido(a: string, b: string): number {
  const pa = palavras(a);
  const pb = new Set(palavras(b));
  if (!pa.length || !pb.size) return 0;
  return pa.filter((w) => pb.has(w) || [...pb].some((x) => x.length > 4 && (x.startsWith(w) || w.startsWith(x)))).length / pa.length;
}

export interface DadosCnpj {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  municipio: string | null;
  uf: string | null;
  telefone: string | null;
  email: string | null;
  situacao: string | null;
  cnae: string | null;
  abertura: string | null;
  porte: string | null;
  socios: { nome: string; qualificacao: string | null }[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Resposta da BrasilAPI (/api/cnpj/v1) no nosso formato. */
export function lerBrasilApi(j: any): DadosCnpj | null {
  if (!j?.cnpj || !j?.razao_social) return null;
  const tel = [j.ddd_telefone_1, j.ddd_telefone_2].map((t: string) => (t ?? "").replace(/\D/g, "")).find((t: string) => t.length >= 10) ?? null;
  return {
    cnpj: String(j.cnpj).replace(/\D/g, ""),
    razao_social: j.razao_social,
    nome_fantasia: j.nome_fantasia || null,
    municipio: j.municipio || null,
    uf: j.uf || null,
    telefone: tel,
    email: j.email ? String(j.email).toLowerCase() : null,
    situacao: j.descricao_situacao_cadastral || null,
    cnae: j.cnae_fiscal_descricao || null,
    abertura: j.data_inicio_atividade || null,
    porte: j.porte || j.descricao_porte || null,
    socios: Array.isArray(j.qsa) ? j.qsa.map((s: any) => ({ nome: titulo(s.nome_socio ?? ""), qualificacao: s.qualificacao_socio ?? null })).filter((s: any) => s.nome) : [],
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** "MARIA DA SILVA" → "Maria da Silva" */
export function titulo(nome: string): string {
  return (nome ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (["da", "de", "do", "das", "dos", "e"].includes(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Entre os CNPJs encontrados, qual é desta empresa? Precisa ser da mesma cidade e o nome
 * (fantasia ou razão social) precisa lembrar o nome do Google. Ativa vale mais.
 */
export function escolherCnpj(dados: DadosCnpj[], empresa: string, cidade: string | null): DadosCnpj | null {
  const semAcento = (s: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const nota = (d: DadosCnpj) => {
    if (cidade && d.municipio && semAcento(d.municipio) !== semAcento(cidade)) return 0;
    const nome = Math.max(parecido(empresa, d.nome_fantasia ?? ""), parecido(empresa, d.razao_social), parecido(d.nome_fantasia ?? "", empresa));
    if (nome < 0.5) return 0;
    return nome + (/ativa/i.test(d.situacao ?? "") ? 0.5 : 0);
  };
  const melhor = dados.map((d) => ({ d, n: nota(d) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)[0];
  return melhor?.d ?? null;
}

/** Quem é o dono: sócio-administrador primeiro; se só tem um sócio, é ele. */
export function donoDoQsa(socios: DadosCnpj["socios"]): DadosCnpj["socios"][number] | null {
  if (!socios.length) return null;
  return socios.find((s) => /administrador/i.test(s.qualificacao ?? "")) ?? socios[0];
}

export interface ResultadoBusca {
  title?: string;
  url?: string;
  description?: string;
}

/** Instagram da empresa nos resultados do Google: o perfil cujo título lembra o nome da empresa. */
export function instagramNaBusca(res: ResultadoBusca[], empresa: string): string | null {
  for (const r of res) {
    const m = (r.url ?? "").match(/instagram\.com\/([A-Za-z0-9._]{2,30})\/?$/i);
    if (!m || NAO_E_PERFIL_IG.has(m[1].toLowerCase())) continue;
    if (parecido(empresa, `${r.title ?? ""} ${m[1].replace(/[._]/g, " ")}`) >= 0.5) return `https://www.instagram.com/${m[1].toLowerCase()}/`;
  }
  return null;
}

/** Perfil (LinkedIn ou Instagram) de uma pessoa: o título precisa ter o primeiro e o último nome dela. */
export function perfilDaPessoa(res: ResultadoBusca[], nome: string, rede: "linkedin" | "instagram"): string | null {
  const p = palavras(nome);
  if (p.length < 2) return null;
  const [primeiro, ultimo] = [p[0], p[p.length - 1]];
  for (const r of res) {
    const url = r.url ?? "";
    const ok = rede === "linkedin" ? /linkedin\.com\/in\//i.test(url) : /instagram\.com\/[A-Za-z0-9._]{2,30}\/?$/i.test(url);
    if (!ok) continue;
    const t = palavras(`${r.title ?? ""} ${url.replace(/[-_.\/]/g, " ")}`);
    if (t.includes(primeiro) && t.includes(ultimo)) return url.split("?")[0];
  }
  return null;
}

/**
 * Telefone brasileiro no formato do WhatsApp (55 + DDD + número), ou null.
 * Aceita com ou sem 55, com zero do DDD, com pontuação. Celular (9 dígitos) ou fixo (8).
 */
export function normalizarTelefone(t: string | null | undefined): string | null {
  let d = (t ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55[1-9][1-9]\d{8,9}$/.test(d)) return null;
  const n = d.slice(4);
  if (n.length === 9 && n[0] !== "9") return null; // 9 dígitos só se for celular
  if (n.length === 8 && !/^[2-5]/.test(n)) return null; // fixo começa com 2 a 5
  return d;
}

export const ehCelular = (t: string) => /^55\d{2}9\d{8}$/.test(t);

/**
 * Números de telefone num texto (HTML do site, bio do Instagram, recado do WhatsApp).
 * Ordem de preferência: link direto do WhatsApp (wa.me, api.whatsapp.com), depois celulares, depois fixos.
 */
export function telefonesDoTexto(texto: string): string[] {
  const t = (texto ?? "").replace(/&nbsp;|\u00a0/g, " ");
  const doWhats = [...t.matchAll(/(?:wa\.me\/|whatsapp\.com\/send\/?\?(?:[^"'\s<>]*&(?:amp;)?)?phone=|whatsapp:\/\/send\?phone=)\+?(\d{10,13})/gi)].map((m) => normalizarTelefone(m[1]));
  const soltos = [...t.matchAll(/(?<![\d/.-])(?:\+?55[\s.-]?)?\(?0?([1-9]\d)\)?[\s.-]?(9[\s.]?\d{4}|[2-5]\d{3})[\s.-]?(\d{4})(?![\d/-])/g)].map((m) =>
    normalizarTelefone(`${m[1]}${m[2].replace(/\D/g, "")}${m[3]}`),
  );
  const unicos = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])];
  const whats = unicos(doWhats);
  const resto = unicos(soltos).filter((x) => !whats.includes(x));
  return [...whats, ...resto.filter(ehCelular), ...resto.filter((x) => !ehCelular(x))].slice(0, 8);
}
