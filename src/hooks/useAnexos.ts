import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Anexo } from "@/lib/types";

const BUCKET = "anexos";

export function useAnexos(projetoId: string | null) {
  return useQuery({
    queryKey: ["anexos", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<Anexo[]> => {
      const { data, error } = await supabase
        .from("anexos")
        .select("*")
        .eq("projeto_id", projetoId!)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Anexo[];
    },
  });
}

function nomeSeguro(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-120);
}

/** Sobe um ou mais arquivos pro bucket "anexos" e registra cada um na tabela anexos. */
export function useUploadAnexos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projetoId, files, autorId }: { projetoId: string; files: File[]; autorId: string }) => {
      for (const file of files) {
        const id = crypto.randomUUID();
        const path = `${projetoId}/${id}-${nomeSeguro(file.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (upErr) throw upErr;
        const { error } = await supabase.from("anexos").insert({
          id,
          projeto_id: projetoId,
          nome: file.name,
          tipo: file.type || null,
          tamanho: file.size,
          storage_path: path,
          criado_por: autorId,
        });
        if (error) {
          // Não deixa arquivo órfão no storage se o registro falhar.
          await supabase.storage.from(BUCKET).remove([path]);
          throw error;
        }
      }
    },
    onSuccess: (_d, { projetoId }) => {
      queryClient.invalidateQueries({ queryKey: ["anexos", projetoId] });
    },
  });
}

export function useRemoverAnexo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (anexo: Anexo) => {
      const { error } = await supabase.from("anexos").delete().eq("id", anexo.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([anexo.storage_path]);
    },
    onSuccess: (_d, anexo) => {
      queryClient.invalidateQueries({ queryKey: ["anexos", anexo.projeto_id] });
    },
  });
}

/** Abre o anexo numa aba nova via URL assinada (o bucket é privado). */
export async function abrirAnexo(anexo: Anexo) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(anexo.storage_path, 60 * 10);
  if (error || !data) throw error ?? new Error("Sem URL");
  window.open(data.signedUrl, "_blank", "noopener");
}
