/**
 * Score de qualidade do lead (28/11/2026, Kelvin): de 0 a 100, em 4 blocos, para decidir a abordagem.
 *  - Porte e fôlego (30): avaliações no Google na faixa do nicho, porte do CNPJ, CNPJ ativo.
 *  - Empresa ativa (25): Instagram com seguidores e post recente, nota no Google, cuida do perfil.
 *  - Dor visível (25): sem site próprio, mal posicionado no Google, depende de app/link de terceiros, não responde avaliações.
 *  - Contato (20): WhatsApp celular, nome de quem decide, e-mail.
 * Faixas: A (70+) liga primeiro e WhatsApp personalizado; B (50 a 69) WhatsApp pela dor; C (abaixo de 50) só o leve, no fim da fila.
 * Só usa dados já coletados (Google, CNPJ do Léo, Instagram pelo Apify): nada é inventado.
 */

export type Faixa = "A" | "B" | "C";
export type SegmentoScore = "restaurante" | "saude" | "educacao" | "academia" | "imobiliaria" | "construtora" | "b2b" | "outros";

export interface PerfilIg {
  seguidores: number | null;
  posts?: number | null;
  link?: string | null;
  ultimo_post?: string | null;
}

export interface LeadParaScore {
  nicho?: string | null;
  empresa?: string | null;
  avaliacoes?: number | null;
  nota?: number | string | null;
  fotos?: number | null;
  tem_descricao?: boolean | null;
  tem_horario?: boolean | null;
  responde_avaliacoes?: number | string | null;
  posicao_busca?: number | null;
  site?: string | null;
  site_fonte?: string | null;
  instagram?: string | null;
  observacoes?: string | null;
  whatsapp?: string | null;
  decisor?: string | null;
  socios?: unknown;
  email?: string | null;
  cnpj_email?: string | null;
  porte?: string | null;
  cnpj_situacao?: string | null;
  ig_perfil?: PerfilIg | null;
}

export interface Score {
  score: number;
  faixa: Faixa;
  dor: string | null;
  blocos: { porte: number; ativa: number; dor: number; contato: number };
  motivos: string[];
}

export function segmentoParaScore(nicho?: string | null, empresa?: string | null): SegmentoScore {
  const n = `${nicho ?? ""} ${empresa ?? ""}`.toLowerCase();
  if (/distribuidora|distribui[cç][aã]o|atacad|tabacaria|head ?shop|importadora|ind[uú]stria/.test(n)) return "b2b";
  if (/aliment|restaur|hamburg|burger|pizz|lanch|caf[eé]|confeit|doce|salgad|marmit|delivery|gastronom|food|a[cç]a[ií]|gelat|sorvet|churras|espetaria/.test(n)) return "restaurante";
  if (/cl[ií]nic|m[eé]dic|odont|dent|endocrin|est[eé]tic|harmoniza|dermat|nutri|fisio|psic|sa[uú]de/.test(n)) return "saude";
  if (/educa[cç]|faculdade|universit|curso|t[eé]cnic|idioma|ingl[eê]s|escola/.test(n)) return "educacao";
  if (/academia|crossfit|pilates|fitness|funcional|muscula/.test(n)) return "academia";
  if (/imobili|im[oó]veis|corretor/.test(n)) return "imobiliaria";
  if (/construtora|incorporadora|loteamento/.test(n)) return "construtora";
  return "outros";
}

/** Faixa de avaliações no Google que indica negócio com movimento e fôlego, por segmento. */
const FAIXA_AVALIACOES: Record<SegmentoScore, [number, number]> = {
  restaurante: [50, 3000],
  saude: [30, 1500],
  educacao: [20, 2000],
  academia: [30, 2500],
  imobiliaria: [5, 600],
  construtora: [1, 1000],
  b2b: [1, 1000],
  outros: [20, 1500],
};

const num = (x: unknown): number | null => {
  const v = typeof x === "string" ? Number(x.replace(",", ".")) : typeof x === "number" ? x : NaN;
  return Number.isFinite(v) ? v : null;
};

/** Seguidores anotados na coleta ("1,3 mil seguidores", "850 seguidores"), quando ainda não há perfil lido. */
export function seguidoresDaObservacao(obs?: string | null): number | null {
  const m = String(obs ?? "").match(/([0-9]+(?:[.,][0-9]+)?)\s*(mil|k)?\s*seguidores/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1].replace(",", ".")) * (m[2] ? 1000 : 1));
}

/** WhatsApp de celular (DDD + 9 dígitos começando com 9)? Fixo costuma cair na recepção. */
export function ehCelular(w?: string | null): boolean {
  const d = String(w ?? "").replace(/\D/g, "").replace(/^55/, "");
  return d.length === 11 && d[2] === "9";
}

/** O site é de terceiros (Instagram, Linktree, iFood, WhatsApp) e não um site próprio? */
export function semSiteProprio(site?: string | null, fonte?: string | null): boolean {
  const s = String(site ?? "").toLowerCase();
  if (!s) return true;
  if (/instagram|linktr|linktree|ifood|wa\.me|whatsapp|facebook|goomer|anota\.?ai|beacons|bio\.link|linkbio/.test(s)) return true;
  return /instagram|linktree/.test(String(fonte ?? "").toLowerCase());
}

const dias = (iso: string | null | undefined, agora: Date) => (iso ? (agora.getTime() - new Date(iso).getTime()) / 864e5 : null);

export function faixaDoScore(score: number): Faixa {
  return score >= 70 ? "A" : score >= 50 ? "B" : "C";
}

