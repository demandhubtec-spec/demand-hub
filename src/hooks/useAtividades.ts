import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AtividadePrioridade, AtividadeStatus, Departamento } from "@/lib/types";

export interface AtividadeView {
  id: string;
  titulo: string;
  descricao: string | null;
  /** Nome do cliente (ou do projeto, se o projeto não tiver cliente vinculado). */
  contexto: string;
  projetoId: string | null;
  departamento: Departamento | null;
  prazo: string | null;
  status: AtividadeStatus;
  prioridade: AtividadePrioridade;
  responsavelId: string | null;
  responsavelNome: string | null;
}

type AtividadeRow = {
  id: string;
  titulo: string;
  descricao: string | null;
  projeto_id: string | null;
  departamento: Departamento | null;
  prazo: string | null;
  status: AtividadeStatus;
  prioridade: AtividadePrioridade;
  responsavel_id: string | null;
  projetos: { nome: string; clientes: { nome: string } | null } | null;
  perfis: { nome: string } | null;
};

const SELECT = "*, projetos(nome, clientes(nome)), perfis(nome)";

function mapRow(a: AtividadeRow): AtividadeView {
  return {
    id: a.id,
    titulo: a.titulo,
    descricao: a.descricao,
    contexto: a.projetos?.clientes?.nome ?? a.projetos?.nome ?? "Interno",
    projetoId: a.projeto_id,
    departamento: a.departamento,
    prazo: a.prazo,
    status: a.status,
    prioridade: a.prioridade ?? "media",
    responsavelId: a.responsavel_id,
    responsavelNome: a.perfis?.nome ?? null,
  };
}

/** Atividades de um único departamento (páginas /:dept/atividades e /:dept/visao). */
export function useAtividadesDept(dept: Departamento) {
  return useQuery({
    queryKey: ["atividades", "dept", dept],
    queryFn: async (): Promise<AtividadeView[]> => {
      const { data, error } = await supabase
        .from("atividades")
        .select(SELECT)
        .eq("departamento", dept)
        .order("prazo", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return ((data ?? []) as unknown as AtividadeRow[]).map(mapRow);
    },
  });
}

/** Todas as atividades da empresa, de todos os departamentos (dashboard geral). */
export function useAtividadesTodas() {
  return useQuery({
    queryKey: ["atividades", "todas"],
    queryFn: async (): Promise<AtividadeView[]> => {
      const { data, error } = await supabase
        .from("atividades")
        .select(SELECT)
        .order("prazo", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return ((data ?? []) as unknown as AtividadeRow[]).map(mapRow);
    },
  });
}

export function useCreateAtividade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      titulo: string;
      descricao?: string | null;
      departamento: Departamento;
      projeto_id?: string | null;
      responsavel_id?: string | null;
      prazo?: string | null;
      prioridade: AtividadePrioridade;
    }) => {
      const { data, error } = await supabase
        .from("atividades")
        .insert({
          titulo: input.titulo,
          descricao: input.descricao || null,
          departamento: input.departamento,
          projeto_id: input.projeto_id || null,
          responsavel_id: input.responsavel_id || null,
          prazo: input.prazo || null,
          prioridade: input.prioridade,
          status: "a-fazer",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atividades"] });
    },
  });
}

export function useUpdateAtividadeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AtividadeStatus }) => {
      const { error } = await supabase.from("atividades").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atividades"] });
    },
  });
}
