import { NavLink } from "react-router-dom";
import { departamentoInfo } from "@/data/departamentos";
import type { Departamento } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho da página de uma área (Etapa 2 do visual, 14/11/2026): nome da área e as abas Visão, Projetos e Tarefas.
 * Substitui os três itens repetidos que cada departamento tinha no menu.
 */
export function AbasArea({ dept, acao }: { dept: Departamento; acao?: React.ReactNode }) {
  const info = departamentoInfo[dept];
  const abas = [
    { to: `/${dept}/visao`, label: "Visão" },
    { to: `/${dept}/projetos`, label: "Projetos" },
    { to: `/${dept}/atividades`, label: "Tarefas" },
  ];
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="brand-h text-[28px]">{info.nome}</h1>
          <div className="mt-1 text-[14px] text-muted">{info.resumo}</div>
        </div>
        {acao}
      </div>
      <nav className="mt-5 flex gap-6 overflow-x-auto border-b border-border" aria-label={`Abas de ${info.nome}`}>
        {abas.map((a) => (
          <NavLink
            key={a.to}
            to={a.to}
            className={({ isActive }) =>
              cn(
                "relative top-px whitespace-nowrap border-b-2 pb-3 text-[14px]",
                isActive ? "border-primary font-semibold text-ink" : "border-transparent font-medium text-muted hover:text-ink",
              )
            }
          >
            {a.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
