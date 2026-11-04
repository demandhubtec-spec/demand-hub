/**
 * Conversas da prospecção que pararam no meio (decisão do Kelvin em 02/11/2026):
 *  - 1 dia útil sem resposta (a 2ª retomada, 3 dias úteis depois), ou chegou a data do retorno combinado → a Ana escreve uma retomada
 *    com o objetivo de chegar ao responsável e marcar a conversa/ligação com o especialista;
 *  - a retomada NUNCA sai sozinha: vira proposta no canal "Você e a Ana" e espera o ok do Kelvin;
 *  - no máximo 2 retomadas sem resposta; depois o lead vai para "Retomar depois" (60 dias).
 * Roda no cron de 10 em 10 minutos, só em horário comercial.
 */
import { toChat } from "./chat.ts";
import { callLLM } from "./llm.ts";
import { activeMeeting, db, history, logEvent, updateLead, type Lead } from "./db.ts";
import { isBlocked } from "./bloqueio.ts";
import { addBusinessDays, isBusinessTime } from "./followup.ts";
import { humanizar, REGRAS_DE_ESTILO } from "./estilo.ts";
import { formatBR } from "./time.ts";
import { proporRetomada } from "./canal.ts";
import { proximosHorarios } from "./tools.ts";

const MAX_RETOMADAS = 2;
/**
 * Dias úteis parada antes de cada retomada (Kelvin, 04/11/2026): conversa quente esfria rápido,
 * então a 1ª sai no dia útil seguinte e a 2ª três dias úteis depois.
 */
const DIAS_PARADA = [1, 3];
const fim8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);

interface LeadProsp {
  place_id: string;
  empresa: string;
  whatsapp: string | null;
  decisor: string | null;
  nicho: string | null;
  cidade: string | null;
  retorno_em: string | null;
  retorno_nota: string | null;
  diag_enviado_em: string | null;
  responsavel_contato: string | null;
  retomadas: number | null;
  retomada_em: string | null;
}

