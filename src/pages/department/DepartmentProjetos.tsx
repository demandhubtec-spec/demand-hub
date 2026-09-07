import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { departamentoInfo } from "@/data/departamentos";
import type { Departamento } from "@/lib/types";
import { useProjetosDept } from "@/hooks/useProjetos";
import { cn } from "@/lib/utils";

export default function DepartmentProjetos() {
  const { dept } = useParams<{ dept: Departamento }>();
  const key = (dept ?? "tecnologia") as Departamento;
  const info = departamentoInfo[key];
  const { data: projetos = [] } = useProjetosDept(key);

  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">{info.nome} — Projetos</div>
        <div className="mt-1 text-[13px] text-muted">{projetos.length} projeto(s) neste departamento.</div>
      </div>

      {projetos.length === 0 ? (
        <EmptyState>
          Nenhum projeto cadastrado em {info.nome} ainda. Cadastre um cliente com um projeto inicial em
          Comercial → Clientes para começar.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projetos.map((p) => (
            <Card key={p.id} className="p-[18px] pb-4">
              <div className="mb-1.5 font-mono text-[11px] text-muted">{p.empresa}</div>
              <div className="mb-3.5 min-h-[38px] text-[14.5px] font-semibold leading-tight">{p.nome}</div>
              <div className="mb-1.5 flex justify-between text-[11px] text-muted">
                <span>Progresso</span>
                <span>{p.progresso}%</span>
              </div>
              <div className="mb-3.5 h-1.5 overflow-hidden rounded-[5px] bg-surface-2">
                <div
                  className={cn(
                    "h-full rounded-[5px] bg-primary",
                    p.status === "concluido" && "bg-positive",
                    p.status === "atrasado" && "bg-negative",
                  )}
                  style={{ width: `${p.progresso}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <StatusBadge status={p.status} />
                <span className="font-mono text-[11px] text-muted">{p.prazo ? `Prazo ${p.prazo}` : "Sem prazo"}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
