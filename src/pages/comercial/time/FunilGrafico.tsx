import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPct, type LinhaFunil } from "./indicadores-calc";

/**
 * Funil dos Indicadores (21/11/2026, layout limpo): uma linha por etapa, na ordem do Kanban.
 * Barra = quantos leads chegaram na etapa (proporcional ao topo). Conversão = % da etapa anterior.
 * Meta = % esperada da etapa anterior: verde bateu, laranja abaixo, vermelho é o gargalo (a mais longe da meta).
 */
export function FunilGrafico({ linhas, apagado = false }: { linhas: LinhaFunil[]; apagado?: boolean }) {
  const topo = linhas[0]?.valor || 0;
  const n = linhas.length;
  return (
    <div className="text-[13px]">
      <div className="grid grid-cols-[minmax(150px,1.1fr)_minmax(120px,2fr)_72px_92px] items-center gap-3 border-b border-border pb-1.5 text-[11px] uppercase tracking-wide text-muted/80">
        <span>Etapa</span>
        <span>Leads</span>
        <span className="text-right">Conversão</span>
        <span className="text-right">Meta</span>
      </div>
      {linhas.map((l, i) => {
        const venda = i === n - 1;
        const pct = topo ? Math.max(l.valor > 0 ? 2 : 0, (l.valor / topo) * 100) : 0;
        const cor = venda ? "bg-positive" : l.estado === "gargalo" ? "bg-negative" : l.estado === "abaixo" ? "bg-attention" : "bg-primary";
        return (
          <div key={l.key} className="grid grid-cols-[minmax(150px,1.1fr)_minmax(120px,2fr)_72px_92px] items-center gap-3 border-b border-border/50 py-2">
            <span className={cn("flex items-center gap-1", venda ? "font-semibold text-positive" : l.estado === "gargalo" ? "font-semibold text-negative" : "text-ink")}>
              {l.label}
              {!apagado && <Ajuda linha={l} />}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                {!apagado && <span className={cn("block h-full rounded-full", cor)} style={{ width: `${pct}%` }} />}
              </span>
              <b className="w-9 text-right tabular-nums font-semibold">{apagado ? "–" : l.valor}</b>
            </span>
            <span className={cn("text-right tabular-nums", l.estado === "sem_base" ? "text-muted" : "text-ink")}>
              {apagado || i === 0 ? <span className="text-muted">–</span> : fmtPct(l.conversao)}
            </span>
            <span className="text-right">
              {apagado || i === 0 || l.meta == null ? (
                <span className="text-muted">–</span>
              ) : l.estado === "gargalo" ? (
                <span className="rounded-[6px] bg-negative-tint px-1.5 py-0.5 text-[12px] font-medium text-negative">gargalo · {l.meta}%</span>
              ) : (
                <span
                  className={cn(
                    "rounded-[6px] px-1.5 py-0.5 text-[12px]",
                    l.estado === "abaixo" ? "bg-attention-tint text-attention" : l.estado === "ok" ? "bg-positive-tint text-positive" : "text-muted",
                  )}
                >
                  {l.meta}%
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** "?" ao lado da etapa: o que ela conta e de onde vem a taxa. */
function Ajuda({ linha: l }: { linha: LinhaFunil }) {
  const taxa =
    l.anterior != null && l.labelAnterior
      ? `${l.valor} de ${l.anterior} que chegaram em "${l.labelAnterior}" (${fmtPct(l.conversao)}).${l.meta != null ? ` Meta: ${l.meta}% da etapa anterior.` : ""}`
      : `${l.valor} leads no topo do funil.`;
  const texto = [l.ajuda, taxa].filter(Boolean).join(" ");
  return (
    <span className="group relative inline-flex">
      <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted/70" aria-label={texto} />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-5 z-30 hidden w-[260px] rounded-[8px] border border-border bg-surface p-2.5 text-[12px] font-normal leading-snug text-ink shadow-xl group-hover:block"
      >
        {texto}
      </span>
    </span>
  );
}
