import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Uma seção do playbook comercial: título e uma linha por regra. */
export interface SecaoPlaybook {
  titulo: string;
  texto: string;
}

export interface Playbook {
  secoes: SecaoPlaybook[];
  atualizado_em: string | null;
}

/** Playbook comercial que a Ana e o time seguem (Comercial > Time Comercial IA > Playbook). */
export function usePlaybook() {
  return useQuery({
    queryKey: ["comercial", "playbook"],
    queryFn: async (): Promise<Playbook> => {
      const { data, error } = await supabase.from("comercial_playbook").select("secoes,atualizado_em").eq("id", "principal").maybeSingle();
      if (error) throw error;
      return { secoes: (data?.secoes as SecaoPlaybook[] | undefined) ?? [], atualizado_em: data?.atualizado_em ?? null };
    },
  });
}

export function useSalvarPlaybook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (secoes: SecaoPlaybook[]) => {
      const { data: u } = await supabase.auth.getUser();
      const limpas = secoes.map((s) => ({ titulo: s.titulo.trim(), texto: s.texto.trim() })).filter((s) => s.titulo || s.texto);
      const { error } = await supabase
        .from("comercial_playbook")
        .upsert({ id: "principal", secoes: limpas, atualizado_em: new Date().toISOString(), atualizado_por: u.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comercial", "playbook"] }),
  });
}

/** Manual de trabalho de um agente do time comercial (editável; o agente segue o que estiver salvo). */
export interface ManualAgente {
  id: string;
  nome: string;
  cargo: string;
  secoes: SecaoPlaybook[];
  ordem: number;
  atualizado_em: string | null;
}

export function useManuais() {
  return useQuery({
    queryKey: ["comercial", "manuais"],
    queryFn: async (): Promise<ManualAgente[]> => {
      const { data, error } = await supabase.from("agentes_manuais").select("id,nome,cargo,secoes,ordem,atualizado_em").order("ordem");
      if (error) throw error;
      return (data ?? []) as ManualAgente[];
    },
  });
}

export function useSalvarManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, secoes }: { id: string; secoes: SecaoPlaybook[] }) => {
      const { data: u } = await supabase.auth.getUser();
      const limpas = secoes.map((s) => ({ titulo: s.titulo.trim(), texto: s.texto.trim() })).filter((s) => s.titulo || s.texto);
      const { error } = await supabase
        .from("agentes_manuais")
        .update({ secoes: limpas, atualizado_em: new Date().toISOString(), atualizado_por: u.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comercial", "manuais"] }),
  });
}
