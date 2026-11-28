/**
 * Recado no WhatsApp depois da ligação (24/11, Kelvin): a Gabi ligou e a pessoa não atendeu, ou atendeu e
 * desligou logo → a SDR manda uma mensagem no WhatsApp.
 *
 * Duas entradas:
 *  - webhook do Callface (ligação que conectou: caixa postal, gravação, desligou nos primeiros segundos);
 *  - tabela recados_ligacao (ligação que nem conectou: o Callface não manda webhook; a lista vem da campanha).
 * O envio vai pela fila envios_agendados (4 a cada 10 minutos, em horário comercial), para não sair uma
 * rajada de mensagens do mesmo número.
 */
import { db, leadDoTelefone, logEvent, upsertLeadByPhone, type Lead } from "./db.ts";
import { nomeDaSdr, sdrValida } from "./sdrs.ts";

export type MotivoRecado = "nao_atendeu" | "desligou";

/** Celular brasileiro (tem WhatsApp): DDD + 9 + 8 dígitos. Fixo não recebe recado. */
export function ehCelular(fone: string): boolean {
  const d = fone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 11 && d[2] === "9";
}

/** Telefone no formato do sdr_leads (55 + DDD + número). */
export function telefoneComDdi(fone: string): string {
  const d = fone.replace(/\D/g, "");
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

/**
 * A ligação pede recado? Não atendeu (sem conversa, caixa postal, gravação) ou atendeu e desligou logo
 * (até 30 s, sem falar com ninguém, sem nome nem retorno combinado).
 */
export function motivoDoRecado(
  l: { resultado: string; nome_responsavel?: string | null; retorno?: string | null; quem_atendeu?: string | null },
  duracaoSeg: number,
  semConversa: boolean,
): MotivoRecado | null {
  if (semConversa || l.resultado === "caixa_postal") return "nao_atendeu";
  if (l.resultado === "nao_falou_com_responsavel" && Number.isFinite(duracaoSeg) && duracaoSeg <= 30 && !l.nome_responsavel && !l.retorno) return "desligou";
  return null;
}

/** Texto do recado. Sem "agora há pouco": a fila só anda em horário comercial e o recado pode sair depois. */
export function textoDoRecado(motivo: MotivoRecado, sdr: unknown, empresa: string | null): string {
  const quem = sdrValida(sdr);
  const eu = nomeDaSdr(quem);
  const ligou = quem === "gabi" ? "Tentei falar com vocês por telefone" : "A Gabi, da nossa equipe, tentou falar com vocês por telefone";
  const abertura = motivo === "desligou"
    ? `Oi! Aqui é a ${eu}, da Demand 😊 ${quem === "gabi" ? "Acho que a nossa ligação caiu" : "Acho que a ligação da Gabi, da nossa equipe, caiu"}.`
    : `Oi! Aqui é a ${eu}, da Demand 😊 ${ligou}, mas acho que não foi um bom momento.`;
  // 27/11 (Kelvin): a oferta é a consultoria gratuita, não o diagnóstico
  const doQue = `É sobre uma consultoria gratuita, de uns 20 minutinhos pelo Meet, em que nosso especialista mostra na prática como captar, atender e organizar os clientes${empresa ? ` da ${nomeCurto(empresa)}` : ""}.`;
  return `${abertura}\n\n${doQue}\n\nPosso te contar por aqui?`;
}

/** Nome curto da empresa (o do Google vem com especialidade e cidade: "Clínica X | Ortodontia em Itu"). */
export function nomeCurto(empresa: string): string {
  return empresa.split(/\s[|\-–—•·]\s|\s\(/)[0].trim().slice(0, 50);
}

const TRES_DIAS = 3 * 864e5;
const UM_DIA = 864e5;

/**
 * Põe o recado na fila. Devolve o que fez (para o log). Não manda: para fixo, quem recusou ou pediu para
 * não ser chamado, quem já recebeu recado nos últimos 3 dias e quem está conversando (falou nas últimas 24 h).
 */
export async function agendarRecadoLigacao(fone: string, empresa: string | null, motivo: MotivoRecado, agora = new Date()): Promise<string> {
  if (!ehCelular(fone)) return "fixo";
  const phone = telefoneComDdi(fone);
  const fim = phone.slice(-8);
  const { data: o } = await db().from("outreach_leads").select("empresa,wa_status,status_comercial,agente").like("whatsapp", `%${fim}`).not("place_id", "like", "%_comercial").limit(1).maybeSingle();
  const ol = o as { empresa?: string | null; wa_status?: string | null; status_comercial?: string | null; agente?: string | null } | null;
  if (ol && (ol.wa_status === "optout" || ["perdido", "descartado"].includes(ol.status_comercial ?? ""))) return "recusou";
  const existente = await leadDoTelefone(phone);
  if (existente) {
    if (["opt_out", "desqualificado", "agendado", "qualificado", "humano"].includes(existente.status)) return `status ${existente.status}`;
    if ((existente as Lead & { lixeira_em?: string | null }).lixeira_em) return "na lixeira";
    if (existente.last_inbound_at && agora.getTime() - new Date(existente.last_inbound_at).getTime() < UM_DIA) return "conversando";
  }
  const lead: Lead = existente ?? (await upsertLeadByPhone(phone, `${phone}@s.whatsapp.net`, undefined, sdrValida(ol?.agente)));
  const { data: recente } = await db()
    .from("sdr_events")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("type", "recado_ligacao")
    .gte("created_at", new Date(agora.getTime() - TRES_DIAS).toISOString())
    .limit(1)
    .maybeSingle();
  if (recente) return "recado recente";
  const { data: naFila } = await db().from("envios_agendados").select("id").eq("lead_id", lead.id).eq("status", "agendado").limit(1).maybeSingle();
  if (naFila) return "já na fila";
  const texto = textoDoRecado(motivo, lead.agente, empresa ?? ol?.empresa ?? lead.empresa ?? null);
  const { error } = await db().from("envios_agendados").insert({ lead_id: lead.id, texto, enviar_em: new Date(agora.getTime() + 2 * 60e3).toISOString(), com_pdf: false, status: "agendado" });
  if (error) return `erro: ${error.message}`;
  await logEvent(lead.id, "recado_ligacao", { motivo });
  return "agendado";
}

/**
 * Ligações que nem conectaram (o Callface não manda webhook): a lista da campanha entra na tabela
 * recados_ligacao (telefone, empresa, motivo) e o relógio põe os recados na fila.
 */
export async function runRecadosPendentes(agora = new Date()) {
  const { data, error } = await db().from("recados_ligacao").select("id,telefone,empresa,motivo").eq("status", "pendente").order("criado_em", { ascending: true }).limit(40);
  if (error) return { erro: error.message };
  const feitos: Record<string, number> = {};
  for (const r of (data ?? []) as { id: string; telefone: string; empresa: string | null; motivo: string | null }[]) {
    const out = await agendarRecadoLigacao(r.telefone, r.empresa, r.motivo === "desligou" ? "desligou" : "nao_atendeu", agora).catch((e) => `erro: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
    feitos[out.startsWith("erro") ? "erro" : out] = (feitos[out.startsWith("erro") ? "erro" : out] ?? 0) + 1;
    await db().from("recados_ligacao").update({ status: out.startsWith("erro") ? "erro" : "feito", resultado: out.slice(0, 200), feito_em: new Date().toISOString() }).eq("id", r.id);
  }
  return feitos;
}
