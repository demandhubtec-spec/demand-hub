/**
 * Insights da Gabi · autoanálise diária das conversas (portal > Time Comercial IA > Insights).
 *
 * Todo dia às 6h (e no botão "Analisar agora"):
 *  1) mede as 4 fases da conversa: abordagem, conexão, qualificação e agendamento;
 *  2) lê uma amostra das conversas recentes e acha a causa raiz de onde está travando;
 *  3) sugere a correção no manual da Gabi (abordagem e conexão) ou da Marina (qualificação e agendamento).
 * A correção só vale depois que o Kelvin aprova no portal. Nada muda sozinho.
 */
import { db } from "./db.ts";
import { callLLM } from "./llm.ts";
import { carregarPlaybook, manuaisAtuais } from "./playbook.ts";

export const FASES = ["abordagem", "conexao", "qualificacao", "agendamento"] as const;
export type Fase = (typeof FASES)[number];

export interface Medida {
  valor: number | null; // % (0 a 100), null quando ainda não tem base
  base: number; // quantos leads entraram na conta
}
export type Fases = Record<Fase, Medida>;

const DEPOIS_DA_CONVERSA = ["qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"];
const DEPOIS_DA_QUALIFICACAO = ["reuniao", "reuniao_realizada", "proposta", "ganho"];

export interface LeadParaFase {
  contatado: boolean;
  respondeu: boolean;
  /** Quantas mensagens o lead mandou na conversa (para medir se a conversa continua). */
  msgsDoLead: number;
  etapa: string | null; // qualificacao, reuniao...
}

const pct = (a: number, b: number): Medida => ({ valor: b ? Math.round((a / b) * 1000) / 10 : null, base: b });

/** Mede as 4 fases a partir dos leads (prospecção e inbound juntos). */
export function calcularFases(leads: LeadParaFase[]): Fases {
  const contatados = leads.filter((l) => l.contatado);
  const conversas = leads.filter((l) => l.respondeu || l.msgsDoLead > 0);
  const continuou = conversas.filter((l) => l.msgsDoLead >= 3 || DEPOIS_DA_CONVERSA.includes(l.etapa ?? ""));
  const qualificados = conversas.filter((l) => DEPOIS_DA_CONVERSA.includes(l.etapa ?? ""));
  const agendados = qualificados.filter((l) => DEPOIS_DA_QUALIFICACAO.includes(l.etapa ?? ""));
  return {
    abordagem: pct(contatados.filter((l) => l.respondeu).length, contatados.length),
    conexao: pct(continuou.length, conversas.length),
    qualificacao: pct(qualificados.length, conversas.length),
    agendamento: pct(agendados.length, qualificados.length),
  };
}

/** Fase mais longe da meta (o gargalo). null se todas batem a meta ou não têm base. */
export function faseGargalo(f: Fases, metas: Partial<Record<Fase, number>>): Fase | null {
  let pior: Fase | null = null;
  let distancia = 0;
  for (const k of FASES) {
    const v = f[k].valor;
    const m = metas[k];
    if (v == null || !m || f[k].base < 3) continue;
    const d = (m - v) / m;
    if (d > distancia) {
      distancia = d;
      pior = k;
    }
  }
  return pior;
}

export interface Conversa {
  canal: string; // google, instagram, ligacoes, inbound
  empresa: string;
  etapa: string | null;
  mensagens: { de: "lead" | "ia"; texto: string }[];
}

export interface InsightSugerido {
  fase: Fase;
  gravidade: "gargalo" | "atencao";
  canais: string[];
  agente: "gabi" | "marina";
  titulo: string;
  causa: string;
  trecho: { de: "lead" | "ia" | "nota"; texto: string }[];
  remover: string | null;
  incluir: string[];
  esperado: string;
  conversas: number;
}

const NOME_FASE: Record<Fase, string> = {
  abordagem: "Abordagem (o lead responde a primeira mensagem?)",
  conexao: "Conexão (a conversa continua depois da primeira resposta?)",
  qualificacao: "Qualificação (descobre decisor, faturamento, dor e momento?)",
  agendamento: "Agendamento (marca a reunião com quem foi qualificado?)",
};

