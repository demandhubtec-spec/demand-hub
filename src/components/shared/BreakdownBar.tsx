interface BreakdownBarProps {
  items: { label: string; value: number; total: number }[];
}

export function BreakdownBar({ items }: BreakdownBarProps) {
  return (
    <div className="flex flex-col gap-3.5">
      {items.map((item) => {
        const pct = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
        return (
          <div key={item.label}>
            <div className="mb-[5px] flex justify-between text-xs">
              <span className="font-medium text-ink">{item.label}</span>
              <span className="font-mono text-muted">{item.value}</span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-[5px] bg-surface-2">
              <div className="h-full rounded-[5px] bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
