import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { chamarSdr, useOutreachLeads, type OutreachLead } from "@/hooks/useProspeccao";

/** Etapas do funil inbound (anúncios, site e WhatsApp direto). "proposta" aparece como Negociação. */
export const ETAPAS_OPORTUNIDADE = [
  { key: "recebido", label: "Leads do anúncio" },
  { key: "atendimento", label: "Conversa iniciada" },
  { key: "qualificacao", label: "Qualificação" },
  { key: "reuniao", label: "Reunião agendada" },
  { key: "reuniao_realizada", label: "Reunião realizada" },
  { key: "proposta", label: "Negociação" },
  { key: "ganho", label: "Venda" },
  { key: "perdido", label: "Perdido" },
] as const;
export type EtapaOportunidade = (typeof ETAPAS_OPORTUNIDADE)[number]["key"];

export interface SdrLead {
  id: string;
  phone: string;
  nome: string | null;
  empresa: string | null;
  email: string | null;
  segmento: string | null;
  origem: string | null;
  status: string | null;
  bant_score: number | null;
  qualificacao_resumo: string | null;
  necessidade_resumo: string | null;
  ai_paused: boolean | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at?: string | null;
  /** Na lixeira: some do funil e dos indicadores, mas continua guardado e pode ser restaurado. */
  lixeira_em?: string | null;
  funil_etapa: EtapaOportunidade | null;
}

export interface SdrMensagem {
  id: string;
  lead_id: string;
  direction: "in" | "out";
  author: string | null;
  kind: string | null;
  content: string;
  created_at: string;
}

/** Contato do CRM: o lead da Ana, marcado como prospecção ativa (veio da nossa abordagem) ou inbound. */
export interface Contato extends SdrLead {
  tipo: "prospeccao" | "inbound";
  prospeccao: OutreachLead | null;
  nomeExibicao: string;
  ultimaAtividade: string;
}

const fim8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);

export const ORIGEM_TEXTO: Record<string, string> = {
  lp_diagnostico: "Landing page",
  whatsapp: "WhatsApp",
  anuncio: "Anúncio",
  demo_instagram: "Demo Instagram",
};

/** Atualiza a lista quando a Ana recebe ou manda mensagem (tempo real, com polling de reserva). */
function useAoVivo(nome: string, tabela: string, chaves: unknown[][]) {
  const qc = useQueryClient();
  React.useEffect(() => {
    const ch = supabase
      // nome único por tela: o mesmo hook roda em mais de um lugar ao mesmo tempo
      .channel(`crm-${nome}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tabela }, () => chaves.forEach((k) => qc.invalidateQueries({ queryKey: k })))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, tabela]);
}

export function useContatos() {
  const { data: prosp = [] } = useOutreachLeads();
  useAoVivo("leads", "sdr_leads", [["crm", "contatos"]]);
  useAoVivo("msgs-lista", "sdr_messages", [["crm", "contatos"]]);
  const q = useQuery({
    queryKey: ["crm", "contatos"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<SdrLead[]> => {
      const { data, error } = await supabase.from("sdr_leads").select("*").order("updated_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as SdrLead[];
    },
  });
  const contatos = React.useMemo<Contato[]>(() => {
    const porFone = new Map<string, OutreachLead>();
    for (const l of prosp) if (l.whatsapp) porFone.set(fim8(l.whatsapp), l);
    return (q.data ?? [])
      .map((s) => {
        const p = porFone.get(fim8(s.phone)) ?? null;
        const ultima = [s.last_inbound_at, s.last_outbound_at, s.created_at].filter(Boolean).sort().pop() as string;
        return {
          ...s,
          tipo: p ? "prospeccao" : "inbound",
          prospeccao: p,
          nomeExibicao: p?.empresa ?? s.empresa ?? s.nome ?? s.phone,
          ultimaAtividade: ultima,
        } as Contato;
      })
      .sort((a, b) => b.ultimaAtividade.localeCompare(a.ultimaAtividade));
  }, [q.data, prosp]);
  return { ...q, contatos };
}

export function useConversa(leadId: string | null) {
  const qc = useQueryClient();
  React.useEffect(() => {
    if (!leadId) return;
    const ch = supabase
      .channel(`crm-conversa-${leadId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sdr_messages", filter: `lead_id=eq.${leadId}` }, () =>
        qc.invalidateQueries({ queryKey: ["crm", "conversa", leadId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [leadId, qc]);
  return useQuery({
    queryKey: ["crm", "conversa", leadId],
    enabled: !!leadId,
    refetchInterval: 20_000,
    queryFn: async (): Promise<SdrMensagem[]> => {
      const { data, error } = await supabase
        .from("sdr_messages")
        .select("id,lead_id,direction,author,kind,content,created_at")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SdrMensagem[];
    },
  });
}

/** Move um contato inbound no funil de oportunidades. */
export function useEtapaInbound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, etapa }: { id: string; etapa: EtapaOportunidade | null }) => {
      const { error } = await supabase.from("sdr_leads").update({ funil_etapa: etapa }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
}

/** Manda contatos para a lixeira (ou restaura). Nada é apagado. */
export function useLixeira() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, lixeira }: { ids: string[]; lixeira: boolean }) => {
      const { error } = await supabase
        .from("sdr_leads")
        .update({ lixeira_em: lixeira ? new Date().toISOString() : null })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
}

/**
 * Liga ou pausa a Ana numa conversa. Pausar também cancela o próximo follow-up.
 * Religar uma conversa que tinha sido passada para a equipe devolve ela para a Ana.
 */
export function useAlternarAna() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ligar, status }: { id: string; ligar: boolean; status: string | null }) => {
      const patch: Record<string, unknown> = ligar
        ? { ai_paused: false, ...(status === "humano" ? { status: "em_qualificacao" } : {}) }
        : { ai_paused: true, next_followup_at: null };
      const { error } = await supabase.from("sdr_leads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
}

/* ---------- Canal "Você e a Ana" ---------- */

export interface MsgCanal {
  id: string;
  lead_id: string | null;
  autor: "kelvin" | "ana";
  tipo: "texto" | "audio" | "imagem";
  conteudo: string;
  origem: "portal" | "whatsapp" | "sistema";
  status: "pendente" | "respondido" | "aguardando_ok" | "enviado" | "descartado" | null;
  created_at: string;
}

export function useCanal() {
  useAoVivo("canal", "ana_canal", [["crm", "canal"]]);
  return useQuery({
    queryKey: ["crm", "canal"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<MsgCanal[]> => {
      const { data, error } = await supabase.from("ana_canal").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return ((data ?? []) as MsgCanal[]).reverse();
    },
  });
}

export interface EnvioCanal {
  lead_id?: string | null;
  texto?: string;
  midia?: { tipo: "audio" | "imagem"; base64: string; mimetype: string };
}

/** Botões "Mandar" e "Descartar" de um rascunho da Ana esperando seu ok. */
export function useDecidirRascunho() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { canal_id: string; acao: "aprovar" | "descartar" }) => chamarSdr<{ ok: boolean; conteudo: string }>("/api/ana/canal", b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm", "canal"] }),
  });
}

export function useEnviarCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: EnvioCanal) => chamarSdr<{ ok: boolean; conteudo: string }>("/api/ana/canal", b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm", "canal"] }),
  });
}
