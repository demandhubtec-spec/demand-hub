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

const accentDelta: Record<Accent, string> = {
  primary: "text-muted",
  positive: "text-positive",
  attention: "text-attention",
  negative: "text-negative",
};

export function KpiCard({ label, value, delta, deltaClass = "up", accent = "primary", index = 0, icon: Icon }: KpiCardProps) {
  // Rótulo em cima, número e uma linha de apoio: sem borda colorida nem ícone (base visual de 14/11)
  void index;
  void Icon;
  return (
    <Card className="flex flex-col gap-1 px-5 py-[18px]">
      <div className="text-[13px] leading-snug text-muted">{label}</div>
      <div className="brand-num text-[28px]">{value}</div>
      {delta && <div className={cn("text-[12px]", deltaClass === "warn" ? "text-attention" : accentDelta[accent])}>{delta}</div>}
    </Card>
  );
}
