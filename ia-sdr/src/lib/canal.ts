/**
 * Canal "Você e a Ana": a conversa interna entre a Ana e o Kelvin.
 *  - A Ana pede orientação quando não sabe como seguir com um lead (ferramenta pedir_orientacao).
 *  - O Kelvin orienta pelo portal ou respondendo no WhatsApp: a Ana aplica na conversa com o lead,
 *    conta o que mandou e guarda a orientação para as próximas conversas.
 */
import { humanizar } from "./estilo.ts";
import { callLLM, parseArgs, type ChatMessage, type Tool } from "./llm.ts";
import { addMessage, db, getLead, history, logEvent, updateLead, type Lead } from "./db.ts";
import { env } from "./env.ts";
import { destination, sendBubbles, sendText } from "./evolution.ts";
import { prospeccaoDoTelefone } from "./prospeccao.ts";

export interface MsgCanal {
  lead_id?: string | null;
  autor: "kelvin" | "ana";
  tipo?: "texto" | "audio" | "imagem";
  conteudo: string;
  origem?: "portal" | "whatsapp" | "sistema";
  status?: "pendente" | "respondido" | "aguardando_ok" | "enviado" | "descartado" | null;
  rascunho?: string | null;
}

export async function registrar(m: MsgCanal) {
  const { data, error } = await db().from("ana_canal").insert(m).select("id").single();
  if (error) throw new Error(`ana_canal: ${error.message}`);
  return data as { id: string };
}

async function avisarKelvin(texto: string) {
  if (env.alertPhone) await sendText(env.alertPhone, texto).catch(() => null);
}

const nomeDoLead = (l: Pick<Lead, "nome" | "empresa" | "phone">, empresa?: string | null) => empresa ?? l.empresa ?? l.nome ?? `+${l.phone}`;

/** Orientações que a Ana deve seguir: as gerais e as deste lead (as mais novas primeiro). */
export async function orientacoesPara(leadId: string | null): Promise<string[]> {
  let q = db().from("ana_orientacoes").select("texto,lead_id").eq("ativa", true).order("created_at", { ascending: false }).limit(25);
  q = leadId ? q.or(`lead_id.is.null,lead_id.eq.${leadId}`) : q.is("lead_id", null);
  const { data } = await q;
  return ((data ?? []) as { texto: string; lead_id: string | null }[]).map((o) => (o.lead_id ? `(sobre este contato) ${o.texto}` : o.texto));
}

/** Ferramenta da Ana: pede orientação ao Kelvin sobre este lead. */
export async function pedirOrientacao(leadId: string, pergunta: string, opcoes: string[] = []): Promise<string> {
  const lead = await getLead(leadId);
  const p = await prospeccaoDoTelefone(lead.phone).catch(() => null);
  const nome = nomeDoLead(lead, p?.empresa);
  const texto = [pergunta.trim(), opcoes.length ? `\nOpções que pensei:\n${opcoes.map((o, i) => `${i + 1}. ${o}`).join("\n")}` : ""].join("");
  await registrar({ lead_id: leadId, autor: "ana", conteudo: texto, origem: "sistema", status: "pendente" });
  await logEvent(leadId, "pediu_orientacao", { pergunta });
  await avisarKelvin(`🙋 Preciso de você sobre *${nome}*\n\n${texto}\n\nResponda aqui mesmo (texto ou áudio) ou no portal, em CRM > Você e a Ana.`);
  return "Pedido de orientação enviado. Responda ao lead com UMA mensagem curta e natural, sem dizer que vai consultar alguém (ex.: \"Boa pergunta, deixa eu confirmar direitinho e já te retorno 😊\"). Não invente a resposta.";
}

