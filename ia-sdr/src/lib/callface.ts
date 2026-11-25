/**
 * Ligações da Gabi pelo Callface (23/11/2026).
 *
 * O Callface não consulta a agenda do Kelvin durante a ligação. A Gabi combina dia e horário com a pessoa
 * e, quando a ligação termina, o Callface manda o resultado para /api/webhooks/ligacoes. Aqui:
 *  1. a IA lê o resumo e a transcrição e tira o resultado (reunião, retorno, recusa...), o horário e o e-mail;
 *  2. o resultado vira comentário no card do funil (e a etapa avança);
 *  3. com reunião combinada: confere a agenda, marca com Meet (o convite vai para o e-mail) e confirma no
 *     WhatsApp da Gabi. Se o horário já estiver ocupado ou faltar o e-mail, a Gabi do WhatsApp continua de onde
 *     a ligação parou (oferece outros dois horários ou pede o e-mail).
 */
import { callLLM } from "./llm.ts";
import { db, logEvent, updateLead, upsertLeadByPhone, type Lead } from "./db.ts";
import { agendarRecadoLigacao, motivoDoRecado } from "./recado-ligacao.ts";
import { agendarMaterial } from "./material-ligacao.ts";
import { avisarKelvin, enviarAoLead } from "./canal.ts";
import { busyIntervals } from "./google.ts";
import { freeSlots } from "./schedule.ts";
import { proximosHorarios, runTool } from "./tools.ts";
import { formatBR, toLocal } from "./time.ts";

/** É um envio do Callface? (eles mandam call_id e destination_number) */
export function ehCallface(b: unknown): b is Record<string, unknown> {
  return !!b && typeof b === "object" && "call_id" in b && "destination_number" in b;
}

