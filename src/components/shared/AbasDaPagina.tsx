import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Página com abas guardadas no endereço (?aba=...). Usada onde várias páginas antigas viraram uma só. */
export function AbasDaPagina({
  titulo,
  sub,
  abas,
}: {
  titulo: string;
  sub?: string;
  abas: { k: string; label: string; conteudo: React.ReactNode }[];
}) {
  const [params, setParams] = useSearchParams();
  const atual = abas.find((a) => a.k === params.get("aba")) ?? abas[0];
  return (
    <section>
      <div className="mb-6">
        <h1 className="brand-h text-[28px]">{titulo}</h1>
        {sub && <div className="mt-1 text-[14px] text-muted">{sub}</div>}
        <nav className="mt-5 flex gap-6 overflow-x-auto border-b border-border">
          {abas.map((a) => (
            <button
              key={a.k}
              onClick={() => setParams({ aba: a.k }, { replace: true })}
              className={cn(
                "relative top-px whitespace-nowrap border-b-2 pb-3 text-[14px]",
                a.k === atual.k ? "border-primary font-semibold text-ink" : "border-transparent font-medium text-muted hover:text-ink",
              )}
            >
              {a.label}
            </button>
          ))}
        </nav>
      </div>
      {atual.conteudo}
    </section>
  );
}