/** Último pedido de orientação ainda sem resposta (até 2 dias). */
async function pedidoPendente(): Promise<{ id: string; lead_id: string } | null> {
  const desde = new Date(Date.now() - 2 * 864e5).toISOString();
  const { data } = await db()
    .from("ana_canal")
    .select("id,lead_id")
    .eq("autor", "ana")
    .eq("status", "pendente")
    .not("lead_id", "is", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; lead_id: string } | null) ?? null;
}

const fim8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Nome do contato para o Kelvin: a empresa da prospecção, se houver. */
async function nomeDe(leadId: string): Promise<string> {
  const lead = await getLead(leadId);
  const p = await prospeccaoDoTelefone(lead.phone).catch(() => null);
  return nomeDoLead(lead, p?.empresa);
}

async function buscarContatos(termo: string) {
  const t = termo.trim();
  const digitos = t.replace(/\D/g, "");
  const filtros = [`nome.ilike.%${t}%`, `empresa.ilike.%${t}%`];
  if (digitos.length >= 4) filtros.push(`phone.ilike.%${digitos}`);
  const { data: diretos } = await db().from("sdr_leads").select("id,phone,nome,empresa,status,ai_paused,last_inbound_at").or(filtros.join(",")).limit(8);
  // Também procura pelo nome da empresa ou do decisor na prospecção
  const { data: prosp } = await db().from("outreach_leads").select("whatsapp,empresa,decisor").or(`empresa.ilike.%${t}%,decisor.ilike.%${t}%`).limit(8);
  const extras: unknown[] = [];
  for (const p of (prosp ?? []) as { whatsapp: string | null; empresa: string; decisor: string | null }[]) {
    if (!p.whatsapp) continue;
    const { data: l } = await db().from("sdr_leads").select("id,phone,nome,empresa,status,ai_paused,last_inbound_at").ilike("phone", `%${fim8(p.whatsapp)}`).limit(1);
    if (l?.[0]) extras.push({ ...l[0], empresa_prospeccao: p.empresa, decisor: p.decisor });
  }
  const todos = [...(diretos ?? []), ...extras] as { id: string }[];
  return [...new Map(todos.map((x) => [x.id, x])).values()];
}

async function conversasRecentes(horas: number) {
  const desde = new Date(Date.now() - horas * 3600e3).toISOString();
  const { data } = await db()
    .from("sdr_leads")
    .select("id,phone,nome,empresa,status,ai_paused,last_inbound_at,last_outbound_at")
    .gte("last_inbound_at", desde)
    .order("last_inbound_at", { ascending: false })
    .limit(30);
  const out = [];
  for (const l of (data ?? []) as (Lead & { last_inbound_at: string; last_outbound_at: string | null })[]) {
    const msgs = await history(l.id, 4);
    out.push({
      lead_id: l.id,
      nome: await nomeDe(l.id),
      status: l.status,
      ia_pausada: l.ai_paused,
      sem_resposta: !l.last_outbound_at || l.last_outbound_at < l.last_inbound_at,
      ultimas: msgs.map((m) => `${m.direction === "in" ? "Lead" : "Ana"} (${hora(m.created_at)}): ${m.content.slice(0, 220)}`),
    });
  }
  return out;
}

/** Envia de verdade para o lead (só com o ok do Kelvin). */
async function enviarAoLead(leadId: string, texto: string) {
  const lead = await getLead(leadId);
  const msg = humanizar(texto);
  await sendBubbles(destination(lead), msg, async (content, id) => {
    await addMessage({ lead_id: leadId, direction: "out", author: "ia", content, evolution_message_id: id });
  });
  await updateLead(leadId, { last_outbound_at: new Date().toISOString() });
  await logEvent(leadId, "orientacao_aplicada", { chars: msg.length });
  await db().from("ana_canal").update({ status: "enviado" }).eq("lead_id", leadId).eq("status", "aguardando_ok");
  await db().from("ana_canal").update({ status: "respondido" }).eq("lead_id", leadId).eq("status", "pendente");
  return msg;
}