/** Transcrição do Callface em texto (aceita os formatos mais comuns de lista de falas). */
export function transcricaoEmTexto(t: unknown): string {
  if (typeof t === "string") return t;
  if (!Array.isArray(t)) return "";
  return t
    .map((x) => {
      if (typeof x === "string") return x;
      if (!x || typeof x !== "object") return "";
      const o = x as Record<string, unknown>;
      const quem = String(o.role ?? o.speaker ?? o.who ?? o.author ?? o.participant ?? "").trim();
      const fala = String(o.text ?? o.content ?? o.message ?? o.transcript ?? o.speech ?? "").trim();
      return fala ? `${quem ? `${quem}: ` : ""}${fala}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Campos de coleta de dados que o Callface possa mandar junto (o nome da chave varia). */
function dadosColetados(b: Record<string, unknown>): unknown {
  for (const k of ["data_collection", "collected_data", "data_collection_results", "analysis", "custom_fields", "extracted_data", "dados_coletados"]) {
    if (b[k] != null) return b[k];
  }
  return null;
}

export type ResultadoLigacao =
  | "reuniao_agendada"
  | "retorno_combinado"
  | "sem_interesse"
  | "nao_falou_com_responsavel"
  | "falou_sem_decisao"
  | "caixa_postal"
  | "numero_errado"
  | "pediu_para_nao_ligar";

export interface LeituraLigacao {
  resultado: ResultadoLigacao;
  falou_com_responsavel: boolean;
  quer_hoje: boolean;
  nome_responsavel: string | null;
  quem_atendeu: string | null;
  reuniao_inicio: string | null; // "AAAA-MM-DDTHH:MM", horário de Brasília
  email: string | null;
  whatsapp: string | null; // número de WhatsApp para a confirmação, quando é outro (ligou num fixo)
  retorno: string | null;
  retorno_inicio: string | null;
  objecao: string | null;
  temperatura: "quente" | "morno" | "frio";
  resumo: string;
  material: "whatsapp" | "email" | null; // 25/11: pediu para mandar o material/apresentação por esse canal
}

const RESULTADOS: ResultadoLigacao[] = ["reuniao_agendada", "retorno_combinado", "sem_interesse", "nao_falou_com_responsavel", "falou_sem_decisao", "caixa_postal", "numero_errado", "pediu_para_nao_ligar"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Normaliza o JSON que a IA devolveu (nada fora do formato passa). */
export function normalizarLeitura(j: Record<string, unknown>): LeituraLigacao {
  // 23/11 (teste): a IA devolveu "não informado" e a confirmação saiu "Oi, não!"
  const s = (v: unknown) =>
    typeof v === "string" && v.trim() && !/^(null|vazio|-|n\/a|nenhum|nenhuma|desconhecid[oa]|n[ãa]o (informad[oa]|identificad[oa]|sei|mencionad[oa]|dito|disse|houve|tem))\.?$/i.test(v.trim())
      ? v.trim()
      : null;
  // Nome de gente: palavras com letra maiúscula, sem cargo nem palavra solta ("não", "dono", "recepção")
  const nome = (v: unknown) => {
    const t = s(v);
    if (!t) return null;
    const primeiro = t.split(/[\s,]+/)[0];
    return /^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(primeiro) && !/^(Não|Nao|Sim|Dono|Dona|Recepção|Recepcao|Secretária|Secretaria|Responsável|Responsavel|Proprietário|Proprietario|Atendente|Gerente|Doutor|Doutora|Dr|Dra)$/i.test(primeiro) ? t : null;
  };
  let resultado = RESULTADOS.includes(j.resultado as ResultadoLigacao) ? (j.resultado as ResultadoLigacao) : "nao_falou_com_responsavel";
  // 24/11 (Ivone Imóveis): falou com a responsável e saiu "não falou com o responsável"
  if (j.falou_com_responsavel === true && resultado === "nao_falou_com_responsavel") resultado = "falou_sem_decisao";
  if (j.falou_com_responsavel !== true && resultado === "falou_sem_decisao") resultado = "nao_falou_com_responsavel";
  const email = s(j.email)?.toLowerCase().replace(/\s+/g, "") ?? null;
  const ri = s(j.reuniao_inicio);
  const rt = s(j.retorno_inicio);
  const temp = ["quente", "morno", "frio"].includes(j.temperatura as string) ? (j.temperatura as LeituraLigacao["temperatura"]) : resultado === "reuniao_agendada" ? "quente" : "frio";
  return {
    resultado,
    falou_com_responsavel: j.falou_com_responsavel === true,
    quer_hoje: j.quer_hoje === true,
    nome_responsavel: nome(j.nome_responsavel),
    quem_atendeu: s(j.quem_atendeu),
    reuniao_inicio: ri && DATA_RE.test(ri) ? ri : null,
    email: email && EMAIL_RE.test(email) ? email : null,
    whatsapp: (() => {
      const d = (s(j.whatsapp) ?? "").replace(/\D/g, "");
      return d.length >= 10 && d.length <= 13 ? (d.startsWith("55") ? d : `55${d}`) : null;
    })(),
    retorno: s(j.retorno),
    retorno_inicio: rt && DATA_RE.test(rt) ? rt : null,
    objecao: s(j.objecao),
    temperatura: temp,
    resumo: s(j.resumo) ?? "",
    material: j.material === "whatsapp" || j.material === "email" ? j.material : null,
  };
}

/** "2026-11-24T10:00" (Brasília) → Date. */
export function inicioBrasilia(s: string): Date {
  return new Date(`${s}:00-03:00`);
}

async function lerComIA(b: Record<string, unknown>, agora: Date): Promise<LeituraLigacao> {
  const hoje = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const system = `Você lê ligações de prospecção da Gabi (DemandIA), que liga para empresas para marcar um bate-papo de 20 a 30 minutos com o nosso especialista. A data da ligação é ${hoje} (horário de Brasília).
Responda SÓ com um JSON com estas chaves:
resultado: um de ${RESULTADOS.join(", ")} (reuniao_agendada só se a pessoa topou um dia e horário; falou_sem_decisao quando falou com o dono/responsável mas não houve sim, não nem retorno combinado; caixa_postal também para gravação da operadora como "seu recado será entregue quando o celular estiver disponível").
falou_com_responsavel: true se conversou com o dono ou responsável.
quer_hoje: true se a pessoa pediu para conversar com o especialista agora ou ainda hoje.
nome_responsavel: só o nome próprio do dono/responsável citado (ex.: "Carlos"), ou null. Nunca escreva "não informado": use null.
quem_atendeu: nome e função de quem atendeu, ou null.
reuniao_inicio: dia e horário combinados para a reunião, no formato AAAA-MM-DDTHH:MM (Brasília), resolvendo "terça", "amanhã" etc. a partir da data da ligação; null se não houve.
whatsapp: número de WhatsApp que a pessoa passou para receber a confirmação, só os dígitos com DDD (ex.: 11987654321); null se não passou outro número.
email: e-mail confirmado para o convite (junte o que foi soletrado, ex.: "joao arroba clinica ponto com ponto br" vira joao@clinica.com.br); null se não houve.
retorno: quando ligar de novo e com quem, em texto curto; null se não houve.
retorno_inicio: o mesmo no formato AAAA-MM-DDTHH:MM, se der para saber; null se não.
objecao: a principal objeção nas palavras da pessoa, ou null.
temperatura: quente, morno ou frio.
material: "whatsapp" ou "email" se a pessoa pediu para mandarmos material, apresentação, portfólio ou informações por esse canal (e-mail só se ela passou o e-mail); null se não pediu.
resumo: 2 ou 3 frases com quem falou, o que disse e o próximo passo. Escreva a empresa como "Demand" (nunca "DemandIA") e só em português.`;
  const conteudo = [
    `Número: ${b.destination_number ?? ""}`,
    b.summarization ? `Resumo do Callface:\n${String(b.summarization).slice(0, 4000)}` : "",
    dadosColetados(b) ? `Dados coletados:\n${JSON.stringify(dadosColetados(b)).slice(0, 3000)}` : "",
    b.scheduling ? `Agendamentos detectados:\n${JSON.stringify(b.scheduling).slice(0, 1500)}` : "",
    `Transcrição:\n${transcricaoEmTexto(b.transcription).slice(0, 12000) || "(vazia)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await callLLM({ system, messages: [{ role: "user", content: conteudo }], maxTokens: 800, json: true });
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(r.message.content ?? "{}");
  } catch {
    j = {};
  }
  return normalizarLeitura(j);
}

/** Etapa do funil de ligações para cada resultado. */
export function etapaDoResultado(l: LeituraLigacao, marcou: boolean): string {
  switch (l.resultado) {
    case "reuniao_agendada":
      return marcou ? "reuniao" : "qualificacao";
    case "retorno_combinado":
      return !l.falou_com_responsavel ? "atendida" : l.temperatura === "quente" ? "qualificacao" : "conversa";
    case "sem_interesse":
    case "pediu_para_nao_ligar":
    case "numero_errado":
      return "perdido";
    case "caixa_postal":
      return "contato";
    default:
      return l.falou_com_responsavel ? "conversa" : "atendida";
  }
}

const ORDEM_LIGACAO: Record<string, number> = { na_lista: 0, contato: 1, atendida: 2, conversa: 3, qualificacao: 4, reuniao: 5, reuniao_realizada: 6, proposta: 7, ganho: 8 };

/** Até onde a ligação chegou (para quem recusou, conta até onde foi antes do não). */
export function alcanceDaLigacao(l: LeituraLigacao, etapa: string): number {
  if (etapa !== "perdido") return ORDEM_LIGACAO[etapa] ?? 1;
  if (l.resultado === "numero_errado") return 2;
  return l.falou_com_responsavel ? 3 : 2;
}

/** É o envio de teste do Callface (call_id de exemplo, sem conversa)? */
export function ehTesteCallface(b: Record<string, unknown>): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(b.call_id ?? ""));
}

