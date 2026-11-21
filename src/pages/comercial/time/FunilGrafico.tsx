import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPct, type LinhaFunil } from "./indicadores-calc";

/**
 * Funil dos Indicadores (21/11/2026): uma linha por etapa, na ordem do Kanban, com REALIZADO e META lado a lado,
 * cada um em número (grande) e em % (pequeno). A meta em número é a meta % sobre o realizado da etapa anterior.
 * semEntrada: nas listas o funil começa em "Mensagem ou ligação" (a Entrada fica só no Kanban); a meta dessa
 * primeira linha é a lista inteira abordada.
 */
export function FunilGrafico({ linhas, apagado = false, semEntrada = false }: { linhas: LinhaFunil[]; apagado?: boolean; semEntrada?: boolean }) {
  const visiveis = semEntrada ? linhas.slice(1) : linhas;
  const topo = visiveis[0]?.valor || 0;
  const n = visiveis.length;
  const grade = "grid grid-cols-[minmax(140px,1.2fr)_minmax(70px,1fr)_96px_96px_minmax(96px,auto)] items-center gap-3";
  return (
    <div className="text-[13px]">
      <div className={cn(grade, "border-b border-border pb-1.5 text-[11px] uppercase tracking-wide text-muted/80")}>
        <span>Etapa</span>
        <span />
        <span className="text-right">Realizado</span>
        <span className="text-right">Meta</span>
        <span className="text-right">Resultado</span>
      </div>
      {visiveis.map((l, i) => {
        const venda = i === n - 1;
        const primeira = i === 0 && !semEntrada;
        const pct = topo ? Math.max(l.valor > 0 ? 3 : 0, (l.valor / topo) * 100) : 0;
        const temMeta = !primeira && l.metaNumero != null;
        const dif = temMeta ? l.valor - (l.metaNumero ?? 0) : 0;
        const cor = venda ? "bg-positive" : l.estado === "gargalo" ? "bg-negative" : l.estado === "abaixo" ? "bg-attention" : "bg-primary";
        return (
          <div key={l.key} className={cn(grade, "border-b border-border/50 py-2.5")}>
            <span className={cn("flex items-center gap-1", venda ? "font-semibold text-positive" : l.estado === "gargalo" ? "font-semibold text-negative" : "text-ink")}>
              {l.label}
              {!apagado && <Ajuda linha={l} primeira={i === 0 && semEntrada} />}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-2">
              {!apagado && <span className={cn("block h-full rounded-full", cor)} style={{ width: `${pct}%` }} />}
            </span>
            <span className="text-right tabular-nums">
              <b className="text-[16px] font-semibold">{apagado ? "–" : l.valor}</b>
              {!apagado && !primeira && <span className="ml-1.5 text-[12px] text-muted">{fmtPct(l.conversao)}</span>}
            </span>
            <span className="text-right tabular-nums text-muted">
              {apagado || !temMeta ? (
                "–"
              ) : (
                <>
                  <b className="text-[16px] font-semibold text-ink/80">{l.metaNumero}</b>
                  <span className="ml-1.5 text-[12px]">{l.meta}%</span>
                </>
              )}
            </span>
            <span className="text-right">
              {apagado || !temMeta ? (
                <span className="text-muted">–</span>
              ) : l.estado === "sem_base" ? (
                <span className="text-[12px] text-muted">pouca base</span>
              ) : dif >= 0 ? (
                <span className="rounded-[6px] bg-positive-tint px-1.5 py-0.5 text-[12px] font-medium text-positive">bateu{dif > 0 ? ` +${dif}` : ""}</span>
              ) : (
                <span
                  className={cn(
                    "rounded-[6px] px-1.5 py-0.5 text-[12px] font-medium",
                    l.estado === "gargalo" ? "bg-negative-tint text-negative" : "bg-attention-tint text-attention",
                  )}
                >
                  {l.estado === "gargalo" ? "gargalo · " : ""}faltam {-dif}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** "?" ao lado da etapa: o que ela conta e como saem o realizado e a meta. */
function Ajuda({ linha: l, primeira }: { linha: LinhaFunil; primeira: boolean }) {
  const taxa =
    l.anterior != null && l.labelAnterior
      ? primeira
        ? `${l.valor} de ${l.anterior} leads da lista já foram abordados (${fmtPct(l.conversao)}).${l.metaNumero != null ? ` Meta: abordar ${l.metaNumero} (${l.meta}% da lista).` : ""}`
        : `Realizado: ${l.valor} de ${l.anterior} que chegaram em "${l.labelAnterior}" (${fmtPct(l.conversao)}).${l.metaNumero != null ? ` Meta: ${l.metaNumero} (${l.meta}% de ${l.anterior}).` : ""}`
      : `${l.valor} leads no topo do funil.`;
  const texto = [l.ajuda, taxa].filter(Boolean).join(" ");
  return (
    <span className="group relative inline-flex">
      <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted/70" aria-label={texto} />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-5 z-30 hidden w-[270px] rounded-[8px] border border-border bg-surface p-2.5 text-[12px] font-normal leading-snug text-ink shadow-xl group-hover:block"
      >
        {texto}
      </span>
    </span>
  );
}
