import * as React from "react";
import { cn } from "@/lib/utils";

export interface ItemFaixa {
  rotulo: string;
  valor: React.ReactNode;
  sub?: React.ReactNode;
  tom?: "atencao" | "positivo";
}

/**
 * Números numa faixa só (Etapa 3 do visual, 14/11/2026): no lugar de vários cartões soltos,
 * um cartão com divisórias. Mesmos números, metade da altura.
 */
export function FaixaNumeros({ itens, className }: { itens: ItemFaixa[]; className?: string }) {
  return (
    <div className={cn("mb-5 flex flex-wrap rounded-[12px] border border-border bg-surface shadow-[0_1px_2px_rgba(18,16,31,.04)]", className)}>
      {itens.map((it, i) => (
        <div key={it.rotulo} className={cn("min-w-[140px] flex-1 px-4 py-3", i > 0 && "border-l border-border")}>
          <div className="text-[12px] text-muted">{it.rotulo}</div>
          <div
            className={cn(
              "brand-num mt-0.5 text-[20px] leading-tight",
              it.tom === "atencao" && "text-attention",
              it.tom === "positivo" && "text-positive",
            )}
          >
            {it.valor}
          </div>
          {it.sub && <div className="mt-0.5 text-[12px] text-muted">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}
