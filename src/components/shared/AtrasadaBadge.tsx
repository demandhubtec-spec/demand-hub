import { AlertTriangle } from "lucide-react";
import { diaMes } from "@/lib/prazo";

/** Selo vermelho de prazo vencido. */
export function AtrasadaBadge({ prazo }: { prazo?: string | null }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-negative-tint px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-wide text-negative">
      <AlertTriangle className="h-3 w-3" />
      Atrasada{prazo ? ` · ${diaMes(prazo)}` : ""}
    </span>
  );
}
