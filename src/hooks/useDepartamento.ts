import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Departamento, Projeto, Atividade } from "@/lib/types";
import { deptData, type DeptProjeto, type DeptAtividade } from "@/data/seed";

export function useProjetosDept(dept: Departamento) {
  return useQuery({
    queryKey: ["projetos", dept],
    queryFn: async (): Promise<DeptProjeto[]> => {
      const { data, error } = await supabase
        .from("projetos")
        .select("*, clientes(nome)")
        .eq("departamento", dept);
      if (error || !data || data.length === 0) return deptData[dept].projetos;
      return (data as (Projeto & { clientes: { nome: string } | null })[]).map((p) => ({
        nome: p.nome,
        empresa: p.clientes?.nome ?? "—",
        progresso: p.progresso,
        status: p.status,
        prazo: p.prazo ?? "—",
      }));
    },
  });
}

export function useAtividadesDept(dept: Departamento) {
  return useQuery({
    queryKey: ["atividades", dept],
    queryFn: async (): Promise<DeptAtividade[]> => {
      const { data, error } = await supabase
        .from("atividades")
        .select("*, projetos(nome, clientes(nome))")
        .eq("departamento", dept);
      if (error || !data || data.length === 0) return deptData[dept].atividades;
      return (data as (Atividade & { projetos: { nome: string; clientes: { nome: string } | null } | null })[]).map(
        (a) => ({
          titulo: a.titulo,
          contexto: a.projetos?.clientes?.nome ?? a.projetos?.nome ?? "—",
          prazo: a.prazo ?? "—",
          status: a.status,
        }),
      );
    },
  });
}