export function promptInsights(p: {
  fases: Fases;
  metas: Partial<Record<Fase, number>>;
  gargalo: Fase | null;
  conversas: Conversa[];
  manuais: string;
  playbook: string;
}): { system: string; user: string } {
  const medidas = FASES.map(
    (k) => `- ${NOME_FASE[k]}: ${p.fases[k].valor == null ? "sem base ainda" : `${String(p.fases[k].valor).replace(".", ",")}%`} (meta ${p.metas[k] ?? "-"}%, base ${p.fases[k].base} leads)`,
  ).join("\n");
  const conversas = p.conversas
    .map(
      (c, i) =>
        `### Conversa ${i + 1} · canal ${c.canal} · ${c.empresa} · etapa ${c.etapa ?? "sem etapa"}\n` +
        c.mensagens.map((m) => `${m.de === "lead" ? "LEAD" : "GABI"}: ${m.texto}`).join("\n"),
    )
    .join("\n\n");
  const system = `Você é um analista comercial sênior que revisa as conversas de WhatsApp da Gabi, a IA que faz a prospecção e o atendimento da DemandIA, e da Marina, que qualifica e agenda.
Sua tarefa: achar onde as conversas travam, a causa raiz com prova nas conversas e a correção exata no manual de quem fala com o lead.

Regras das correções:
- Abordagem e conexão são da Gabi (agente "gabi"). Qualificação e agendamento são da Marina (agente "marina").
- Cada correção é uma instrução curta e prática para a IA seguir na próxima conversa, em português simples.
- "remover" é a frase do manual atual que causa o problema (copie igual), ou null se não houver uma.
- "incluir" são de 1 a 3 instruções novas.
- Respeite o playbook: nada de travessão, "gratuito" e nunca "grátis", nunca citar o nome do dono da empresa (diga "nosso especialista" ou "nossa equipe especialista"), uma pergunta por mensagem, mensagens curtas.
- Só aponte o que as conversas provam. Se não houver prova suficiente, devolva menos insights.
- Trecho: até 4 mensagens reais de uma conversa que mostram o problema (de "lead" ou "ia"), e se fizer sentido uma "nota" curta do que aconteceu depois (ex.: "lead não respondeu mais · 6 dias"). Não invente mensagens.

Responda só em JSON: {"insights": [{"fase": "abordagem|conexao|qualificacao|agendamento", "gravidade": "gargalo|atencao", "canais": ["google","instagram","ligacoes","inbound"], "agente": "gabi|marina", "titulo": "frase curta com o problema e o número", "causa": "2 a 3 frases com a causa raiz", "trecho": [{"de": "lead|ia|nota", "texto": "..."}], "remover": "..." | null, "incluir": ["..."], "esperado": "frase curta com o efeito esperado", "conversas": 0}]}
No máximo 3 insights, o mais importante primeiro. Use "gargalo" só para a fase mais longe da meta.`;
  const user = `## Números das 4 fases (últimos 30 dias)
${medidas}
Fase mais longe da meta: ${p.gargalo ? NOME_FASE[p.gargalo] : "nenhuma abaixo da meta"}

## Manuais atuais de quem fala com o lead
${p.manuais || "(sem manual)"}

## Playbook comercial
${p.playbook || "(sem playbook)"}

## Conversas recentes (amostra)
${conversas || "(sem conversas no período)"}`;
  return { system, user };
}

const limpa = (v: unknown, max = 600) => (typeof v === "string" ? v.replace(/\s*—\s*/g, ", ").trim().slice(0, max) : "");

