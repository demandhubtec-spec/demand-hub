/**
 * Identidade criada para quem não tem logo (12/11/2026, pedido do Kelvin: "pega os padrões do segmento, do
 * nicho, dos concorrentes e cria esse padrão para quem não tem logo").
 *
 * Cada nicho tem 2 ou 3 paletas tiradas do que o mercado usa (endocrinologia: verde-água e petróleo com
 * dourado; odontologia: azul-turquesa; imobiliária: marinho com dourado; pet: laranja e verde...). A paleta
 * é escolhida pelo nome da empresa, então dois concorrentes do mesmo nicho não saem iguais.
 * A marca criada é um emblema (monograma com as iniciais para médico e profissional, símbolo do nicho
 * para empresa) + o nome + a especialidade embaixo. Tudo calculado na hora de mostrar: as prévias que já
 * existem mudam sozinhas, sem gerar o site de novo.
 */
import type { CoresMarca } from "./site-marca.ts";

export type Simbolo = "molecula" | "dente" | "casa" | "pata" | "coracao" | "folha" | "olho" | "cruz" | "balanca" | "brilho" | "laco" | "mente" | "osso" | "bebe";

interface Nicho {
  /** Palavras que identificam o nicho (nicho do Google ou nome da empresa). */
  chave: RegExp;
  simbolo: Simbolo;
  /** Especialidade que aparece embaixo do nome quando o nome não diz. */
  rotulo: string;
  /** [destaque, fundo escuro, segunda cor] */
  paletas: [string, string, string][];
}

// Ordem importa: o mais específico antes (endocrinologia pediátrica antes de pediatria, por exemplo).
const NICHOS: Nicho[] = [
  { chave: /endocrin|diabet|metabol|tireoid|horm/i, simbolo: "molecula", rotulo: "Endocrinologia", paletas: [["#1E8C86", "#0B2E33", "#C9A45C"], ["#3F7D6E", "#13302A", "#D8B98A"], ["#2B6F8F", "#0C2533", "#7FC8C2"], ["#8A5A7A", "#2A1A26", "#D9B7A0"], ["#4A6FA5", "#121E33", "#E0A96D"]] },
  { chave: /odonto|dent|sorriso|implant|ortodon/i, simbolo: "dente", rotulo: "Odontologia", paletas: [["#0E8FB8", "#062B3D", "#7ED3E8"], ["#1B6FB3", "#0A2240", "#56C2C9"], ["#14928A", "#08302D", "#9ADBD3"], ["#5A6FB5", "#151B38", "#9FD3E0"], ["#2D7F9A", "#0D2530", "#E7B56A"]] },
  { chave: /pediatr|infantil|crian/i, simbolo: "bebe", rotulo: "Pediatria", paletas: [["#3A8DDE", "#102A4C", "#F28C6B"], ["#2FA39A", "#0D3532", "#F6B860"]] },
  { chave: /dermat|pele|estetic|harmoniza|beleza|spa\b|cosmet/i, simbolo: "brilho", rotulo: "Estética e dermatologia", paletas: [["#B8846B", "#3A2620", "#E2C2A8"], ["#A86F7A", "#35202A", "#E8C9B8"], ["#9C7A54", "#2E2418", "#D9C3A0"]] },
  { chave: /cardio|cora[cç]/i, simbolo: "coracao", rotulo: "Cardiologia", paletas: [["#B83A4B", "#2E0F18", "#E9A5A0"], ["#9E2F45", "#1F1A2E", "#5B7DB1"]] },
  { chave: /onco|c[aâ]ncer/i, simbolo: "laco", rotulo: "Oncologia", paletas: [["#7B4FB0", "#24163A", "#E0A8C8"], ["#6A5ACD", "#1C1838", "#9ED8C8"]] },
  { chave: /gineco|obstet|mulher|maternid|fertil/i, simbolo: "coracao", rotulo: "Saúde da mulher", paletas: [["#C0567A", "#3A1626", "#E9B7A6"], ["#A85C7F", "#2C1A27", "#D8B48C"]] },
  { chave: /oftalm|vis[aã]o|olho|[oó]tica/i, simbolo: "olho", rotulo: "Oftalmologia", paletas: [["#1C6FD1", "#0B1F3F", "#5CC8E0"], ["#2A7F9E", "#0C2A36", "#F0B54A"]] },
  { chave: /ortoped|fisio|coluna|esport|pilates|quiropr/i, simbolo: "osso", rotulo: "Ortopedia e reabilitação", paletas: [["#1F7A5A", "#0B2A22", "#7CC4A4"], ["#2563B0", "#0D1F3A", "#5BC0A0"]] },
  { chave: /psic|psiq|terap|mente|neuro/i, simbolo: "mente", rotulo: "Saúde mental", paletas: [["#6E7FB5", "#1E2238", "#B9C9A8"], ["#7A9A7E", "#1E2A22", "#C8B6D8"]] },
  { chave: /nutri|aliment|emagrec/i, simbolo: "folha", rotulo: "Nutrição", paletas: [["#4F9A3A", "#17301A", "#F2B544"], ["#2F8F6A", "#0E2D22", "#E8A15C"]] },
  { chave: /vet|pet|animal|agro|ra[cç][aã]o|banho e tosa/i, simbolo: "pata", rotulo: "Pet e veterinária", paletas: [["#E07A2E", "#2B1A10", "#3FA27A"], ["#2E9A6A", "#0F2A20", "#F2A93B"]] },
  { chave: /imob|im[oó]ve|corret|haras|condom|loteam/i, simbolo: "casa", rotulo: "Negócios imobiliários", paletas: [["#B08A3E", "#111C2E", "#1F3A5F"], ["#C26B2E", "#1D1F24", "#8C9AA8"], ["#2C6E63", "#0F1F1C", "#C9A45C"]] },
  { chave: /advoc|jur[ií]d|direito|contab/i, simbolo: "balanca", rotulo: "Advocacia", paletas: [["#A8843F", "#121A2B", "#5E6F8A"], ["#8C2F3A", "#1A1418", "#B89A5E"]] },
  { chave: /anestes|cl[ií]nica|m[eé]dic|sa[uú]de|hospital|laborat|exame/i, simbolo: "cruz", rotulo: "Clínica médica", paletas: [["#1F6F9E", "#0B2236", "#4FB3A5"], ["#2E7D6B", "#0E2822", "#7FB6D6"], ["#3157A8", "#101C38", "#62C1B5"]] },
];

