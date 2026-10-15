import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { EscopoEntrega } from "@/lib/types";

/** Entregas do escopo do contrato de um cliente (roadmap da ficha). Vazio = cliente sem escopo fechado. */
export function useEscopo(clienteId: string | null) {
  return useQuery({
    queryKey: ["escopo", clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<EscopoEntrega[]> => {
      const { data, error } = await supabase
        .from("escopo_entregas")
        .select("*")
        .eq("cliente_id", clienteId!)
        .order("numero", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EscopoEntrega[];
    },
  });
}

/** Quantidade de entregas do escopo por cliente (coluna "Ver projetos (x/y)" em Clientes). */
export function useEscopoContagem() {
  return useQuery({
    queryKey: ["escopo", "contagem"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from("escopo_entregas").select("cliente_id");
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const r of (data ?? []) as { cliente_id: string }[]) out[r.cliente_id] = (out[r.cliente_id] ?? 0) + 1;
      return out;
    },
  });
}