/** Lê e valida o JSON da IA. Descarta o que vier fora do formato. */
export function lerInsights(bruto: string): InsightSugerido[] {
  let j: unknown;
  try {
    j = JSON.parse(bruto);
  } catch {
    return [];
  }
  const lista = (j as { insights?: unknown[] } | null)?.insights;
  if (!Array.isArray(lista)) return [];
  const out: InsightSugerido[] = [];
  for (const x of lista.slice(0, 3)) {
    const o = x as Record<string, unknown>;
    const fase = o.fase as Fase;
    if (!FASES.includes(fase)) continue;
    const titulo = limpa(o.titulo, 220);
    const causa = limpa(o.causa, 900);
    const incluir = (Array.isArray(o.incluir) ? o.incluir : []).map((s) => limpa(s, 400)).filter(Boolean).slice(0, 3);
    if (!titulo || !causa || !incluir.length) continue;
    const trecho = (Array.isArray(o.trecho) ? o.trecho : [])
      .map((t) => {
        const r = t as { de?: string; texto?: unknown };
        const de = r.de === "lead" || r.de === "ia" || r.de === "nota" ? r.de : null;
        return de ? { de, texto: limpa(r.texto, 500) } : null;
      })
      .filter((t): t is { de: "lead" | "ia" | "nota"; texto: string } => !!t && !!t.texto)
      .slice(0, 5);
    out.push({
      fase,
      gravidade: o.gravidade === "gargalo" ? "gargalo" : "atencao",
      canais: (Array.isArray(o.canais) ? o.canais : []).filter((c): c is string => typeof c === "string").slice(0, 5),
      agente: fase === "abordagem" || fase === "conexao" ? "gabi" : "marina",
      titulo,
      causa,
      trecho,
      remover: limpa(o.remover, 400) || null,
      incluir,
      esperado: limpa(o.esperado, 200),
      conversas: Math.max(0, Math.round(Number(o.conversas) || 0)),
    });
  }
  // Só um gargalo
  let viuGargalo = false;
  for (const i of out) {
    if (i.gravidade === "gargalo") {
      if (viuGargalo) i.gravidade = "atencao";
      viuGargalo = true;
    }
  }
  return out;
}

const fim8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);

