/**
 * Landing page do diagnóstico gratuito (/diagnostico).
 * Valida o formulário, transforma as respostas em dados do lead (BANT) e monta
 * a mensagem de contexto que faz a IA SDR abrir a conversa no WhatsApp.
 */
import { evaluateBant } from "./bant.ts";

export const FAIXAS: Record<string, { label: string; piso: number }> = {
  ate_30k: { label: "Até R$ 30 mil", piso: 15_000 },
  "30k_50k": { label: "R$ 30 a 50 mil", piso: 30_000 },
  "50k_100k": { label: "R$ 50 a 100 mil", piso: 50_000 },
  "100k_300k": { label: "R$ 100 a 300 mil", piso: 100_000 },
  "300k_1mi": { label: "R$ 300 mil a 1 milhão", piso: 300_000 },
  "1mi_mais": { label: "Acima de R$ 1 milhão", piso: 1_000_000 },
};

export const PRAZOS: Record<string, string> = {
  imediato: "Agora",
  ate_3_meses: "Em até 3 meses",
  "3_a_6_meses": "Em 3 a 6 meses",
  sem_previsao: "Só pesquisando",
};

const CARGOS: Record<string, string> = { dono: "Dono(a) / sócio(a)", diretor: "Diretor(a) / gestor(a)", colaborador: "Colaborador(a)" };

/** Dor marcada no formulário → dor que a IA usa no BANT (N) */
const DOR_N: Record<string, string> = {
  "Poucos clientes chegando": "quer mais leads e mais demanda",
  "Contatos que não viram venda": "marketing ineficiente / quer melhorar o marketing",
  "Demora para responder os contatos": "quer colocar IA para rodar (atendimento, SDR, etc.)",
  "Muito trabalho manual e repetitivo": "quer automatizar processos",
  "Equipe cara ou sobrecarregada": "quer automatizar processos",
  "Falta de controle de clientes e vendas": "quer implementar um sistema / software",
  "Margem baixa": "quer automatizar processos",
  "Site ou presença digital fraca": "site ou landing page",
  // valores antigos (cadastros anteriores)
  "Poucos leads / pouca demanda": "quer mais leads e mais demanda",
  "Leads que não fecham": "marketing ineficiente / quer melhorar o marketing",
  "Atendimento lento / sem resposta": "quer colocar IA para rodar (atendimento, SDR, etc.)",
  "Processos manuais": "quer automatizar processos",
  "Falta de dados e controle": "quer implementar um sistema / software",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface DiagForm {
  nome: string;
  whatsapp: string;
  email: string;
  empresa: string;
  segmento: string | null;
  cargo: string | null;
  faturamento: string;
  equipe: string | null;
  canais: string[];
  dores: string[];
  tempoResposta: string | null;
  investMarketing: string | null;
  prazo: string | null;
  desafio: string | null;
  utm: Record<string, string>;
  utmFirst: Record<string, unknown> | null;
  landingUrl: string | null;
  referrer: string | null;
  pageUrl: string | null;
  fbp: string | null;
  fbc: string | null;
  eventId: string | null;
  honeypot: string;
}

const str = (v: unknown, max = 300): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
};
const list = (v: unknown, max = 12): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim().slice(0, 80)).slice(0, max) : [];

/** Celular brasileiro → só dígitos com 55 na frente. Retorna null se não parecer válido. */
export function normalizePhone(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return null;
}

/**
 * No WhatsApp, alguns números brasileiros aparecem sem o 9 extra (5519 8825-9883)
 * e outros com ele (5519 98825-9883). Para achar o mesmo lead, buscamos as duas formas.
 */
export function phoneVariants(phone: string): string[] {
  const out = new Set([phone]);
  if (phone.startsWith("55") && phone.length === 13 && phone[4] === "9") out.add(phone.slice(0, 4) + phone.slice(5));
  if (phone.startsWith("55") && phone.length === 12) out.add(phone.slice(0, 4) + "9" + phone.slice(4));
  return [...out];
}

