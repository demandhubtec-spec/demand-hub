import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AtividadeStatus, ProjetoFase, ProjetoStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Lado interno (portal): link de acompanhamento e comentários do cliente
// ---------------------------------------------------------------------------

export interface Compartilhamento {
  id: string;
  cliente_id: string;
  token: string;
  ativo: boolean;
  criado_em: string;
}

export interface ComentarioCliente {
  id: string;
  cliente_id?: string;
  projeto_id: string | null;
  autor_tipo: "cliente" | "equipe";
  autor_nome: string;
  texto: string;
  lido?: boolean;
  criado_em: string;
}

export function linkAcompanhamento(token: string) {
  return `${window.location.origin}/acompanhar/${token}`;
}

function slug(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(tabacaria|ltda|me|eireli)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function aleatorio(tam = 12) {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(tam));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

/** Link ativo do cliente (o mais recente). */
export function useCompartilhamento(clienteId: string | null) {
  return useQuery({
    queryKey: ["compartilhamento", clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<Compartilhamento | null> => {
      const { data, error } = await supabase
        .from("compartilhamentos")
        .select("*")
        .eq("cliente_id", clienteId!)
        .eq("ativo", true)
        .order("criado_em", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as Compartilhamento) ?? null;
    },
  });
}

/** Cria um link novo (desliga o anterior, se houver). */
export function useCriarLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteId, clienteNome, autorId }: { clienteId: string; clienteNome: string; autorId?: string }) => {
      await supabase.from("compartilhamentos").update({ ativo: false }).eq("cliente_id", clienteId).eq("ativo", true);
      const token = `${slug(clienteNome) || "cliente"}-${aleatorio()}`;
      const { error } = await supabase
        .from("compartilhamentos")
        .insert({ cliente_id: clienteId, token, criado_por: autorId ?? null });
      if (error) throw error;
      return token;
    },
    onSuccess: (_t, v) => qc.invalidateQueries({ queryKey: ["compartilhamento", v.clienteId] }),
  });
}

export function useDesligarLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; clienteId: string }) => {
      const { error } = await supabase.from("compartilhamentos").update({ ativo: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ["compartilhamento", v.clienteId] }),
  });
}

/** Comentários do cliente + respostas da equipe. Atualiza sozinho quando o cliente comenta. */
export function useComentariosCliente(clienteId: string | null) {
  const qc = useQueryClient();
  // Nome de canal único por tela: o hook é usado em mais de um lugar ao mesmo tempo.
  const instancia = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  React.useEffect(() => {
    if (!clienteId) return;
    const canal = supabase
      .channel(`comentarios-cliente-${clienteId}-${instancia}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comentarios_cliente", filter: `cliente_id=eq.${clienteId}` },
        () => qc.invalidateQueries({ queryKey: ["comentarios-cliente", clienteId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [clienteId, qc, instancia]);

  return useQuery({
    queryKey: ["comentarios-cliente", clienteId],
    enabled: !!clienteId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ComentarioCliente[]> => {
      const { data, error } = await supabase
        .from("comentarios_cliente")
        .select("*")
        .eq("cliente_id", clienteId!)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ComentarioCliente[];
    },
  });
}

export function useResponderCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clienteId: string; projetoId: string | null; texto: string; autorId: string; autorNome: string }) => {
      const { error } = await supabase.from("comentarios_cliente").insert({
        cliente_id: input.clienteId,
        projeto_id: input.projetoId,
        autor_tipo: "equipe",
        autor_id: input.autorId,
        autor_nome: input.autorNome,
        texto: input.texto,
        lido: true,
      });
      if (error) throw error;
    },
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ["comentarios-cliente", v.clienteId] }),
  });
}

export function useMarcarLidos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteId }: { clienteId: string }) => {
      const { error } = await supabase
        .from("comentarios_cliente")
        .update({ lido: true })
        .eq("cliente_id", clienteId)
        .eq("lido", false);
      if (error) throw error;
    },
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ["comentarios-cliente", v.clienteId] }),
  });
}

// ---------------------------------------------------------------------------
// Lado do cliente (página pública /acompanhar/:token, sem login)
// ---------------------------------------------------------------------------

export interface EntregaPublica {
  numero: number;
  nome: string;
  resumo: string | null;
  projeto_id: string | null;
  briefing: string | null;
  status: ProjetoStatus;
  fase: ProjetoFase | null;
  inicio: string | null;
  fim: string | null;
  atividades: { id: string; titulo: string; status: AtividadeStatus; prazo: string | null }[];
}

export interface AcompanhamentoPublico {
  cliente: { nome: string; segmento: string | null };
  atualizado_em: string;
  entregas: EntregaPublica[];
  comentarios: ComentarioCliente[];
}

export function useAcompanhamentoPublico(token: string) {
  return useQuery({
    queryKey: ["acompanhamento-publico", token],
    enabled: !!token,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AcompanhamentoPublico | null> => {
      const { data, error } = await supabase.rpc("acompanhamento_publico", { p_token: token });
      if (error) throw error;
      return (data as AcompanhamentoPublico | null) ?? null;
    },
  });
}

export function useComentarPublico(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projetoId: string | null; nome: string; texto: string }) => {
      const { error } = await supabase.rpc("comentar_publico", {
        p_token: token,
        p_projeto_id: input.projetoId,
        p_nome: input.nome,
        p_texto: input.texto,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acompanhamento-publico", token] }),
  });
}