async function encerrarConversa(leadId: string) {
  const lead = await getLead(leadId);
  await updateLead(leadId, { status: "desqualificado", next_followup_at: null });
  const p = await prospeccaoDoTelefone(lead.phone).catch(() => null);
  if (p?.place_id) await db().from("outreach_leads").update({ cadencia: "parada", proximo_toque_em: null, proximo_canal: null }).eq("place_id", p.place_id);
  await db().from("ana_canal").update({ status: "descartado" }).eq("lead_id", leadId).in("status", ["aguardando_ok", "pendente"]);
  await logEvent(leadId, "encerrado_pelo_kelvin");
}

const FERRAMENTAS_CANAL: Tool[] = [
  {
    name: "buscar_contatos",
    description: "Procura leads pelo nome da pessoa, da empresa ou pelo final do telefone (ex.: 'Evandro', 'Joyce', '8266').",
    input_schema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] },
  },
  {
    name: "conversas_recentes",
    description: "Lista quem escreveu nas últimas horas, com as últimas mensagens e se ficou sem resposta. Use para resumos e para achar quem não foi respondido.",
    input_schema: { type: "object", properties: { horas: { type: "number", description: "Padrão 24" } } },
  },
  {
    name: "ver_conversa",
    description: "Mostra as últimas mensagens da conversa com um lead.",
    input_schema: { type: "object", properties: { lead_id: { type: "string" } }, required: ["lead_id"] },
  },
  {
    name: "propor_mensagem",
    description: "Mostra ao Kelvin a mensagem que você quer mandar para o lead e espera o ok dele. Este é o padrão sempre que for falar com um lead.",
    input_schema: { type: "object", properties: { lead_id: { type: "string" }, texto: { type: "string", description: "Texto exato, no estilo WhatsApp; balões separados por linha em branco." } }, required: ["lead_id", "texto"] },
  },
  {
    name: "aprovar_e_enviar",
    description: "O Kelvin aprovou (ex.: 'ok', 'pode mandar', 'manda'): envia agora o rascunho que está esperando ok. Sem lead_id, envia o último rascunho pendente.",
    input_schema: { type: "object", properties: { lead_id: { type: "string" } } },
  },
  {
    name: "enviar_direto",
    description: "Envia ao lead SEM pedir ok. Só use se o Kelvin disse claramente para mandar direto, ou se ele ditou o texto exato.",
    input_schema: { type: "object", properties: { lead_id: { type: "string" }, texto: { type: "string" } }, required: ["lead_id", "texto"] },
  },
  {
    name: "encerrar_conversa",
    description: "Encerra a conversa com o lead: para follow-ups e cadência. Use quando o Kelvin pedir para encerrar (ex.: robô, sem interesse). Se ele quiser uma despedida, proponha a mensagem antes.",
    input_schema: { type: "object", properties: { lead_id: { type: "string" } }, required: ["lead_id"] },
  },
  {
    name: "salvar_regra",
    description: "Guarda uma orientação que vale para todas as conversas daqui para frente.",
    input_schema: { type: "object", properties: { regra: { type: "string" } }, required: ["regra"] },
  },
];

