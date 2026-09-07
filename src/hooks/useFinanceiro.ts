import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { FinanceiroLancamento } from "@/lib/types";

export interface LancamentoView {
  /** Data original (YYYY-MM-DD), útil para agrupar por mês. */
  dataISO: string;
  data: string;
  descricao: string;
  cliente: string;
  categoria: string;
  tipo: "entrada" | "saida";
  valor: number;
}

function formatBrDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function useLancamentos() {
  return useQuery({
    queryKey: ["financeiro_lancamentos"],
    queryFn: async (): Promise<LancamentoView[]> => {
      const { data, error } = await supabase
        .from("financeiro_lancamentos")
        .select("*, clientes(nome)")
        .order("data", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as (FinanceiroLancamento & { clientes: { nome: string } | null })[]).map((l) => ({
        dataISO: l.data,
        data: formatBrDate(l.data),
        descricao: l.descricao ?? "",
        cliente: l.clientes?.nome ?? "—",
        categoria: l.categoria ?? "—",
        tipo: l.tipo,
        valor: Number(l.valor),
      }));
    },
  });
}
