import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Mensagem } from "@/lib/types";

/** Alvo do chat: um projeto OU uma atividade (nunca os dois). */
export type ChatAlvo = { projetoId: string } | { atividadeId: string };

function alvoKey(alvo: ChatAlvo | null) {
  if (!alvo) return ["mensagens", "nenhum"];
  return "projetoId" in alvo ? ["mensagens", "projeto", alvo.projetoId] : ["mensagens", "atividade", alvo.atividadeId];
}

/** Mensagens do chat de um projeto ou atividade, em ordem cronológica, com atualização em tempo real. */
export function useMensagens(alvo: ChatAlvo | null) {
  const queryClient = useQueryClient();
  const key = alvoKey(alvo);
  const coluna = alvo && "projetoId" in alvo ? "projeto_id" : "atividade_id";
  const valor = alvo ? ("projetoId" in alvo ? alvo.projetoId : alvo.atividadeId) : null;

  // Realtime: quando alguém manda mensagem no mesmo projeto/atividade, a conversa atualiza sozinha.
  // (Só funciona se a tabela "mensagens" estiver na publicação supabase_realtime; sem isso, nada quebra.)
  React.useEffect(() => {
    if (!valor) return;
    const channel = supabase
      .channel(`mensagens-${coluna}-${valor}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `${coluna}=eq.${valor}` },
        () => queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coluna, valor]);

  return useQuery({
    queryKey: key,
    enabled: !!valor,
    queryFn: async (): Promise<Mensagem[]> => {
      const { data, error } = await supabase
        .from("mensagens")
        .select("*")
        .eq(coluna, valor!)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
  });
}

export function useEnviarMensagem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ alvo, texto, autorId }: { alvo: ChatAlvo; texto: string; autorId: string }) => {
      const { error } = await supabase.from("mensagens").insert({
        projeto_id: "projetoId" in alvo ? alvo.projetoId : null,
        atividade_id: "atividadeId" in alvo ? alvo.atividadeId : null,
        autor_id: autorId,
        texto,
      });
      if (error) throw error;
    },
    onSuccess: (_d, { alvo }) => {
      queryClient.invalidateQueries({ queryKey: alvoKey(alvo) });
    },
  });
}