export function parseForm(body: any): { ok: true; form: DiagForm } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "corpo inválido" };
  const nome = str(body.nome, 120);
  const whatsapp = normalizePhone(body.whatsapp);
  const empresa = str(body.empresa, 160);
  const faturamento = str(body.faturamento, 20);
  if (!nome) return { ok: false, error: "nome" };
  if (!whatsapp) return { ok: false, error: "whatsapp" };
  if (!empresa) return { ok: false, error: "empresa" };
  if (!faturamento || !FAIXAS[faturamento]) return { ok: false, error: "faturamento" };
  const email = str(body.email, 160);
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "email" };
  const utm: Record<string, string> = {};
  const src = body.utm && typeof body.utm === "object" ? body.utm : {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "fbclid", "gclid", "ttclid"]) {
    const v = str(src[k], 300);
    if (v) utm[k] = v;
  }
  const prazo = str(body.prazo, 20);
  return {
    ok: true,
    form: {
      nome,
      whatsapp,
      email: email.toLowerCase(),
      empresa,
      segmento: str(body.segmento, 80),
      cargo: str(body.cargo, 20),
      faturamento,
      equipe: str(body.equipe, 20),
      canais: list(body.canais),
      dores: list(body.dores),
      tempoResposta: str(body.tempo_resposta, 60),
      investMarketing: str(body.invest_marketing, 60),
      prazo: prazo && PRAZOS[prazo] ? prazo : null,
      desafio: str(body.desafio, 800),
      utm,
      utmFirst: body.utm_first && typeof body.utm_first === "object" ? body.utm_first : null,
      landingUrl: str(body.landing_url, 500),
      referrer: str(body.referrer, 500),
      pageUrl: str(body.page_url, 500),
      fbp: str(body.fbp, 200),
      fbc: str(body.fbc, 300),
      eventId: str(body.event_id, 80),
      honeypot: typeof body.website === "string" ? body.website : "",
    },
  };
}

/** Campos do lead (sdr_leads) preenchidos a partir do formulário */
export function leadPatch(f: DiagForm) {
  const faturamento_mensal = FAIXAS[f.faturamento].piso;
  const autoridade = f.cargo === "dono" ? "decisor" : null; // diretor/colaborador: a IA confirma quem decide
  const dores = [...new Set(f.dores.map((d) => DOR_N[d]).filter(Boolean))];
  const necessidade_resumo = [f.dores.join(", "), f.desafio].filter(Boolean).join(" | ").slice(0, 600) || null;
  const bant = evaluateBant({ faturamento_mensal, autoridade, dores, prazo: f.prazo });
  return {
    patch: {
      nome: f.nome,
      empresa: f.empresa,
      segmento: f.segmento,
      ...(f.email ? { email: f.email } : {}),
      faturamento_mensal,
      ...(autoridade ? { autoridade } : {}),
      dores,
      necessidade_resumo,
      ...(f.prazo ? { prazo: f.prazo } : {}),
      bant_score: bant.score,
    },
    bant,
  };
}

/** Linha para sdr_diagnosticos */
export function diagRow(f: DiagForm, leadId: string | null, ip: string | null, ua: string | null) {
  return {
    lead_id: leadId,
    nome: f.nome,
    whatsapp: f.whatsapp,
    email: f.email,
    empresa: f.empresa,
    segmento: f.segmento,
    cargo: f.cargo,
    faturamento_faixa: f.faturamento,
    faturamento_estimado: FAIXAS[f.faturamento].piso,
    equipe: f.equipe,
    canais: f.canais,
    dores: f.dores,
    tempo_resposta: f.tempoResposta,
    invest_marketing: f.investMarketing,
    prazo: f.prazo,
    desafio: f.desafio,
    utm_source: f.utm.utm_source ?? null,
    utm_medium: f.utm.utm_medium ?? null,
    utm_campaign: f.utm.utm_campaign ?? null,
    utm_content: f.utm.utm_content ?? null,
    utm_term: f.utm.utm_term ?? null,
    utm_id: f.utm.utm_id ?? null,
    fbclid: f.utm.fbclid ?? null,
    gclid: f.utm.gclid ?? null,
    ttclid: f.utm.ttclid ?? null,
    utm_primeiro_clique: f.utmFirst,
    landing_url: f.landingUrl,
    referrer: f.referrer,
    page_url: f.pageUrl,
    fbp: f.fbp,
    fbc: f.fbc,
    event_id: f.eventId,
    ip,
    user_agent: ua?.slice(0, 400) ?? null,
  };
}

/** Resumo legível das respostas (vai para a IA e para o aviso no WhatsApp) */
export function resumo(f: DiagForm): string {
  const v = (x: string | null | undefined) => x || "não informado";
  return [
    `Nome: ${f.nome} | Cargo: ${v(f.cargo ? CARGOS[f.cargo] ?? f.cargo : null)}`,
    `Empresa: ${f.empresa} | Segmento: ${v(f.segmento)}`,
    `Faturamento: ${FAIXAS[f.faturamento].label}/mês | Equipe: ${v(f.equipe)} pessoas`,
    `Clientes chegam por: ${f.canais.join(", ") || "não informado"} | Investe em marketing: ${v(f.investMarketing)}`,
    `Maiores gargalos: ${f.dores.join(", ") || "não informado"}`,
    `Tempo para responder um novo contato: ${v(f.tempoResposta)}`,
    `Quando quer resolver: ${f.prazo ? PRAZOS[f.prazo] : "não informado"}`,
    `Maior desafio: ${v(f.desafio)}`,
  ].join("\n");
}

