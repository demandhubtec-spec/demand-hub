import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.ts";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export interface Lead {
  id: string;
  phone: string;
  whatsapp_jid: string | null;
  nome: string | null;
  empresa: string | null;
  email: string | null;
  segmento: string | null;
  faturamento_mensal: number | null;
  autoridade: string | null;
  dores: string[] | null;
  necessidade_resumo: string | null;
  prazo: string | null;
  bant_score: number;
  qualificacao_resumo: string | null;
  status: string;
  ai_paused: boolean;
  followup_attempts: number;
  next_followup_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
}

export interface Meeting {
  id: string;
  lead_id: string;
  starts_at: string;
  ends_at: string;
  google_event_id: string | null;
  meet_link: string | null;
  attendee_emails: string[];
  status: string;
  confirm_at: string | null;
  confirm_sent_at: string | null;
  reminder_at: string | null;
  reminder_sent_at: string | null;
}

export interface Message {
  id: string;
  direction: "in" | "out";
  author: "lead" | "ia" | "humano" | "sistema";
  kind: string;
  content: string;
  created_at: string;
}

function must<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
  return res.data as T;
}

export async function getLead(id: string): Promise<Lead> {
  return must(await db().from("sdr_leads").select("*").eq("id", id).single(), "getLead");
}

export async function upsertLeadByPhone(phone: string, jid: string, pushName?: string): Promise<Lead> {
  const found = await db().from("sdr_leads").select("*").eq("phone", phone).maybeSingle();
  if (found.data) return found.data as Lead;
  const created = await db()
    .from("sdr_leads")
    .insert({ phone, whatsapp_jid: jid, nome: pushName || null })
    .select("*")
    .single();
  if (created.error?.code === "23505") return getLeadByPhone(phone); // corrida: outro request criou
  return must(created, "upsertLeadByPhone");
}

async function getLeadByPhone(phone: string): Promise<Lead> {
  return must(await db().from("sdr_leads").select("*").eq("phone", phone).single(), "getLeadByPhone");
}

export async function updateLead(id: string, patch: Partial<Lead> & Record<string, unknown>) {
  must(await db().from("sdr_leads").update(patch).eq("id", id).select("id"), "updateLead");
}

export async function addMessage(m: {
  lead_id: string;
  direction: "in" | "out";
  author: Message["author"];
  content: string;
  kind?: string;
  evolution_message_id?: string | null;
}): Promise<{ id: string } | null> {
  const res = await db().from("sdr_messages").insert(m).select("id").single();
  if (res.error?.code === "23505") return null; // webhook duplicado
  return must(res, "addMessage");
}

export async function history(leadId: string, limit = 40): Promise<Message[]> {
  const rows = must(
    await db()
      .from("sdr_messages")
      .select("id,direction,author,kind,content,created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(limit),
    "history",
  ) as Message[];
  return rows.reverse();
}

export async function latestInboundId(leadId: string): Promise<string | null> {
  const r = await db()
    .from("sdr_messages")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (r.data as { id: string } | null)?.id ?? null;
}

export async function messageExists(evolutionId: string): Promise<boolean> {
  const r = await db().from("sdr_messages").select("id").eq("evolution_message_id", evolutionId).maybeSingle();
  return !!r.data;
}

export async function activeMeeting(leadId: string): Promise<Meeting | null> {
  const r = await db()
    .from("sdr_meetings")
    .select("*")
    .eq("lead_id", leadId)
    .in("status", ["agendada", "confirmada"])
    .gte("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  return (r.data as Meeting | null) ?? null;
}

export async function tryLock(leadId: string, seconds = 90): Promise<boolean> {
  const r = await db().rpc("sdr_try_lock", { p_lead: leadId, p_seconds: seconds });
  return r.data === true;
}

export async function unlock(leadId: string) {
  await db().from("sdr_leads").update({ processing_until: null }).eq("id", leadId);
}

export async function logEvent(leadId: string | null, type: string, payload: unknown = {}) {
  await db().from("sdr_events").insert({ lead_id: leadId, type, payload });
}
