import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Accent = "primary" | "positive" | "attention" | "negative";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaClass?: "up" | "warn";
  accent?: Accent;
  index?: number;
  /** Ícone opcional no topo do card (padrão do Resumo). */
  icon?: React.ComponentType<{ className?: string }>;
}

/* Linha colorida no topo do card + brilho suave, no mesmo estilo dos cards do Tonabê OS. */
const accentTop: Record<Accent, string> = {
  primary: "after:bg-[linear-gradient(90deg,#5A28E0,#A47BFF)]",
  positive: "after:bg-positive",
  attention: "after:bg-attention",
  negative: "after:bg-negative",
};

const accentIcon: Record<Accent, string> = {
  primary: "bg-primary-tint text-primary-bright",
  positive: "bg-positive-tint text-positive",
  attention: "bg-attention-tint text-attention",
  negative: "bg-negative-tint text-negative",
};

export function KpiCard({ label, value, delta, deltaClass = "up", accent = "primary", index = 0, icon: Icon }: KpiCardProps) {
  return (
    <Card
      className={cn(
        "animate-kpiIn px-[18px] pb-4 pt-[18px] after:pointer-events-none after:absolute after:left-0 after:right-0 after:top-0 after:h-[2px] after:opacity-90",
        accentTop[accent],
      )}
      style={{ animationDelay: `${0.04 + index * 0.07}s` }}
    >
      {Icon && (
        <div className={cn("mb-3 flex h-8 w-8 items-center justify-center rounded-[9px]", accentIcon[accent])}>
          <Icon className="h-[17px] w-[17px]" />
        </div>
      )}
      <div className="brand-num text-[34px]">{value}</div>
      <div className="eyebrow mt-2.5 text-[10px] leading-snug text-muted">{label}</div>
      {delta && (
        <div
          className={cn(
            "mt-1.5 font-mono text-[11px] font-semibold",
            deltaClass === "up" ? "text-positive" : "text-attention",
          )}
        >
          {delta}
        </div>
      )}
    </Card>
  );
}