async function rodarFerramenta(nome: string, a: Record<string, unknown>, avisos: string[]): Promise<string> {
  const leadId = typeof a.lead_id === "string" ? a.lead_id : "";
  switch (nome) {
    case "buscar_contatos":
      return JSON.stringify(await buscarContatos(String(a.termo ?? "")));
    case "conversas_recentes":
      return JSON.stringify(await conversasRecentes(Number(a.horas) > 0 ? Number(a.horas) : 24));
    case "ver_conversa": {
      const msgs = await history(leadId, 15);
      return JSON.stringify({ nome: await nomeDe(leadId), mensagens: msgs.map((m) => `${m.direction === "in" ? "Lead" : m.author === "humano" ? "Kelvin (manual)" : "Ana"} (${hora(m.created_at)}): ${m.content}`) });
    }
    case "propor_mensagem": {
      const texto = humanizar(String(a.texto ?? ""));
      const nome = await nomeDe(leadId);
      await db().from("ana_canal").update({ status: "descartado" }).eq("lead_id", leadId).eq("status", "aguardando_ok");
      await registrar({ lead_id: leadId, autor: "ana", conteudo: `Proposta para ${nome}:\n«${texto}»\n\nPosso mandar?`, origem: "sistema", status: "aguardando_ok", rascunho: texto });
      avisos.push(`📝 Proposta para *${nome}*:\n\n${texto}\n\nResponda *ok* para eu mandar, ou me diga o que mudar.`);
      return "Proposta registrada e enviada ao Kelvin. Agora só confirme em uma frase que está esperando o ok dele.";
    }
    case "aprovar_e_enviar": {
      let q = db().from("ana_canal").select("id,lead_id,rascunho").eq("status", "aguardando_ok").order("created_at", { ascending: false }).limit(1);
      if (leadId) q = q.eq("lead_id", leadId);
      const { data } = await q;
      const r = (data ?? [])[0] as { id: string; lead_id: string; rascunho: string | null } | undefined;
      if (!r?.rascunho) return "Não há rascunho esperando ok. Pergunte ao Kelvin qual mensagem mandar.";
      const enviado = await enviarAoLead(r.lead_id, r.rascunho);
      return `Enviado para ${await nomeDe(r.lead_id)}: «${enviado}»`;
    }
    case "enviar_direto": {
      const enviado = await enviarAoLead(leadId, String(a.texto ?? ""));
      return `Enviado para ${await nomeDe(leadId)}: «${enviado}»`;
    }
    case "encerrar_conversa":
      await encerrarConversa(leadId);
      return `Conversa com ${await nomeDe(leadId)} encerrada: sem mais follow-ups nem cadência.`;
    case "salvar_regra":
      await db().from("ana_orientacoes").insert({ texto: String(a.regra ?? "") });
      return "Regra salva.";
    default:
      return "Ferramenta desconhecida.";
  }
}

/**
 * O Kelvin falou com a Ana (portal ou WhatsApp). Ela entende do que se trata (lead citado, pedido pendente,
 * rascunho esperando ok), usa as ferramentas para agir de verdade e responde contando o que fez.
 */
