import * as React from "react";
import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/toast";
import { ETAPAS_OPORTUNIDADE, ORIGEM_TEXTO, useContatos, useEtapaInbound, type EtapaOportunidade } from "@/hooks/useCrm";
import { fmtData } from "../prospeccao/shared";

export const STATUS_ANA: Record<string, string> = {
  novo: "Novo",
  em_qualificacao: "Em qualificação",
  qualificado: "Qualificado",
  humano: "Com você",
  desqualificado: "Sem perfil",
};

/** Leads que chegaram sozinhos: anúncios, landing page ou WhatsApp direto. */
export function InboundTab({ abrirConversa }: { abrirConversa: (id: string) => void }) {
  const { contatos, isLoading, isError } = useContatos();
  const etapa = useEtapaInbound();
  const { showToast } = useToast();
  const [busca, setBusca] = React.useState("");
  const [origem, setOrigem] = React.useState("todas");

  const lista = contatos
    .filter((c) => c.tipo === "inbound")
    .filter((c) => origem === "todas" || (c.origem ?? "") === origem)
    .filter((c) => !busca.trim() || `${c.nomeExibicao} ${c.nome ?? ""} ${c.phone}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const origens = [...new Set(contatos.filter((c) => c.tipo === "inbound").map((c) => c.origem ?? ""))].filter(Boolean);

  if (isError) return <EmptyState>Falta rodar o SQL do CRM unificado no Supabase para liberar esta aba.</EmptyState>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="max-w-[280px]" placeholder="Buscar por nome, empresa ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {["todas", ...origens].map((o) => (
          <button
            key={o}
            onClick={() => setOrigem(o)}
            className={`rounded-full border px-3 py-1 text-[12px] ${origem === o ? "border-primary text-ink" : "border-border text-muted"}`}
          >
            {o === "todas" ? "Todas as origens" : ORIGEM_TEXTO[o] ?? o}
          </button>
        ))}
      </div>
      {isLoading && <div className="text-[13px] text-muted">Carregando…</div>}
      {!isLoading && lista.length === 0 && <EmptyState>Nenhum lead inbound por aqui ainda.</EmptyState>}
      <div className="grid gap-2.5">
        {lista.map((c) => (
          <Card key={c.id} className="flex flex-wrap items-center gap-3 p-3.5">
            <div className="min-w-[200px] flex-1">
              <div className="text-[13.5px] font-semibold">{c.nomeExibicao}</div>
              <div className="text-[11.5px] text-muted">
                {c.nome && c.nome !== c.nomeExibicao ? `${c.nome} · ` : ""}
                {c.phone} · {ORIGEM_TEXTO[c.origem ?? ""] ?? c.origem ?? "origem não informada"} · desde {fmtData(c.created_at, false)}
              </div>
              {c.necessidade_resumo && <div className="mt-1 text-[12px]">{c.necessidade_resumo}</div>}
            </div>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px]">{STATUS_ANA[c.status ?? ""] ?? c.status ?? "-"}</span>
            {c.bant_score != null && <span className="font-mono text-[11.5px] text-muted">BANT {c.bant_score}</span>}
            <select
              className="rounded-[7px] border border-border bg-surface-2 px-2 py-1.5 text-[12px]"
              value={c.funil_etapa ?? ""}
              onChange={(e) =>
                etapa.mutate(
                  { id: c.id, etapa: (e.target.value || null) as EtapaOportunidade | null },
                  { onError: (err) => showToast(`Erro: ${(err as Error).message}`) },
                )
              }
            >
              <option value="">Fora do funil</option>
              {ETAPAS_OPORTUNIDADE.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
            <button onClick={() => abrirConversa(c.id)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-bright hover:underline">
              <MessageCircle className="h-3.5 w-3.5" /> Conversa
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