export function origemTxt(f: DiagForm): string {
  const u = f.utm;
  if (!Object.keys(u).length) return "Acesso direto (sem UTM)";
  return [u.utm_source, u.utm_medium, u.utm_campaign, u.utm_content].filter(Boolean).join(" / ") || (u.fbclid ? "Meta (fbclid)" : u.gclid ? "Google (gclid)" : "não informado");
}

/**
 * Mensagem de sistema que entra no histórico como se fosse a "primeira mensagem" da conversa.
 * A IA lê isso e abre o contato no WhatsApp do lead.
 */
export function aberturaParaIA(f: DiagForm, desqualificado: boolean): string {
  return `[MENSAGEM AUTOMÁTICA DO SISTEMA, não foi o lead que escreveu]
O lead acabou de preencher o formulário do DIAGNÓSTICO GRATUITO na nossa landing page (prometemos retorno em até 24h úteis). Ele ainda não falou nada com você.

Respostas do formulário:
${resumo(f)}

O que fazer agora:
- Abra a conversa: cumprimente pelo primeiro nome, apresente-se como assistente da DemandIA e confirme que recebemos o diagnóstico da ${f.empresa}.
- Mostre que leu as respostas: cite 1 detalhe concreto (segmento, dor ou desafio).
- Faça UMA pergunta para aprofundar a dor principal e entender melhor o contexto. Não repita perguntas já respondidas no formulário.
- Registre com registrar_qualificacao o que já sabemos do formulário antes de responder.
${desqualificado ? "- Atenção: o faturamento informado está abaixo do nosso mínimo. Seja gentil, agradeça o interesse e confirme a faixa de faturamento antes de qualquer conclusão." : "- O objetivo segue o mesmo: entender o negócio e, se fizer sentido, marcar a reunião de diagnóstico com um dos nossos especialistas."}
- Mensagem curta, 1 ou 2 balões, tom humano.`;
}

export function avisoKelvin(f: DiagForm, bantScore: number): string {
  return `🔔 *Novo diagnóstico pela landing page*

${resumo(f)}

📱 WhatsApp: +${f.whatsapp}
${f.email ? `✉️ ${f.email}\n` : ""}📊 BANT pelo formulário: ${bantScore}/4
🎯 Origem: ${origemTxt(f)}

A IA já está chamando o lead no WhatsApp.`;
}

/** Linha para a planilha do Google (Apps Script). As chaves são os títulos das colunas. */
export function sheetRow(f: DiagForm, extra: { id: string; bant: number; data: string }): Record<string, string> {
  const u = f.utm;
  return {
    Data: extra.data,
    Nome: f.nome,
    WhatsApp: `+${f.whatsapp}`,
    "E-mail": f.email,
    Empresa: f.empresa,
    Segmento: f.segmento ?? "",
    Cargo: f.cargo ? CARGOS[f.cargo] ?? f.cargo : "",
    "Faturamento mensal": FAIXAS[f.faturamento].label,
    Equipe: f.equipe ?? "",
    "Como os clientes chegam": f.canais.join(", "),
    "Investe em marketing": f.investMarketing ?? "",
    "Maiores gargalos": f.dores.join(", "),
    "Tempo de resposta": f.tempoResposta ?? "",
    "Quando quer resolver": f.prazo ? PRAZOS[f.prazo] : "",
    "Maior desafio": f.desafio ?? "",
    "BANT (formulário)": `${extra.bant}/4`,
    utm_source: u.utm_source ?? "",
    utm_medium: u.utm_medium ?? "",
    utm_campaign: u.utm_campaign ?? "",
    utm_content: u.utm_content ?? "",
    utm_term: u.utm_term ?? "",
    fbclid: u.fbclid ?? "",
    gclid: u.gclid ?? "",
    "Página de entrada": f.landingUrl ?? "",
    "Abrir conversa": `https://wa.me/${f.whatsapp}`,
    ID: extra.id,
  };
}

/** CSV para a planilha (Google Sheets: =IMPORTDATA("url")) */
export function toCSV(rows: Record<string, unknown>[], cols: [string, string][]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(([, h]) => esc(h)).join(","), ...rows.map((r) => cols.map(([k]) => esc(r[k])).join(","))].join("\n");
}
