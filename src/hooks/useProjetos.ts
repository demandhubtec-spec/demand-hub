import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AtividadePrioridade, Departamento, ProjetoStatus } from "@/lib/types";

export interface ProjetoView {
  id: string;
  nome: string;
  empresa: string;
  clienteId: string | null;
  departamento: Departamento;
  progresso: number;
  status: ProjetoStatus;
  prazo: string | null;
  briefing: string | null;
  responsavelId: string | null;
  prioridade: AtividadePrioridade;
  prazoInicio: string | null;
  prazoFim: string | null;
}

type ProjetoRow = {
  id: string;
  nome: string;
  cliente_id: string | null;
  departamento: Departamento;
  progresso: number;
  status: ProjetoStatus;
  prazo: string | null;
  // Colunas da migration 0003 — podem vir undefined se ela ainda não rodou.
  briefing?: string | null;
  responsavel_id?: string | null;
  prioridade?: AtividadePrioridade | null;
  prazo_inicio?: string | null;
  prazo_fim?: string | null;
  clientes: { nome: string } | null;
};

function mapRow(p: ProjetoRow): ProjetoView {
  return {
    id: p.id,
    nome: p.nome,
    empresa: p.clientes?.nome ?? "—",
    clienteId: p.cliente_id,
    departamento: p.departamento,
    progresso: p.progresso,
    status: p.status,
    prazo: p.prazo,
    briefing: p.briefing ?? null,
    responsavelId: p.responsavel_id ?? null,
    prioridade: p.prioridade ?? "media",
    prazoInicio: p.prazo_inicio ?? null,
    prazoFim: p.prazo_fim ?? p.prazo ?? null,
  };
}

/** Todos os projetos de um departamento (usado nas páginas /:dept/projetos). */
export function useProjetosDept(dept: Departamento) {
  return useQuery({
    queryKey: ["projetos", dept],
    queryFn: async (): Promise<ProjetoView[]> => {
      const { data, error } = await supabase
        .from("projetos")
        .select("*, clientes(nome)")
        .eq("departamento", dept);
      if (error) throw error;
      return ((data ?? []) as ProjetoRow[]).map(mapRow);
    },
  });
}

/** Todos os projetos da empresa, de todos os departamentos (dashboard geral, seletor de projeto). */
export function useProjetosAll() {
  return useQuery({
    queryKey: ["projetos", "all"],
    queryFn: async (): Promise<ProjetoView[]> => {
      const { data, error } = await supabase.from("projetos").select("*, clientes(nome)");
      if (error) throw error;
      return ((data ?? []) as ProjetoRow[]).map(mapRow);
    },
  });
}

export function useCreateProjeto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nome: string;
      cliente_id: string | null;
      departamento: Departamento;
      prazo?: string | null;
      status?: ProjetoStatus;
      progresso?: number;
    }) => {
      const { data, error } = await supabase
        .from("projetos")
        .insert({
          nome: input.nome,
          cliente_id: input.cliente_id,
          departamento: input.departamento,
          prazo: input.prazo || null,
          status: input.status ?? "andamento",
          progresso: input.progresso ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projetos"] });
    },
  });
}

export type ProjetoPatch = Partial<{
  nome: string;
  status: ProjetoStatus;
  briefing: string | null;
  responsavel_id: string | null;
  prioridade: AtividadePrioridade;
  prazo_inicio: string | null;
  prazo_fim: string | null;
}>;

/** Atualiza campos do projeto a partir do modal de detalhe. */
export function useUpdateProjeto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ProjetoPatch }) => {
      const body: Record<string, unknown> = { ...patch };
      // Mantém a coluna antiga "prazo" (usada nos cards e no dashboard) em sincronia com a conclusão.
      if ("prazo_fim" in patch) body.prazo = patch.prazo_fim || null;
      if ("prazo_inicio" in patch) body.prazo_inicio = patch.prazo_inicio || null;
      if ("prazo_fim" in patch) body.prazo_fim = patch.prazo_fim || null;
      const { error } = await supabase.from("projetos").update(body).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projetos"] });
    },
  });
}