export function calcularScore(l: LeadParaScore, agora = new Date()): Score {
  const seg = segmentoParaScore(l.nicho, l.empresa);
  const motivos: string[] = [];
  const dores: { peso: number; texto: string }[] = [];

  // ── Porte e fôlego (30)
  let porte = 0;
  const av = num(l.avaliacoes);
  const [min, max] = FAIXA_AVALIACOES[seg];
  if (av === null) porte += 5;
  else if (av >= min && av <= max) { porte += 15; motivos.push(`${av} avaliações no Google`); }
  else if (av > max) porte += 8; // rede grande: tem fôlego, mas costuma já ter agência
  else if (av >= min / 2) porte += 7;
  const p = String(l.porte ?? "").toUpperCase();
  if (/DEMAIS/.test(p)) { porte += 10; motivos.push("porte acima de EPP"); }
  else if (/EPP/.test(p)) { porte += 9; motivos.push("EPP"); }
  else if (/\bME\b/.test(p)) porte += 7;
  else if (/MEI/.test(p)) porte += 0;
  else porte += 4;
  const sit = String(l.cnpj_situacao ?? "").toUpperCase();
  if (/ATIVA/.test(sit)) porte += 5;
  else if (!sit) porte += 2;
  porte = Math.min(30, porte);

  // ── Empresa ativa (25)
  let ativa = 0;
  const ig = l.ig_perfil ?? null;
  const seg_ = ig?.seguidores ?? seguidoresDaObservacao(l.observacoes);
  if (seg_ !== null && seg_ !== undefined) {
    if (seg_ >= 1000) { ativa += 8; motivos.push(`${seg_ >= 1000 ? `${(seg_ / 1000).toFixed(seg_ >= 10000 ? 0 : 1).replace(".", ",")} mil` : seg_} seguidores`); }
    else if (seg_ >= 300) ativa += 4;
  } else if (l.instagram) ativa += 3;
  const d = dias(ig?.ultimo_post, agora);
  if (d !== null) {
    if (d <= 30) { ativa += 7; motivos.push("posta no Instagram"); }
    else if (d <= 90) ativa += 3;
    else dores.push({ peso: 4, texto: `Instagram parado há ${Math.round(d)} dias` });
  } else if (l.instagram) ativa += 2;
  const nota = num(l.nota);
  if (nota !== null) {
    if (nota >= 4.3) ativa += 5;
    else if (nota >= 4) ativa += 3;
  } else ativa += 1;
  const cuida = (num(l.responde_avaliacoes) ?? 0) >= 0.3 || (num(l.fotos) ?? 0) >= 20 || (l.tem_descricao && l.tem_horario);
  if (cuida) ativa += 5;
  ativa = Math.min(25, ativa);

  // ── Dor visível (25)
  let dor = 0;
  if (semSiteProprio(l.site, l.site_fonte)) { dor += 8; dores.push({ peso: 8, texto: "não tem site próprio" }); }
  const pos = num(l.posicao_busca);
  if (pos !== null && pos > 10) { dor += 7; dores.push({ peso: 7, texto: `aparece em ${pos}º no Google` }); }
  else if (pos !== null && pos > 3) { dor += 5; dores.push({ peso: 5, texto: `aparece em ${pos}º no Google` }); }
  const link = String(ig?.link ?? l.site ?? "").toLowerCase();
  if (seg === "restaurante" && /ifood|anota\.?ai|goomer/.test(link)) { dor += 5; dores.push({ peso: 6, texto: "vende pelo iFood (paga taxa em cada pedido)" }); }
  else if (seg !== "restaurante" && /wa\.me|whatsapp|linktr/.test(link)) { dor += 3; dores.push({ peso: 3, texto: "o atendimento depende só do WhatsApp, sem agendamento" }); }
  const resp = num(l.responde_avaliacoes);
  if (resp !== null && resp < 0.2 && (av ?? 0) >= 10) { dor += 5; dores.push({ peso: 5, texto: "não responde as avaliações do Google" }); }
  dor = Math.min(25, dor);

  // ── Contato (20)
  let contato = 0;
  if (ehCelular(l.whatsapp)) { contato += 8; motivos.push("WhatsApp celular"); }
  else if (l.whatsapp) contato += 3;
  const temSocio = Array.isArray(l.socios) && l.socios.length > 0;
  if (l.decisor || temSocio) { contato += 7; motivos.push("sabemos quem decide"); }
  if (l.email || l.cnpj_email) contato += 5;
  contato = Math.min(20, contato);

  const score = Math.max(0, Math.min(100, Math.round(porte + ativa + dor + contato)));
  dores.sort((a, b) => b.peso - a.peso);
  return { score, faixa: faixaDoScore(score), dor: dores[0]?.texto ?? null, blocos: { porte, ativa, dor, contato }, motivos };
}

/** Linha para a Gabi/Marina e para a ligação: faixa, dor principal e o que pesou. */
export function scoreEmTexto(s: { score?: number | null; score_faixa?: string | null; score_dor?: string | null } | null | undefined): string {
  if (!s?.score_faixa) return "";
  const abordagem =
    s.score_faixa === "A"
      ? "lead forte: personalize com um dado real da empresa e convide para a consultoria"
      : s.score_faixa === "B"
        ? "lead médio: abra pela dor principal"
        : "lead fraco: mensagem leve, sem insistir";
  return `Qualidade do lead: ${s.score_faixa} (${s.score ?? "?"}/100) · ${abordagem}${s.score_dor ? ` · dor mais visível: ${s.score_dor}` : ""}`;
}
