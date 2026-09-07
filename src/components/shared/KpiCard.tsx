import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaClass?: "up" | "warn";
  accent?: "primary" | "positive" | "attention";
  index?: number;
}

const accentBorder: Record<string, string> = {
  primary: "border-l-primary",
  positive: "border-l-positive",
  attention: "border-l-attention",
};

export function KpiCard({ label, value, delta, deltaClass = "up", accent = "primary", index = 0 }: KpiCardProps) {
  return (
    <Card
      className={cn("animate-kpiIn border-l-[3px] px-[18px] pb-4 pt-[18px]", accentBorder[accent])}
      style={{ animationDelay: `${0.04 + index * 0.07}s` }}
    >
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1.5 font-display text-[27px] font-bold">{value}</div>
      {delta && (
        <div
          className={cn(
            "mt-1.5 font-mono text-[11.5px] font-semibold",
            deltaClass === "up" ? "text-positive" : "text-attention",
          )}
        >
          {delta}
        </div>
      )}
    </Card>
  );
}