/** Roda a análise completa e grava no banco. */
export async function rodarInsights(agora = new Date()): Promise<{ conversas: number; insights: number; fases: Fases }> {
  const desde = new Date(agora.getTime() - 30 * 86400_000).toISOString();
  const [{ data: metasRow }, { data: outreach }, { data: listas }, { data: sdr }] = await Promise.all([
    db().from("comercial_metas").select("dados").eq("id", "principal").maybeSingle(),
    db().from("outreach_leads").select("empresa,whatsapp,wa_status,cadencia,status_comercial,wa_sent_at").limit(5000),
    db().from("comercial_lista_leads").select("empresa,whatsapp,lista,etapa").limit(5000),
    db().from("sdr_leads").select("id,phone,nome,empresa,status,funil_etapa,last_inbound_at").gte("updated_at", desde).limit(2000),
  ]);
  const metas = ((metasRow as { dados?: { fases?: Partial<Record<Fase, number>> } } | null)?.dados?.fases ?? {}) as Partial<Record<Fase, number>>;

  type O = { empresa: string; whatsapp: string | null; wa_status: string; cadencia: string; status_comercial: string; wa_sent_at: string | null };
  type L = { empresa: string; whatsapp: string | null; lista: string; etapa: string };
  type S = { id: string; phone: string; nome: string | null; empresa: string | null; status: string; funil_etapa: string | null; last_inbound_at: string | null };
  const porFone = new Map<string, { canal: string; empresa: string }>();
  for (const l of (listas ?? []) as L[]) if (fim8(l.whatsapp)) porFone.set(fim8(l.whatsapp), { canal: l.lista, empresa: l.empresa });
  for (const o of (outreach ?? []) as O[]) if (fim8(o.whatsapp)) porFone.set(fim8(o.whatsapp), { canal: "google", empresa: o.empresa });

  // Mensagens das conversas do período
  const ids = ((sdr ?? []) as S[]).map((s) => s.id);
  const msgs: { lead_id: string; author: string; content: string; created_at: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db()
      .from("sdr_messages")
      .select("lead_id,author,content,created_at")
      .in("lead_id", ids.slice(i, i + 200))
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .limit(5000);
    msgs.push(...((data ?? []) as typeof msgs));
  }
  const doLead = new Map<string, typeof msgs>();
  for (const m of msgs) doLead.set(m.lead_id, [...(doLead.get(m.lead_id) ?? []), m]);

  // Etapa comercial de cada conversa (prospecção: status_comercial; inbound: funil_etapa/status)
  const etapaOutreach = new Map<string, string>();
  for (const o of (outreach ?? []) as O[]) if (fim8(o.whatsapp)) etapaOutreach.set(fim8(o.whatsapp), o.status_comercial);
  const etapaSdr = (s: S) =>
    etapaOutreach.get(fim8(s.phone)) ??
    s.funil_etapa ??
    (s.status === "qualificado" ? "qualificacao" : s.status === "agendado" ? "reuniao" : s.status === "cliente" ? "ganho" : null);

  const leadsFase: LeadParaFase[] = [];
  // Prospecção (Google): contatado e respondeu vêm do envio
  const vistos = new Set<string>();
  for (const o of (outreach ?? []) as O[]) {
    const contatado = ["enviado", "respondeu", "ignorado", "optout"].includes(o.wa_status) && !!o.wa_sent_at && o.wa_sent_at >= desde;
    if (!contatado) continue;
    const s = ((sdr ?? []) as S[]).find((x) => fim8(x.phone) === fim8(o.whatsapp));
    if (s) vistos.add(s.id);
    leadsFase.push({
      contatado: true,
      respondeu: ["respondeu", "optout"].includes(o.wa_status) || o.cadencia === "respondeu",
      msgsDoLead: s ? (doLead.get(s.id) ?? []).filter((m) => m.author === "lead").length : 0,
      etapa: o.status_comercial,
    });
  }
  // Demais conversas (inbound, Instagram, ligações que viraram WhatsApp)
  for (const s of (sdr ?? []) as S[]) {
    if (vistos.has(s.id)) continue;
    const n = (doLead.get(s.id) ?? []).filter((m) => m.author === "lead").length;
    if (!n) continue;
    leadsFase.push({ contatado: false, respondeu: true, msgsDoLead: n, etapa: etapaSdr(s) });
  }
  const fases = calcularFases(leadsFase);
  const gargalo = faseGargalo(fases, metas);

  // Amostra: as 30 conversas mais recentes com resposta do lead
  const conversas: Conversa[] = ((sdr ?? []) as S[])
    .filter((s) => (doLead.get(s.id) ?? []).some((m) => m.author === "lead"))
    .sort((a, b) => (b.last_inbound_at ?? "").localeCompare(a.last_inbound_at ?? ""))
    .slice(0, 30)
    .map((s) => {
      const origem = porFone.get(fim8(s.phone));
      return {
        canal: origem?.canal ?? "inbound",
        empresa: origem?.empresa ?? s.empresa ?? s.nome ?? "Lead",
        etapa: etapaSdr(s),
        mensagens: (doLead.get(s.id) ?? [])
          .filter((m) => m.author === "lead" || m.author === "ia")
          .slice(-14)
          .map((m) => ({ de: m.author === "lead" ? ("lead" as const) : ("ia" as const), texto: m.content.slice(0, 350) })),
      };
    });

  const playbook = await carregarPlaybook();
  let sugeridos: InsightSugerido[] = [];
  if (conversas.length >= 3) {
    const { system, user } = promptInsights({ fases, metas, gargalo, conversas, manuais: manuaisAtuais("gabi", "marina"), playbook });
    const r = await callLLM({ system, messages: [{ role: "user", content: user }], json: true, maxTokens: 4000 });
    sugeridos = lerInsights(r.message.content ?? "");
  }

  const { data: analise } = await db()
    .from("comercial_analises")
    .insert({ conversas: leadsFase.length, fases })
    .select("id")
    .single();
  // Sugestões antigas que você ainda não decidiu dão lugar às novas
  if (sugeridos.length) await db().from("comercial_insights").delete().eq("status", "pendente");
  if (sugeridos.length) {
    await db()
      .from("comercial_insights")
      .insert(sugeridos.map((s) => ({ ...s, analise_id: (analise as { id: string } | null)?.id ?? null })));
  }
  // Correções aplicadas há 7 dias ou mais: mede o depois
  const semana = new Date(agora.getTime() - 7 * 86400_000).toISOString();
  const { data: aplicados } = await db()
    .from("comercial_insights")
    .select("id,fase")
    .eq("status", "aplicado")
    .is("metrica_depois", null)
    .lte("decidido_em", semana);
  for (const a of (aplicados ?? []) as { id: string; fase: Fase }[]) {
    const v = fases[a.fase]?.valor;
    if (v != null) await db().from("comercial_insights").update({ metrica_depois: v }).eq("id", a.id);
  }
  return { conversas: leadsFase.length, insights: sugeridos.length, fases };
}
