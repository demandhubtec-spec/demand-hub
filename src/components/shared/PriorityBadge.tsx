import { cn } from "@/lib/utils";
import type { AtividadePrioridade } from "@/lib/types";

const labels: Record<AtividadePrioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

const classes: Record<AtividadePrioridade, string> = {
  baixa: "bg-surface-2 text-muted",
  media: "bg-primary-tint text-primary-bright",
  alta: "bg-attention-tint text-attention",
  urgente: "bg-negative-tint text-negative",
};

export function PriorityBadge({ prioridade }: { prioridade: AtividadePrioridade }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-wide",
        classes[prioridade],
      )}
    >
      {labels[prioridade]}
    </span>
  );
}
