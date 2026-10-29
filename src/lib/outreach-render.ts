/**
 * Render das mensagens de prospecção (spintax + variáveis).
 *
 * CÓPIA FIEL do render da Edge Function outreach-wa-tick (Supabase). Se mudar lá, mude aqui,
 * e também em ia-sdr/src/lib/outreach-render.ts. É isso que garante que a prévia do portal
 * mostre exatamente o que o motor envia.
 *
 * Única diferença: `rnd` opcional, para a prévia poder "re-sortear" de forma controlada.
 */

export interface RenderLead {
  empresa?: string | null;
  decisor?: string | null;
  cidade?: string | null;
  nicho?: string | null;
}

export const NICHO_PLURAL: Record<string, string> = {
  "Clínica médica": "clínicas",
  "Advocacia": "escritórios de advocacia",
  "Odontologia": "clínicas odontológicas",
  "Imobiliária": "imobiliárias",
  "Pet shop / Veterinária": "pet shops e clínicas veterinárias",
  "Endocrinologia": "consultórios de endocrinologia",
};

type Rnd = () => number;
const pick = <T,>(a: T[], rnd: Rnd) => a[Math.floor(rnd() * a.length)];

export function spHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(now),
  );
}

export function saudacao(rnd: Rnd = Math.random, now = new Date()) {
  const h = spHour(now);
  if (h < 12) return pick(["Bom dia", "Olá, bom dia"], rnd);
  if (h < 18) return pick(["Boa tarde", "Olá, boa tarde"], rnd);
  return "Boa noite";
}

export function primeiroNome(d?: string | null) {
  if (!d) return "";
  const n = d.trim().split(/\s+/)[0];
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

export function limpaEmpresa(n: string | null | undefined) {
  return (n || "").split(/\s+[|\-–•]\s+/)[0].trim();
}

export function spin(t: string, rnd: Rnd = Math.random) {
  const re = /\{([^{}]*\|[^{}]*)\}/;
  while (re.test(t)) t = t.replace(re, (_m, g: string) => pick(g.split("|"), rnd));
  return t;
}

export function render(text: string, lead: RenderLead, rnd: Rnd = Math.random, now = new Date()) {
  const pn = primeiroNome(lead.decisor);
  const vars: Record<string, string> = {
    "saudacao": saudacao(rnd, now),
    ", primeiro_nome": pn ? `, ${pn}` : "",
    "primeiro_nome": pn,
    "empresa": limpaEmpresa(lead.empresa),
    "cidade": lead.cidade || "",
    "nicho": lead.nicho || "",
    "nicho_plural": NICHO_PLURAL[lead.nicho ?? ""] || "empresas",
  };
  for (const [k, v] of Object.entries(vars)) text = text.split(`{{${k}}}`).join(v);
  return spin(text, rnd).trim();
}

export const VARIAVEIS = [
  { tag: "{{saudacao}}", desc: "Bom dia / Boa tarde / Boa noite (com variações)" },
  { tag: "{{primeiro_nome}}", desc: "Primeiro nome do decisor" },
  { tag: "{{, primeiro_nome}}", desc: '", Fulano" ou some se não houver decisor' },
  { tag: "{{empresa}}", desc: "Nome da empresa (corta o que vem depois de - ou |)" },
  { tag: "{{cidade}}", desc: "Cidade do lead" },
  { tag: "{{nicho}}", desc: "Nicho como está no lead" },
  { tag: "{{nicho_plural}}", desc: 'Ex: "clínicas odontológicas" (ou "empresas")' },
];