/**
 * 24/11: gravação da operadora ("seu recado será entregue assim que o celular estiver disponível", "deixe sua
 * mensagem após o sinal") entrava como "atendeu". É caixa postal.
 */
const OPERADORA_RE = /recado (ser[áa]|vai ser) entregue|celular (estiver|esteja|est[áa]) (dispon[íi]vel|desligado|fora)|ap[óo]s o sinal|deixe (seu|sua) (recado|mensagem)|grave (seu|sua) (recado|mensagem)|caixa (de mensagens|postal)|fora da [áa]rea de cobertura|desligado ou fora/i;
export function ehGravacaoDaOperadora(b: Record<string, unknown>): boolean {
  const texto = `${transcricaoEmTexto(b.transcription)}\n${String(b.summarization ?? "")}`;
  return OPERADORA_RE.test(texto);
}

/** Ligação sem conversa (não atendeu, caixa postal, caiu): não precisa da IA. */
export function semConversa(b: Record<string, unknown>): boolean {
  const status = String(b.call_status ?? "").toUpperCase();
  const dur = Number(b.call_duration ?? 0);
  const texto = transcricaoEmTexto(b.transcription).trim();
  return (!!status && status !== "FINISHED") || (!texto && (!Number.isFinite(dur) || dur < 15));
}

