import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Cliente } from "@/lib/types";
import { clientesSeed } from "@/data/seed";

function seedAsClientes(): Cliente[] {
  return clientesSeed.map((c, i) => ({
    id: `seed-${i}`,
    nome: c.nome,
    segmento: c.segmento,
    status: c.status,
    privado: c.privado,
    criado_em: new Date().toISOString(),
  }));
}

export function useClientes() {
  return useQuery({
    queryKey: ["clientes"],
    queryFn: async (): Promise<Cliente[]> => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .order("criado_em", { ascending: false });
      if (error || !data || data.length === 0) return seedAsClientes();
      return data as Cliente[];
    },
  });
}

export function useCreateCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Pick<Cliente, "nome" | "segmento" | "status">) => {
      const { data, error } = await supabase
        .from("clientes")
        .insert({ ...input, privado: false })
        .select()
        .single();
      if (error) throw error;
      return data as Cliente;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
  });
}
