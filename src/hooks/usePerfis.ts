import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Perfil } from "@/lib/types";

/** Lista de perfis ativos — usada para escolher o responsável de uma atividade. */
export function usePerfis() {
  return useQuery({
    queryKey: ["perfis"],
    queryFn: async (): Promise<Perfil[]> => {
      const { data, error } = await supabase.from("perfis").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as Perfil[];
    },
  });
}