const ROTULO: Record<ResultadoLigacao, string> = {
  reuniao_agendada: "reunião combinada",
  retorno_combinado: "retorno combinado",
  sem_interesse: "sem interesse",
  nao_falou_com_responsavel: "não falou com o responsável",
  falou_sem_decisao: "falou com o responsável, sem decisão",
  caixa_postal: "caixa postal",
  numero_errado: "número errado",
  pediu_para_nao_ligar: "pediu para não ligar",
};

/** Texto do comentário no card. */
export function notaDaLigacao(l: LeituraLigacao, extra: string | null, link: string | null): string {
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return [
    `📞 Ligação da Gabi ${quando}: ${ROTULO[l.resultado]} (${l.temperatura})`,
    l.resumo,
    l.quem_atendeu ? `Atendeu: ${l.quem_atendeu}` : null,
    l.nome_responsavel ? `Responsável: ${l.nome_responsavel}` : null,
    l.objecao ? `Objeção: ${l.objecao}` : null,
    l.retorno ? `Retorno: ${l.retorno}` : null,
    extra,
    link ? `Ligação: ${link}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Marca a reunião combinada na ligação e confirma no WhatsApp. Devolve o que aconteceu (vai para a nota). */
async function marcarReuniao(b: Record<string, unknown>, l: LeituraLigacao, empresa: string | null): Promise<{ marcou: boolean; texto: string }> {
  // Ligou num fixo: a confirmação vai para o WhatsApp que a pessoa passou na ligação
  const fone = l.whatsapp ?? String(b.destination_number ?? "").replace(/\D/g, "");
  if (fone.length < 10 || (!l.reuniao_inicio && !l.quer_hoje)) return { marcou: false, texto: "Reunião combinada sem dia e horário claros: conferir a ligação." };
  const phone = fone.startsWith("55") ? fone : `55${fone}`;
  const lead: Lead = await upsertLeadByPhone(phone, `${phone}@s.whatsapp.net`, l.nome_responsavel ?? undefined, "gabi");
  if (!lead.empresa && empresa) await updateLead(lead.id, { empresa });
  if (l.nome_responsavel && !lead.nome) await updateLead(lead.id, { nome: l.nome_responsavel });
  // Libera o agendar_reuniao para este lead (mesmo sem ser da prospecção do WhatsApp)
  await logEvent(lead.id, "ligacao_callface", { call_id: b.call_id, resultado: l.resultado, reuniao_inicio: l.reuniao_inicio, email: l.email });
  const inicio = l.reuniao_inicio ? inicioBrasilia(l.reuniao_inicio) : new Date();
  const quando = formatBR(inicio);
  const primeiro = l.nome_responsavel ? `, ${l.nome_responsavel.split(" ")[0]}` : "";
  // 24/11 (Kelvin): pediu agora ou hoje → a Gabi não recusa. Confere a agenda: tem horário livre hoje, o Kelvin é
  // avisado para ver se consegue e a pessoa recebe "estou confirmando"; sem horário hoje, vão 2 opções.
  const hojeL = toLocal(new Date());
  const ehHoje = (d: Date) => { const x = toLocal(d); return x.y === hojeL.y && x.m === hojeL.m && x.d === hojeL.d; };
  if (l.quer_hoje || ehHoje(inicio)) return await confirmarHoje(lead, empresa, inicio, primeiro);

  if (!l.email) {
    await enviarAoLead(
      lead.id,
      `Oi${primeiro}! Aqui é a Gabi, da Demand, que falou com você agora há pouco por telefone 😊\n\nPra eu te mandar o convite do bate-papo com nosso especialista (${quando}), qual e-mail eu uso?`,
    );
    return { marcou: false, texto: `Combinou ${quando}, mas sem e-mail: a Gabi pediu o e-mail no WhatsApp para fechar o convite.` };
  }

  const out = await runTool("agendar_reuniao", { inicio: inicio.toISOString(), emails: [l.email] }, lead.id);
  let res: { ok?: boolean; link_meet?: string | null } = {};
  try {
    res = JSON.parse(out);
  } catch {
    res = {};
  }
  if (res.ok) {
    await enviarAoLead(
      lead.id,
      `Oi${primeiro}! Aqui é a Gabi, da Demand 😊 Obrigada pela conversa por telefone!\n\nNosso bate-papo com nosso especialista ficou confirmado para ${quando}.${res.link_meet ? ` O link da reunião é este: ${res.link_meet}` : ""}\n\nTambém te mandei o convite no e-mail ${l.email}. Até lá!`,
    );
    return { marcou: true, texto: `Reunião marcada para ${quando}${res.link_meet ? ` (${res.link_meet})` : ""}. Confirmação enviada no WhatsApp e convite no e-mail.` };
  }
  if (/^Já existe reunião/.test(out)) return { marcou: true, texto: `Já tinha reunião marcada: ${out.slice(0, 120)}` };
  // Horário ocupado ou fora da agenda: a Gabi do WhatsApp oferece outros dois
  const opcoes = await proximosHorarios().catch(() => [] as string[]);
  const texto = opcoes.length >= 2
    ? `Oi${primeiro}! Aqui é a Gabi, da Demand, que falou com você por telefone 😊\n\nFui confirmar na agenda do nosso especialista e o horário de ${quando} acabou de ser preenchido. Tenho estas duas opções: ${opcoes[0]} ou ${opcoes[1]}. Qual fica melhor pra você?`
    : `Oi${primeiro}! Aqui é a Gabi, da Demand, que falou com você por telefone 😊\n\nFui confirmar na agenda do nosso especialista e o horário de ${quando} acabou de ser preenchido. Qual outro dia e horário ficam bons pra você?`;
  await enviarAoLead(lead.id, texto);
  await updateLead(lead.id, { email: lead.email ?? l.email });
  return { marcou: false, texto: `Combinou ${quando}, mas não deu para marcar (${out.slice(0, 120)}). A Gabi ofereceu outros horários no WhatsApp.` };
}

/** Pediu agora/hoje: confere a agenda de hoje e avisa o Kelvin; o lead recebe a confirmação no WhatsApp. */
async function confirmarHoje(lead: Lead, empresa: string | null, inicio: Date, primeiro: string): Promise<{ marcou: boolean; texto: string }> {
  const agora = new Date();
  const fimDoDia = new Date(agora.getTime() + 24 * 3600e3);
  const busy = await busyIntervals(agora, fimDoDia).catch(() => null);
  const hojeL = toLocal(agora);
  const livresHoje = busy
    ? freeSlots(agora, busy).filter((s) => { const x = toLocal(s.start); return x.y === hojeL.y && x.m === hojeL.m && x.d === hojeL.d; })
    : [];
  const pedido = inicio.getTime() > agora.getTime() + 10 * 60e3 ? `hoje, ${formatBR(inicio)}` : "agora";
  const nome = empresa ?? lead.empresa ?? lead.nome ?? `+${lead.phone}`;
  if (livresHoje.length || !busy) {
    const opcoes = livresHoje.slice(0, 4).map((s) => s.start.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }));
    await avisarKelvin(
      `⚡ ${nome} quer conversar ${pedido} (ligação da Gabi).${opcoes.length ? ` Sua agenda tem horário livre hoje: ${opcoes.join(", ")}.` : " Não consegui conferir sua agenda agora."} Consegue? A Gabi avisou que está confirmando com você.\nwa.me/${lead.phone}`,
      "gabi",
    ).catch(() => null);
    await enviarAoLead(lead.id, `Oi${primeiro}! Aqui é a Gabi, da Demand, que falou com você agora por telefone 😊\n\nJá estou vendo na agenda do nosso especialista se dá pra ser ${pedido === "agora" ? "agora" : "ainda hoje"} e te confirmo por aqui em instantes.`);
    await logEvent(lead.id, "pediu_hoje", { pedido, livres: opcoes });
    return { marcou: false, texto: `Pediu para ${pedido}. Kelvin avisado para confirmar; a Gabi disse no WhatsApp que está confirmando.` };
  }
  const opcoes = await proximosHorarios().catch(() => [] as string[]);
  await enviarAoLead(
    lead.id,
    opcoes.length >= 2
      ? `Oi${primeiro}! Aqui é a Gabi, da Demand, que falou com você agora por telefone 😊\n\nConferi a agenda do nosso especialista e hoje já está completa. Tenho estas duas opções: ${opcoes[0]} ou ${opcoes[1]}. Qual fica melhor pra você?`
      : `Oi${primeiro}! Aqui é a Gabi, da Demand, que falou com você agora por telefone 😊\n\nConferi a agenda do nosso especialista e hoje já está completa. Qual outro dia e horário ficam bons pra você?`,
  );
  return { marcou: false, texto: `Pediu para ${pedido}, mas a agenda de hoje está cheia: a Gabi ofereceu outros horários no WhatsApp.` };
}

/** Retorno combinado vira próxima ação (ligação) no card, com tarefa para o Kelvin. */
async function agendarRetorno(card: string, empresa: string, l: LeituraLigacao) {
  if (!l.retorno_inicio) return;
  const quando = inicioBrasilia(l.retorno_inicio);
  const { data: ref } = await db().from("atividades").select("responsavel_id").eq("departamento", "comercial").not("responsavel_id", "is", null).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  const hora = quando.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const prazo = quando.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const descricao = `Retorno combinado na ligação da Gabi: ${l.retorno ?? ""}`.trim();
  const { data: atv } = await db()
    .from("atividades")
    .insert({ titulo: `Ligação ${hora} · ${empresa}`.slice(0, 120), responsavel_id: (ref as { responsavel_id?: string } | null)?.responsavel_id ?? null, departamento: "comercial", prazo, status: "a-fazer", descricao, prioridade: "alta" })
    .select("id")
    .single();
  await db().from("comercial_card_acoes").insert({ card, empresa, tipo: "ligacao", quando: quando.toISOString(), descricao, atividade_id: (atv as { id?: string } | null)?.id ?? null });
}

/** Atualiza (ou cria) a empresa no funil de Ligações. Nunca volta etapa; recusa vira perdido guardando até onde chegou. */
async function registrarNaListaDeLigacoes(b: Record<string, unknown>, l: LeituraLigacao, etapa: string, nota: string, empresa: string | null, fone: string) {
  const fim = fone.slice(-8);
  if (fim.length < 8) return;
  const { data: atual } = await db().from("comercial_lista_leads").select("id,etapa,etapa_max,tentativas").eq("lista", "ligacoes").like("whatsapp", `%${fim}`).order("criado_em", { ascending: true }).limit(1).maybeSingle();
  const alcance = alcanceDaLigacao(l, etapa);
  const a = atual as { id: string; etapa: string; etapa_max: number | null; tentativas: number | null } | null;
  const nivelAtual = a ? (a.etapa === "perdido" ? -1 : ORDEM_LIGACAO[a.etapa] ?? 0) : -1;
  const novaEtapa = etapa === "perdido" ? "perdido" : a && a.etapa !== "perdido" && nivelAtual > (ORDEM_LIGACAO[etapa] ?? 0) ? a.etapa : etapa;
  const campos = {
    etapa: novaEtapa,
    etapa_max: Math.max(a?.etapa_max ?? 0, alcance),
    observacoes: nota.slice(0, 4000),
    canal: "ligação",
    email: l.email ?? undefined,
    payload: { call_id: b.call_id, call_link: b.call_link, resultado: l.resultado, temperatura: l.temperatura, falou_com_responsavel: l.falou_com_responsavel },
  };
  if (a) {
    await db().from("comercial_lista_leads").update({ ...campos, tentativas: (a.tentativas ?? 0) + 1 }).eq("id", a.id);
  } else {
    await db().from("comercial_lista_leads").insert({
      ...campos,
      lista: "ligacoes",
      externo_id: `cf:${fone}`,
      empresa: empresa ?? l.nome_responsavel ?? fone,
      whatsapp: fone,
      tentativas: 1,
      rodada: "Gabi · Callface",
    });
  }
}

/**
 * Trata um envio do Callface. Devolve um resumo do que foi feito.
 * Repetido (mesmo event_id ou call_id) não faz nada de novo.
 */
export async function tratarCallface(b: Record<string, unknown>, agora = new Date()): Promise<Record<string, unknown>> {
  // Teste do botão "Salvar webhook" (payload de exemplo)
  if (ehTesteCallface(b)) return { ok: true, teste: true };

  const chave = String(b.event_id ?? b.call_id ?? "");
  if (chave) {
    const { data: ja } = await db().from("sdr_events").select("id").eq("type", "callface_recebido").eq("payload->>chave", chave).limit(1).maybeSingle();
    if (ja) return { ok: true, repetido: true };
    await logEvent(null, "callface_recebido", { chave, call_id: b.call_id, numero: b.destination_number });
  }

  const sem = semConversa(b);
  const l: LeituraLigacao = sem
    ? normalizarLeitura({ resultado: "caixa_postal", temperatura: "frio", resumo: `Ligação sem conversa (${String(b.call_status ?? "não atendeu").toLowerCase()}).` })
    : ehGravacaoDaOperadora(b)
      ? normalizarLeitura({ resultado: "caixa_postal", temperatura: "frio", resumo: "Caiu na gravação da operadora (caixa postal)." })
      : await lerComIA(b, agora);
  const fone = String(b.destination_number ?? "").replace(/\D/g, "");
  const fim = fone.slice(-8);
  const { data: o } = fim.length === 8
    ? await db().from("outreach_leads").select("place_id, empresa, status_comercial").like("whatsapp", `%${fim}`).not("place_id", "like", "%_comercial").limit(1).maybeSingle()
    : { data: null };
  const empresa = (o as { empresa?: string } | null)?.empresa ?? null;

  let extra: string | null = null;
  let marcou = false;
  if (l.resultado === "reuniao_agendada" || l.quer_hoje) {
    const r = await marcarReuniao(b, l, empresa).catch((e) => ({ marcou: false, texto: `Não consegui marcar sozinha: ${String((e as Error)?.message ?? e).slice(0, 160)}` }));
    marcou = r.marcou;
    extra = r.texto;
  }
  // 25/11 (Kelvin): pediu "manda por WhatsApp/e-mail" → o material sai sozinho pela fila
  let material: string | null = null;
  if (l.material && !marcou && l.resultado !== "pediu_para_nao_ligar") {
    material = await agendarMaterial({
      canal: l.material === "email" && l.email ? "email" : "whatsapp",
      fone,
      whatsapp: l.whatsapp,
      email: l.email,
      nome: l.nome_responsavel,
      empresa,
      placeId: (o as { place_id?: string } | null)?.place_id ?? null,
    }, agora).catch((e) => `Material não foi para a fila: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
    extra = [extra, `📎 ${material}`].filter(Boolean).join("\n");
  }
  const etapa = etapaDoResultado(l, marcou);
  const nota = notaDaLigacao(l, extra, typeof b.call_link === "string" ? b.call_link : null);

  if (o) {
    const placeId = (o as { place_id: string }).place_id;
    // Ligação sem conversa (não atendeu) conta no funil de Ligações, mas não enche o card de comentários
    if (l.resultado !== "caixa_postal") await db().from("comercial_card_notas").insert({ card: `g:${placeId}`, texto: nota.slice(0, 4000) });
    const atual = (o as { status_comercial: string | null }).status_comercial ?? "";
    const ORDEM = ["respondeu", "qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"];
    if (etapa === "perdido" && !["reuniao", "reuniao_realizada", "proposta", "ganho"].includes(atual)) {
      await db().from("outreach_leads").update({ status_comercial: "perdido", cadencia: "parada", proximo_toque_em: null, proximo_canal: null }).eq("place_id", placeId);
    } else if (["qualificacao", "reuniao"].includes(etapa) && ORDEM.indexOf(etapa) > ORDEM.indexOf(atual)) {
      await db().from("outreach_leads").update({ status_comercial: etapa }).eq("place_id", placeId);
    }
    if (l.resultado === "retorno_combinado") await agendarRetorno(`g:${placeId}`, empresa ?? fone, l).catch(() => null);
  }

  // Funil de Ligações (Indicadores): toda ligação conta, com o resultado e até onde chegou
  await registrarNaListaDeLigacoes(b, l, etapa, nota, empresa, fone).catch((e) => console.error("lista de ligações", e));

  // Recusa clara: a Gabi do WhatsApp também não insiste
  if (["sem_interesse", "pediu_para_nao_ligar"].includes(l.resultado) && fone.length >= 10) {
    const { data: s } = await db().from("sdr_leads").select("id").like("phone", `%${fim}`).limit(1).maybeSingle();
    if (s) await updateLead((s as { id: string }).id, { next_followup_at: null, status: l.resultado === "pediu_para_nao_ligar" ? "opt_out" : "desqualificado" });
  }
  // 24/11 (Kelvin): não atendeu ou desligou logo → recado no WhatsApp (fila, em horário comercial)
  const motivo = material ? null : motivoDoRecado(l, Number(b.call_duration ?? 0), sem);
  const recado = motivo && fone.length >= 10 ? await agendarRecadoLigacao(fone, empresa, motivo, agora).catch((e) => `erro: ${String((e as Error)?.message ?? e).slice(0, 120)}`) : null;
  return { ok: true, resultado: l.resultado, etapa, marcou, no_funil: !!o, recado, material };
}

