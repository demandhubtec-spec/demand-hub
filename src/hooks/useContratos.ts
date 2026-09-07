import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Contrato } from "@/lib/types";
import { contratosSeed } from "@/data/seed";

export interface ContratoView {
  cliente: string;
  tipo: string;
  inicio: string;
  renovacao: string;
  status: "ativo" | "pendente" | "encerrado";
}

export function useContratos() {
  return useQuery({
    queryKey: ["contratos"],
    queryFn: async (): Promise<ContratoView[]> => {
      const { data, error } = await supabase.from("contratos").select("*, clientes(nome)");
      if (error || !data || data.length === 0) return contratosSeed;
      return (data as (Contrato & { clientes: { nome: string } | null })[]).map((c) => ({
        cliente: c.clientes?.nome ?? "—",
        tipo: c.tipo ?? "—",
        inicio: c.inicio ?? "—",
        renovacao: c.renovacao ?? "—",
        status: c.status,
      }));
    },
  });
}
