import { cn } from "@/lib/utils";

/** Alternador de visões dentro de uma aba (ex.: "Prospecção ativa" | "Inbound"). Mesmo visual em todo o portal. */
export function Segmented<T extends string>({
  value,
  onChange,
  opcoes,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  opcoes: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("mb-4 inline-flex rounded-full border border-border bg-surface p-1", className)} role="tablist">
      {opcoes.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
            value === o.value ? "bg-primary text-white" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
