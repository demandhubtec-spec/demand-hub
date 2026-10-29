import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Atualização "quase em tempo real": polling a cada 12s (seção 6 do handoff).
const REFRESH = 12_000;

export type WaStatus = "pendente" | "enviado" | "erro" | "respondeu" | "optout" | "sem_whatsapp" | "ignorado";
export type EmailStatus = "pendente" | "enviado" | "erro" | "respondeu" | "optout" | "sem_email" | "ignorado";
export type StatusComercial =
  | "novo" | "contatado" | "respondeu" | "reuniao" | "proposta" | "ganho" | "perdido" | "descartado";

export interface OutreachLead {
  place_id: string;
  empresa: string;
  cidade: string | null;
  nicho: string | null;
  decisor: string | null;
  cargo_decisor: string | null;
  prioridade: string | null;
  whatsapp: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  site: string | null;
  instagram: string | null;
  linkedin_empresa: string | null;
  linkedin_decisor: string | null;
  cnpj: string | null;
  porte: string | null;
  avaliacoes: number | null;
  observacoes: string | null;
  origem: string | null;
  coletado_em: string | null;
  wa_status: WaStatus;
  email_status: EmailStatus;
  status_comercial: StatusComercial;
  wa_message: string | null;
  wa_sent_at: string | null;
  reply_text: string | null;
  email_subject: string | null;
  email_sent_at: string | null;
  created_at: string;
  updated_at: string | null;
  // Diagnóstico do perfil no Google + mensagem personalizada (aba Aprovação)
  nota: number | null;
  fotos: number | null;
  termo_busca: string | null;
  posicao_busca: number | null;
  total_busca: number | null;
  diagnostico: Diagnostico | null;
  msg_rascunho: string | null;
  msg_status: "sem" | "gerando" | "rascunho" | "aprovada" | "rejeitada";
  msg_gerada_em: string | null;
  msg_aprovada_em: string | null;
  // Cadência de follow-up
  sequencia: Toque[] | null;
  cadencia: "nao_iniciada" | "ativa" | "pausada" | "respondeu" | "concluida" | "parada";
  toque_atual: number;
  cadencia_inicio: string | null;
  proximo_toque_em: string | null;
  proximo_canal: "whatsapp" | "email" | null;
  ultimo_toque_em: string | null;
  respondeu_no_toque: number | null;
  retomar_em: string | null;
  tentativa: number;
}

/** Um toque da cadência escrito pela Ana. */
export interface Toque {
  n: number;
  dia: number;
  periodo: "manha" | "tarde";
  canal: "whatsapp" | "email";
  objetivo?: string;
  assunto?: string;
  texto: string;
}

export interface Diagnostico {
  posicao:
    | { tipo: "busca"; posicao: number; total: number | null; termo: string }
    | { tipo: "avaliacoes"; posicao: number; total: number; nicho: string; cidade: string; lider: { empresa: string; avaliacoes: number } | null }
    | null;
  pontos_fortes: string[];
  oportunidades: string[];
  dados: { avaliacoes: number | null; nota: number | null; site: boolean; instagram: boolean; fotos: number | null };
}

export interface OutreachConfig {
  id: number;
  wa_enabled: boolean;
  dry_run: boolean;
  test_number: string | null;
  wa_daily_cap: number;
  wa_min_interval_sec: number;
  wa_max_interval_sec: number;
  send_days: number[];
  send_start_hour: number;
  send_end_hour: number;
  email_enabled: boolean;
  email_daily_cap: number;
  email_min_interval_sec: number;
  email_max_interval_sec: number;
  next_wa_at: string | null;
  next_email_at: string | null;
  optout_words: string[];
  exigir_aprovacao: boolean;
  followup_daily_cap: number;
  retomar_dias: number;
}

export interface OutreachTemplate {
  id: number | string;
  channel: "whatsapp" | "email";
  name: string | null;
  subject: string | null;
  body: string;
  active: boolean;
}

export interface OutreachLogItem {
  id: number | string;
  place_id: string | null;
  channel: string | null;
  event: string;
  /** jsonb: { msg } quando vem do portal; { to, text }, { status, body } etc. quando vem do motor */
  detail: Record<string, unknown> | string | null;
  created_at: string;
}

/** Texto curto para mostrar um evento do log. */
export function detalheTexto(d: OutreachLogItem["detail"]): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  const o = d as Record<string, unknown>;
  if (typeof o.msg === "string") return o.msg;
  if (typeof o.text === "string") return (o.to ? `para ${o.to}: ` : "") + o.text;
  if (o.status || o.body) return `${o.status ?? ""} ${String(o.body ?? "")}`.trim();
  if (o.num) return `número ${o.num}`;
  if (o.to) return `para ${o.to}`;
  return JSON.stringify(o).slice(0, 200);
}

export interface OutreachResumo {
  total_leads: number;
  wa_na_fila: number;
  wa_enviados: number;
  wa_hoje: number;
  responderam: number;
  optout: number;
  wa_erros: number;
  emails_enviados: number;
}

export interface OutreachColeta {
  id: number;
  executada_em: string;
  cidades: string[] | null;
  nichos: string[] | null;
  lugares_coletados: number | null;
  novos_adicionados: number | null;
  custo_usd: number | null;
  acumulado_mes_usd: number | null;
  observacoes: string | null;
}

