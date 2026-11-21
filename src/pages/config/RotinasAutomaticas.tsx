import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Switch } from "@/components/ui/switch";

type Status = Record<string, { ativa: boolean; agenda: string }>;

const ROTINAS = [
  { id: "ig-bot-tick", nome: "Bot do Instagram", desc: "Responde e puxa conversas no Instagram (a cada 5 min quando ligado)." },
  { id: "outreach-email-tick", nome: "Disparo de e-mail", desc: "Envia e confere e-mails de prospecção (a cada 30 min, dias úteis)." },
  { id: "estudio-tick", nome: "Estúdio de conteúdo", desc: "Gera e publica os posts agendados no Estúdio (a cada 10 min)." },
];

export function RotinasAutomaticas() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["rotinas"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rotinas_status");
      if (error) throw new Error(error.message);
      return data as Status;
    },
  });
  const mudar = useMutation({
    mutationFn: async (v: { id: string; ativa: boolean }) => {
      const { data, error } = await supabase.rpc("rotina_ligar", { p_nome: v.id, p_ativa: v.ativa });
      if (error) throw new Error(error.message);
      return data as Status;
    },
    onSuccess: (d) => qc.setQueryData(["rotinas"], d),
  });

  return (
    <div className="mb-8">
      <div className="mb-[14px]">
        <div className="text-[20px] font-semibold">Rotinas automáticas</div>
        <div className="mt-1 text-[13px] text-muted">
          Desligada, a rotina para de rodar e não gasta nada do banco. WhatsApp e as SDRs (Gabi e Marina) ficam sempre ligados.
        </div>
      </div>
      {error && <div className="mb-2 text-[13px] text-red-400">{(error as Error).message}</div>}
      {mudar.error && <div className="mb-2 text-[13px] text-red-400">{(mudar.error as Error).message}</div>}
      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {ROTINAS.map((r) => {
          const ativa = !!data?.[r.id]?.ativa;
          return (
            <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <div className="text-[14px] font-medium">{r.nome}</div>
                <div className="text-[12px] text-muted">{r.desc}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted">{isLoading ? "…" : ativa ? "Ligado" : "Desligado"}</span>
                <Switch
                  checked={ativa}
                  disabled={isLoading || mudar.isPending}
                  onCheckedChange={(v) => mudar.mutate({ id: r.id, ativa: v })}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
