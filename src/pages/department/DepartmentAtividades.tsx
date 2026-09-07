import * as React from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { deptData } from "@/data/seed";
import type { Departamento } from "@/lib/types";
import { useAtividadesDept } from "@/hooks/useDepartamento";
import { cn } from "@/lib/utils";

export default function DepartmentAtividades() {
  const { dept } = useParams<{ dept: Departamento }>();
  const key = (dept ?? "tecnologia") as Departamento;
  const d = deptData[key];
  const { data: atividades = d.atividades } = useAtividadesDept(key);
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});

  function isChecked(titulo: string, status: string) {
    return checked[titulo] ?? status === "concluido";
  }

  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">{d.nome} — Minhas atividades</div>
        <div className="mt-1 text-[13px] text-muted">Marque como concluída quando terminar.</div>
      </div>

      <Card className="p-5 px-[22px]">
        <div className="flex flex-col">
          {atividades.map((a) => {
            const done = isChecked(a.titulo, a.status);
            return (
              <label
                key={a.titulo}
                className="flex cursor-pointer items-center gap-3 border-b border-border py-[13px] last:border-b-0"
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={done}
                  onChange={() => setChecked((prev) => ({ ...prev, [a.titulo]: !done }))}
                />
                <span
                  className={cn(
                    "relative h-[19px] w-[19px] shrink-0 rounded-[6px] border-[1.5px] border-border transition-all",
                    done && "border-primary bg-primary shadow-[0_0_10px_rgba(178,111,214,.6)]",
                  )}
                >
                  {done && (
                    <svg viewBox="0 0 16 16" className="absolute inset-0 h-full w-full p-[3px] text-white">
                      <path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("text-[13.5px] font-medium transition-opacity", done && "opacity-50 line-through")}>
                    {a.titulo}
                  </span>
                  <span className="text-[11.5px] text-muted">{a.contexto}</span>
                </span>
                <span className="shrink-0 rounded-[5px] bg-surface-2 px-2 py-[3px] font-mono text-[11px] text-muted">
                  {a.prazo}
                </span>
              </label>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