export async function processarOrientacao(o: { leadId: string | null; conteudo: string; origem: "portal" | "whatsapp" }) {
  const pendente = o.leadId ? null : await pedidoPendente();
  const leadFoco = o.leadId ?? pendente?.lead_id ?? null;
  const { data: ultimas } = await db().from("ana_canal").select("autor,conteudo,lead_id,status,created_at").order("created_at", { ascending: false }).limit(14);
  const historico = ((ultimas ?? []) as { autor: string; conteudo: string; created_at: string }[])
    .reverse()
    .map((m) => `${m.autor === "kelvin" ? "Kelvin" : "Ana"} (${hora(m.created_at)}): ${m.conteudo.slice(0, 500)}`)
    .join("\n");
  const { data: rascunhos } = await db().from("ana_canal").select("lead_id,rascunho").eq("status", "aguardando_ok").order("created_at", { ascending: false }).limit(3);
  const rasc = [];
  for (const r of (rascunhos ?? []) as { lead_id: string; rascunho: string }[]) rasc.push(`- ${await nomeDe(r.lead_id)} (lead_id ${r.lead_id}): «${r.rascunho}»`);
  const foco = leadFoco ? `${await nomeDe(leadFoco)} (lead_id ${leadFoco})` : "nenhum";
  const regras = await orientacoesPara(leadFoco);

  const system = `Você é a Ana, SDR da DemandIA, conversando no canal interno com o Kelvin, seu gestor. Ele te orienta sobre os leads do WhatsApp.

Como agir:
- Nunca prometa sem fazer. Se ele pedir algo sobre um lead, USE AS FERRAMENTAS agora: ache o lead (buscar_contatos ou conversas_recentes), leia a conversa (ver_conversa) e aja.
- Mensagem para lead: o padrão é propor_mensagem (o Kelvin valida antes). Só use enviar_direto se ele mandou enviar direto ou ditou o texto exato.
- "ok", "pode mandar", "manda", "aprovado" logo depois de uma proposta: aprovar_e_enviar.
- "Encerra", "não tem interesse", "é robô": encerrar_conversa. Se ele pediu uma despedida, proponha a mensagem também.
- Resumo ou "quem ficou sem resposta": conversas_recentes e responda com os nomes e o ponto de cada um.
- Orientação que vale para todos: salvar_regra.
- Se faltar informação para achar o lead, pergunte qual é, citando os candidatos.
- Seja proativa: se viu alguém sem resposta, já proponha a mensagem.
- Sua resposta final é para o Kelvin: curta, direta, dizendo o que você FEZ (e o texto proposto ou enviado). Português, sem travessão, sem markdown.
- Mensagens para leads seguem o seu estilo de WhatsApp: curtas, humanas, sem travessão, nunca citando o nome do Kelvin.

Lead em foco agora: ${foco}
Rascunhos esperando o ok do Kelvin:
${rasc.length ? rasc.join("\n") : "nenhum"}
${regras.length ? `\nRegras que você já segue:\n${regras.map((r) => `- ${r}`).join("\n")}\n` : ""}
Últimas mensagens deste canal:
${historico}`;

  const mensagens: ChatMessage[] = [{ role: "user", content: o.conteudo }];
  const avisos: string[] = [];
  let resposta = "";
  for (let passo = 0; passo < 8; passo++) {
    const r = await callLLM({ system, messages: mensagens, tools: FERRAMENTAS_CANAL, maxTokens: 1500 });
    const msg = r.message;
    mensagens.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    if (!msg.tool_calls?.length) {
      resposta = humanizar(msg.content ?? "");
      break;
    }
    for (const call of msg.tool_calls) {
      let out: string;
      try {
        out = await rodarFerramenta(call.function.name, parseArgs(call), avisos);
      } catch (e) {
        out = `Erro: ${String((e as Error).message ?? e).slice(0, 200)}`;
      }
      mensagens.push({ role: "tool", tool_call_id: call.id, content: out });
    }
  }
  if (!resposta) resposta = "Feito.";
  // A proposta já aparece no canal como mensagem própria; aqui fica só a resposta
  await registrar({ lead_id: leadFoco, autor: "ana", conteudo: resposta, origem: "sistema" });
  // No WhatsApp: primeiro a proposta (se houver), depois a resposta. No portal, tudo já aparece no canal.
  if (o.origem === "whatsapp") {
    for (const a of avisos) await avisarKelvin(a);
    await avisarKelvin(resposta);
  }
  return { lead: leadFoco, resposta };
}

/** Pedidos sem resposta há mais de 30 minutos: lembra o Kelvin uma vez. */
export async function lembrarPedidos(now = new Date()) {
  const limite = new Date(now.getTime() - 30 * 60e3).toISOString();
  const { data } = await db()
    .from("ana_canal")
    .select("id,lead_id,conteudo")
    .eq("status", "pendente")
    .is("lembrado_em", null)
    .lte("created_at", limite)
    .limit(5);
  for (const p of (data ?? []) as { id: string; lead_id: string | null; conteudo: string }[]) {
    const lead = p.lead_id ? await getLead(p.lead_id).catch(() => null) : null;
    await avisarKelvin(`⏰ Ainda estou esperando sua orientação${lead ? ` sobre *${nomeDoLead(lead)}*` : ""}:\n\n${p.conteudo.slice(0, 400)}`);
    await db().from("ana_canal").update({ lembrado_em: now.toISOString() }).eq("id", p.id);
  }
  return (data ?? []).length;
}
