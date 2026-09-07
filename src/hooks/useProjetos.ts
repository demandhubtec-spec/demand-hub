import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Departamento, ProjetoStatus } from "@/lib/types";

export interface ProjetoView {
  id: string;
  nome: string;
  empresa: string;
  clienteId: string | null;
  departamento: Departamento;
  progresso: number;
  status: ProjetoStatus;
  prazo: string | null;
}

type ProjetoRow = {
  id: string;
  nome: string;
  cliente_id: string | null;
  departamento: Departamento;
  progresso: number;
  status: ProjetoStatus;
  prazo: string | null;
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
