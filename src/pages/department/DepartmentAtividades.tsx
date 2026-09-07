import * as React from "react";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { NovaAtividadeModal } from "@/components/shared/NovaAtividadeModal";
import { departamentoInfo } from "@/data/departamentos";
import type { Departamento } from "@/lib/types";
import { useAtividadesDept, useUpdateAtividadeStatus } from "@/hooks/useAtividades";
import { cn } from "@/lib/utils";

export default function DepartmentAtividades() {
  const { dept } = useParams<{ dept: Departamento }>();
  const key = (dept ?? "tecnologia") as Departamento;
  const info = departamentoInfo[key];
  const { data: atividades = [] } = useAtividadesDept(key);
  const updateStatus = useUpdateAtividadeStatus();
  const [modalOpen, setModalOpen] = React.useState(false);

  function toggle(id: string, done: boolean) {
    updateStatus.mutate({ id, status: done ? "a-fazer" : "concluido" });
  }

  return (
    <section>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[21px] font-semibold">{info.nome} — Minhas atividades</div>
          <div className="mt-1 text-[13px] text-muted">Marque como concluída quando terminar.</div>
        </div>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Nova atividade
        </Button>
      </div>

      {atividades.length === 0 ? (
        <EmptyState>
          Nenhuma atividade em {info.nome} ainda. Clique em "Nova atividade" para começar a organizar as tarefas
          deste departamento.
        </EmptyState>
      ) : (
        <Card className="p-5 px-[22px]">
          <div className="flex flex-col">
            {atividades.map((a) => {
              const done = a.status === "concluido";
              return (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-start gap-3 border-b border-border py-[13px] last:border-b-0"
                >
                  <input type="checkbox" className="sr-only" checked={done} onChange={() => toggle(a.id, done)} />
                  <span
                    className={cn(
                      "relative mt-0.5 h-[19px] w-[19px] shrink-0 rounded-[6px] border-[1.5px] border-border transition-all",
                      done && "border-primary bg-primary shadow-[0_0_10px_rgba(178,111,214,.6)]",
                    )}
                  >
                    {done && (
                      <svg viewBox="0 0 16 16" className="absolute inset-0 h-full w-full p-[3px] text-white">
                        <path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-[13.5px] font-medium transition-opacity", done && "opacity-50 line-through")}>
                        {a.titulo}
                      </span>
                      <PriorityBadge prioridade={a.prioridade} />
                    </span>
                    <span className="text-[11.5px] text-muted">
                      {a.contexto}
                      {a.responsavelNome && ` · ${a.responsavelNome}`}
                    </span>
                    {a.descricao && <span className="text-[11.5px] text-muted">{a.descricao}</span>}
                  </span>
                  <span className="shrink-0 rounded-[5px] bg-surface-2 px-2 py-[3px] font-mono text-[11px] text-muted">
                    {a.prazo ?? "Sem prazo"}
                  </span>
                </label>
              );
            })}
          </div>
        </Card>
      )}

      <NovaAtividadeModal open={modalOpen} onOpenChange={setModalOpen} departamentoFixo={key} />
    </section>
  );
}