async function q<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export function useOutreachResumo() {
  return useQuery({
    queryKey: ["outreach", "resumo"],
    refetchInterval: REFRESH,
    queryFn: () => q<OutreachResumo>(supabase.from("outreach_resumo").select("*").single()),
  });
}

export function useOutreachConfig() {
  return useQuery({
    queryKey: ["outreach", "config"],
    refetchInterval: REFRESH,
    queryFn: () => q<OutreachConfig>(supabase.from("outreach_config").select("*").eq("id", 1).single()),
  });
}

export function useOutreachLeads() {
  return useQuery({
    queryKey: ["outreach", "leads"],
    refetchInterval: REFRESH,
    queryFn: () =>
      q<OutreachLead[]>(supabase.from("outreach_leads").select("*").order("created_at", { ascending: false }).limit(2000)),
  });
}

export function useOutreachTemplates() {
  return useQuery({
    queryKey: ["outreach", "templates"],
    queryFn: () => q<OutreachTemplate[]>(supabase.from("outreach_templates").select("*").order("id")),
  });
}

export function useOutreachLog(placeId?: string) {
  return useQuery({
    queryKey: ["outreach", "log", placeId ?? "all"],
    refetchInterval: REFRESH,
    queryFn: () => {
      let query = supabase.from("outreach_log").select("*").order("created_at", { ascending: false }).limit(placeId ? 100 : 50);
      if (placeId) query = query.eq("place_id", placeId);
      return q<OutreachLogItem[]>(query);
    },
  });
}

export function useOutreachColetas() {
  return useQuery({
    queryKey: ["outreach", "coletas"],
    refetchInterval: 60_000,
    queryFn: () =>
      q<OutreachColeta[]>(supabase.from("outreach_coletas").select("*").order("executada_em", { ascending: false }).limit(100)),
  });
}

export function useOutreachOrcamento() {
  return useQuery({
    queryKey: ["outreach", "orcamento"],
    refetchInterval: 60_000,
    queryFn: () => q<{ mes: string; gasto_usd: number; teto_usd: number }>(supabase.rpc("outreach_orcamento")),
  });
}

/** Status da instância do WhatsApp e envio de teste (proxy server-side na Edge Function outreach-admin). */
export function useInstanceStatus() {
  return useQuery({
    queryKey: ["outreach", "instance"],
    refetchInterval: 30_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("outreach-admin", { body: { action: "status" } });
      if (error) throw error;
      return data as { connected: boolean; detail?: string };
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["outreach"] });
}

async function log(event: string, msg: string, placeId?: string) {
  await supabase.from("outreach_log").insert({ channel: "portal", event, detail: { msg }, place_id: placeId ?? null });
}

export function useUpdateConfig() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ patch, descricao }: { patch: Partial<OutreachConfig>; descricao: string }) => {
      await q(supabase.from("outreach_config").update(patch).eq("id", 1));
      await log("config", descricao);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateLead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ placeId, patch, descricao }: { placeId: string; patch: Partial<OutreachLead>; descricao?: string }) => {
      await q(supabase.from("outreach_leads").update(patch).eq("place_id", placeId));
      if (descricao) await log("config", descricao, placeId);
    },
    onSuccess: invalidate,
  });
}

export function useSaveTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (t: Partial<OutreachTemplate> & { channel: "whatsapp" | "email"; body: string }) => {
      if (t.id !== undefined) {
        const { id, ...rest } = t;
        await q(supabase.from("outreach_templates").update(rest).eq("id", id));
      } else {
        await q(supabase.from("outreach_templates").insert({ active: true, ...t }));
      }
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: number | string) => {
      await q(supabase.from("outreach_templates").delete().eq("id", id));
    },
    onSuccess: invalidate,
  });
}

export function useImportLeads() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (leads: Record<string, unknown>[]) =>
      q<{ recebidos: number; novos: number; duplicados: number }>(
        supabase.rpc("outreach_import_leads", { p: { leads } }),
      ),
    onSuccess: invalidate,
  });
}

export function useSendTest() {
  return useMutation({
    mutationFn: async (input: { number: string; text: string }) => {
      const { data, error } = await supabase.functions.invoke("outreach-admin", { body: { action: "send_test", ...input } });
      if (error) throw error;
      return data as { ok: boolean; error?: string };
    },
  });
}

/** Endereço da IA SDR (gera as mensagens com IA). */
const SDR_URL = (import.meta.env.VITE_SDR_URL as string | undefined) ?? "https://demandia-sdr.vercel.app";

/** Gera (ou refaz) a mensagem personalizada dos leads. Sem ids: pega os próximos sem mensagem. */
export function useGerarMensagens() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (placeIds?: string[]) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("faça login de novo no portal");
      const r = await fetch(`${SDR_URL}/api/prospeccao/gerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(placeIds?.length ? { place_ids: placeIds } : {}),
      });
      const j = (await r.json().catch(() => ({}))) as { gerados?: number; restantes?: number; erros?: string[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? `erro ${r.status}`);
      return { gerados: j.gerados ?? 0, restantes: j.restantes ?? 0, erros: j.erros ?? [] };
    },
    onSuccess: invalidate,
  });
}