const PADRAO: Nicho = { chave: /$^/, simbolo: "brilho", rotulo: "", paletas: [["#2F6FB0", "#0E1E33", "#E3A54B"], ["#2E8A72", "#0E2A23", "#E39B5B"], ["#7A4FB0", "#21163A", "#5CC0B0"]] };

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  // mistura final (murmur3): sem ela o resto da divisão por 3 ou 5 sai quase sempre igual
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function nichoDe(nicho: string | null | undefined, empresa = ""): Nicho {
  const alvo = `${nicho ?? ""} ${empresa}`;
  return NICHOS.find((n) => n.chave.test(nicho ?? "")) ?? NICHOS.find((n) => n.chave.test(alvo)) ?? PADRAO;
}

/** Paleta do nicho para quem não tem logo (mesmo formato da paleta tirada da logo). */
export function paletaDoNicho(nicho: string | null | undefined, empresa: string): CoresMarca {
  const n = nichoDe(nicho, empresa);
  const [cor, escura, cor2] = n.paletas[hash(empresa.toLowerCase()) % n.paletas.length];
  const mistura = (h: string, t: number) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `#${c.map((x) => Math.round(x + (255 - x) * t).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  };
  return { cor, escura, clara: mistura(cor, 0.9), texto_no_destaque: "#FFFFFF", cor2 };
}

const DOUTOR = /^(dr|dra|doutor|doutora)\.?\s/i;

/**
 * Nome da marca e a linha de baixo. "Dra. Laura Pazinato I Endocrinologista" vira
 * { nome: "Dra. Laura Pazinato", sub: "Endocrinologista" }; "Clínica EEMA (Dr. Murilo...)" vira "Clínica EEMA".
 */
export function nomeDaMarca(empresa: string, nicho?: string | null): { nome: string; sub: string; pessoa: boolean } {
  const limpo = (empresa || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const partes = limpo.split(/\s+[|I\-–—•]\s+|\s*\|\s*|,\s+/).map((x) => x.trim()).filter(Boolean);
  const nome = partes[0] || limpo || empresa;
  const pessoa = DOUTOR.test(nome);
  const resto = partes.slice(1).join(" · ").replace(/\s+em\s+[A-ZÀ-Ú][\wÀ-ú ]+$/u, "").trim();
  const rotulo = nichoDe(nicho, empresa).rotulo || (nicho ?? "");
  // Não repete o que o nome já diz ("FM Cardoso Negócios Imobiliários" não ganha "Negócios imobiliários" embaixo)
  const repete = rotulo && nome.toLowerCase().includes(rotulo.split(/\s+/).pop()!.toLowerCase().slice(0, 6));
  const sub = resto || (repete ? "" : rotulo);
  return { nome, sub: sub.length > 44 ? sub.slice(0, 44).replace(/\s+\S*$/, "") : sub, pessoa };
}

/** Iniciais do monograma: para médico, nome e sobrenome (sem o "Dra."); para empresa, as 2 primeiras palavras. */
export function siglaDaMarca(nome: string): string {
  const palavras = nome
    .replace(DOUTOR, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ú0-9]/.test(w) && !/^(de|da|do|das|dos|e|&|clinica|clínica|consultorio|consultório)$/i.test(w));
  if (!palavras.length) return "";
  const ini = (w: string) => w[0].toUpperCase();
  if (DOUTOR.test(nome)) return palavras.length > 1 ? ini(palavras[0]) + ini(palavras[palavras.length - 1]) : ini(palavras[0]);
  return palavras.slice(0, 2).map(ini).join("");
}

export interface MarcaCriada {
  nome: string;
  sub: string;
  sigla: string;
  simbolo: Simbolo;
  /** Médico ou profissional: emblema com monograma. Empresa: emblema com o símbolo do nicho. */
  monograma: boolean;
}

export function marcaCriada(empresa: string, nicho?: string | null): MarcaCriada {
  const { nome, sub, pessoa } = nomeDaMarca(empresa, nicho);
  const sigla = siglaDaMarca(nome);
  return { nome, sub, sigla, simbolo: nichoDe(nicho, empresa).simbolo, monograma: pessoa && !!sigla };
}