const maxData = (...xs: (string | null | undefined)[]) =>
  xs.filter(Boolean).map((x) => new Date(x!)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

export async function runRetomadas(now = new Date()) {
  if (!isBusinessTime(now)) return { skipped: "fora do horário comercial" };

  const { data } = await db()
    .from("outreach_leads")
    .select("place_id,empresa,whatsapp,decisor,nicho,cidade,retorno_em,retorno_nota,diag_enviado_em,responsavel_contato,retomadas,retomada_em")
    .eq("cadencia", "respondeu")
    .in("status_comercial", ["respondeu", "contatado", "novo"])
    .not("whatsapp", "is", null)
    .limit(100);

  let propostas = 0;
  const encerradas: string[] = [];
  for (const p of (data ?? []) as LeadProsp[]) {
    if (propostas >= 5) break;
    const { data: ls } = await db().from("sdr_leads").select("*").ilike("phone", `%${fim8(p.whatsapp)}`).limit(1);
    const lead = (ls ?? [])[0] as Lead | undefined;
    if (!lead) continue;
    if (["opt_out", "desqualificado", "agendado"].includes(lead.status)) continue;
    if (isBlocked(lead.phone, lead.whatsapp_jid)) continue;
    if (await activeMeeting(lead.id)) continue;

    // Já tem rascunho esperando o ok do Kelvin para este contato: não empilha outro
    const { count: pend } = await db().from("ana_canal").select("id", { count: "exact", head: true }).eq("lead_id", lead.id).eq("status", "aguardando_ok");
    if (pend) continue;

    // O lead falou por último e ninguém respondeu: isso é conversa em andamento, não parada
    const inb = lead.last_inbound_at ? new Date(lead.last_inbound_at) : null;
    const out = lead.last_outbound_at ? new Date(lead.last_outbound_at) : null;
    if (inb && (!out || inb > out)) continue;

    const retorno = p.retorno_em ? new Date(p.retorno_em) : null;
    const ultimo = maxData(lead.last_inbound_at, lead.last_outbound_at, p.retomada_em);
    if (!ultimo) continue;
    // Retomadas contam só desde a última resposta do lead
    const feitas = p.retomada_em && inb && inb > new Date(p.retomada_em) ? 0 : p.retomadas ?? 0;

    let motivo: string;
    if (retorno) {
      if (retorno > now) continue;
      motivo = `retorno combinado${p.retorno_nota ? `: ${p.retorno_nota}` : ""}`;
    } else {
      if (addBusinessDays(ultimo, DIAS_PARADA[Math.min(feitas, DIAS_PARADA.length - 1)]) > now) continue;
      if (feitas >= MAX_RETOMADAS) {
        // Duas retomadas sem resposta: volta para a cadência daqui a 60 dias
        const volta = new Date(now.getTime() + 60 * 864e5).toISOString().slice(0, 10);
        await db()
          .from("outreach_leads")
          .update({ cadencia: "concluida", retomar_em: volta, status_comercial: "contatado", wa_status: "enviado", retomadas: 0, retomada_em: null })
          .eq("place_id", p.place_id);
        await updateLead(lead.id, { next_followup_at: null, status: "sem_resposta" });
        await logEvent(lead.id, "retomadas_esgotadas", { volta });
        encerradas.push(p.empresa);
        continue;
      }
      motivo = `conversa parada, retomada ${feitas + 1} de ${MAX_RETOMADAS}`;
    }

    const texto = await escrever(lead, p, motivo, now).catch(() => "");
    if (!texto) continue;
    await proporRetomada(lead.id, texto, motivo);
    await db()
      .from("outreach_leads")
      .update({ retomadas: feitas + (retorno ? 0 : 1), retomada_em: now.toISOString() })
      .eq("place_id", p.place_id);
    propostas++;
  }
  return { propostas, encerradas };
}

async function escrever(lead: Lead, p: LeadProsp, motivo: string, now: Date): Promise<string> {
  const msgs = toChat(await history(lead.id, 30));
  msgs.push({ role: "user", content: "[Sistema: escreva agora a mensagem de retomada.]" });
  const merged = msgs.reduce<typeof msgs>((acc, m) => {
    const last = acc[acc.length - 1];
    if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") last.content = `${last.content}\n${m.content}`;
    else acc.push({ ...m });
    return acc;
  }, []);

  const horarios = await proximosHorarios(now).catch(() => [] as string[]);
  const system = `Você é a Ana, da DemandIA. Você mesma procurou esta empresa (${p.empresa}${p.nicho ? `, ${p.nicho}` : ""}${p.cidade ? `, ${p.cidade}` : ""}) pelo WhatsApp oferecendo um diagnóstico gratuito do perfil dela no Google, e a conversa parou.
Motivo desta mensagem: ${motivo}.
Objetivo: chegar até o responsável (marketing, comercial ou quem cuida do perfil no Google) e marcar uma conversa de 30 minutos ou uma ligação rápida com o nosso especialista em presença digital.
Situação: diagnóstico ${p.diag_enviado_em ? "já enviado" : "ainda não enviado"}; contato do responsável ${p.responsavel_contato ? `já temos (${p.responsavel_contato})` : "ainda não temos"}.

Escreva UMA mensagem curta de retomada (1 a 3 frases, no máximo 2 balões separados por linha em branco):
- Retome o ponto exato onde a conversa parou (veja o histórico). Se foi combinado um retorno com alguém, fale com essa pessoa pelo nome e lembre do combinado.
- Traga 1 achado concreto do diagnóstico (com número) que ainda não foi dito, ou retome o que a pessoa perguntou.
- Se quem está conversando é quem decide (ou já mostrou interesse), termine convidando para a conversa gratuita de 30 minutos com o nosso especialista oferecendo exatamente estes 2 horários reais: ${horarios.slice(0, 2).join(" ou ") || "(sem horários livres: pergunte qual dia da semana fica melhor)"}, e pergunte qual fica melhor.
- Se for a recepção ou ainda não sabemos quem decide, termine pedindo o nome e o WhatsApp de quem cuida do perfil no Google.
- PROIBIDO pergunta de qualificação ou descoberta: nada de "indicação ou Google?", "já têm alguém que cuida disso?", "querem mais contatos?", faturamento, equipe ou "pra eu direcionar a análise".
- Nunca diga que enviou algo que não está no histórico. Não explique como resolver os problemas: isso é o que o especialista mostra.
- Tom leve, sem cobrar e sem "só passando". Não repita frases que você já mandou.
- Não se apresente de novo se já se apresentou. Não use "grátis": diga "gratuito".
- Responda só com o texto da mensagem.

${REGRAS_DE_ESTILO}

Agora: ${formatBR(now)}`;

  const r = await callLLM({ system, messages: merged, maxTokens: 800 });
  const texto = humanizar(r.message.content ?? "");
  // Nunca repete uma frase que já foi mandada nessa conversa
  const ja = new Set(merged.filter((m) => m.role === "assistant").flatMap((m) => String(m.content).split("\n")).map((l) => l.trim().toLowerCase()).filter(Boolean));
  if (texto.split(/\n+/).some((l) => ja.has(l.trim().toLowerCase()))) return "";
  return texto;
}
