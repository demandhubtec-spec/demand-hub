/**
 * Canal "Você e a Ana": a conversa interna entre a Ana e o Kelvin.
 *  - A Ana pede orientação quando não sabe como seguir com um lead (ferramenta pedir_orientacao).
 *  - O Kelvin orienta pelo portal ou respondendo no WhatsApp: a Ana aplica na conversa com o lead,
 *    conta o que mandou e guarda a orientação para as próximas conversas.
 */
import { humanizar } from "./estilo.ts";
import { callLLM } from "./llm.ts";
import { toChat } from "./chat.ts";
import { activeMeeting, addMessage, db, getLead, history, logEvent, tryLock, unlock, updateLead, type Lead } from "./db.ts";
import { env } from "./env.ts";
import { destination, sendBubbles, sendText } from "./evolution.ts";
import { systemPrompt } from "./prompt.ts";
import { prospeccaoDoTelefone } from "./prospeccao.ts";

export interface MsgCanal {
  lead_id?: string | null;
  autor: "kelvin" | "ana";
  tipo?: "texto" | "audio" | "imagem";
  conteudo: string;
  origem?: "portal" | "whatsapp" | "sistema";
  status?: "pendente" | "respondido" | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

interface Decisao {
  mensagem_para_lead?: string | null;
  resposta_ao_kelvin?: string;
  regra_geral?: string | null;
}

function lerJson(t: string | null): Decisao {
  try {
    return JSON.parse((t ?? "{}").replace(/^```json\s*|```$/g, "")) as Decisao;
  } catch {
    return {};
  }
}

/**
 * O Kelvin mandou uma orientação. Se for sobre um lead (ou responde a um pedido pendente),
 * a Ana aplica na conversa; se for geral, vira regra para as próximas conversas.
 */
export async function processarOrientacao(o: { leadId: string | null; conteudo: string; origem: "portal" | "whatsapp" }) {
  let leadId = o.leadId;
  if (!leadId) leadId = (await pedidoPendente())?.lead_id ?? null;

  if (!leadId) {
    const r = await callLLM({
      system: `Você é a Ana, SDR da DemandIA. O Kelvin, seu gestor, te mandou esta mensagem no canal interno (não é de um lead).
Se for uma orientação de como agir nas conversas com leads, resuma como uma regra curta e objetiva em "regra_geral".
Se for uma pergunta ou comentário, responda em "resposta_ao_kelvin" de forma curta e direta, em português, sem travessão.
Responda só em JSON: {"resposta_ao_kelvin": string, "regra_geral": string | null}`,
      messages: [{ role: "user", content: o.conteudo }],
      json: true,
      maxTokens: 600,
    });
    const d = lerJson(r.message.content);
    if (d.regra_geral) await db().from("ana_orientacoes").insert({ texto: d.regra_geral });
    const resposta = humanizar(d.resposta_ao_kelvin || (d.regra_geral ? `Anotado! Vou seguir isso nas próximas conversas: ${d.regra_geral}` : "Anotado!"));
    await registrar({ autor: "ana", conteudo: resposta, origem: "sistema" });
    if (o.origem === "whatsapp") await avisarKelvin(resposta);
    return { lead: null, resposta };
  }

  // Espera a Ana terminar alguma resposta em andamento para este lead
  let travou = false;
  for (let i = 0; i < 8 && !(travou = await tryLock(leadId, 120)); i++) await sleep(4000);
  try {
    let lead = await getLead(leadId);
    const p = await prospeccaoDoTelefone(lead.phone).catch(() => null);
    const nome = nomeDoLead(lead, p?.empresa);
    const meeting = await activeMeeting(leadId);
    await db().from("ana_orientacoes").insert({ lead_id: leadId, texto: o.conteudo });
    const regras = await orientacoesPara(leadId);
    const mensagens = toChat(await history(leadId, 30));
    mensagens.push({
      role: "user",
      content: `[MENSAGEM INTERNA DO KELVIN, SEU GESTOR. O lead NÃO vê isto.]\n${o.conteudo}\n\nAplique essa orientação. Responda só em JSON:
{"mensagem_para_lead": "o que mandar agora para o lead seguindo a orientação, no seu estilo de WhatsApp (balões separados por linha em branco), ou null se não for para mandar nada agora",
 "resposta_ao_kelvin": "1 ou 2 frases curtas para o Kelvin dizendo o que você fez ou vai fazer",
 "regra_geral": "se a orientação valer para outros leads também, a regra curta; senão null"}`,
    });
    const r = await callLLM({ system: systemPrompt(lead, meeting, new Date(), p, regras), messages: mensagens, json: true, maxTokens: 1200 });
    const d = lerJson(r.message.content);
    const paraLead = d.mensagem_para_lead ? humanizar(d.mensagem_para_lead) : "";

    if (paraLead) {
      lead = await getLead(leadId);
      await sendBubbles(destination(lead), paraLead, async (content, id) => {
        await addMessage({ lead_id: leadId!, direction: "out", author: "ia", content, evolution_message_id: id });
      });
      await updateLead(leadId, { last_outbound_at: new Date().toISOString() });
      await logEvent(leadId, "orientacao_aplicada", { chars: paraLead.length });
    }
    if (d.regra_geral) await db().from("ana_orientacoes").insert({ texto: d.regra_geral });
    await db().from("ana_canal").update({ status: "respondido" }).eq("lead_id", leadId).eq("status", "pendente");

    const resposta = [humanizar(d.resposta_ao_kelvin || "Feito!"), paraLead ? `Mandei para ${nome}:\n«${paraLead}»` : ""].filter(Boolean).join("\n\n");
    await registrar({ lead_id: leadId, autor: "ana", conteudo: resposta, origem: "sistema" });
    if (o.origem === "whatsapp") await avisarKelvin(resposta);
    return { lead: leadId, resposta };
  } finally {
    if (travou) await unlock(leadId);
  }
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
