interface BarChartProps {
  data: { label: string; value: number }[];
  formatTooltip?: (value: number) => string;
}

// Gráfico de barras em CSS puro, igual ao protótipo (barra final destacada em --primary).
export function BarChart({ data, formatTooltip }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex h-[140px] items-end gap-2.5">
      {data.map((d, i) => {
        const isLast = i === data.length - 1;
        const heightPct = Math.max((d.value / max) * 100, 4);
        return (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end">
            <div
              className="w-full max-w-[30px] origin-bottom animate-barGrow rounded-t-[4px]"
              style={{
                height: `${heightPct}%`,
                animationDelay: `${0.03 + i * 0.05}s`,
                background: isLast ? "var(--primary)" : "var(--primary-tint)",
                boxShadow: isLast ? "0 0 14px rgba(178,111,214,.5)" : undefined,
              }}
              title={formatTooltip ? formatTooltip(d.value) : String(d.value)}
            />
            <div className="mt-2 font-mono text-[10px] text-muted">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

interface DualBarChartProps {
  data: { label: string; a: number; b: number }[];
}

// Gráfico de barras pareadas (entradas x saídas), como .barchart2 do protótipo.
export function DualBarChart({ data }: DualBarChartProps) {
  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);
  return (
    <div className="flex h-[150px] items-end gap-4">
      {data.map((d, i) => (
        <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end">
          <div className="flex h-full w-full items-end justify-center gap-[3px]">
            <div
              className="w-[14px] origin-bottom animate-barGrow rounded-t-[3px] bg-positive"
              style={{ height: `${Math.max((d.a / max) * 100, 4)}%`, animationDelay: `${0.03 + i * 0.05}s` }}
            />
            <div
              className="w-[14px] origin-bottom animate-barGrow rounded-t-[3px] bg-negative-tint"
              style={{
                height: `${Math.max((d.b / max) * 100, 4)}%`,
                animationDelay: `${0.03 + i * 0.05}s`,
                background: "var(--negative-tint)",
              }}
            />
          </div>
          <div className="mt-2 font-mono text-[10px] text-muted">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
