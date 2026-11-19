import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPct, type LinhaFunil } from "./indicadores-calc";

/**
 * Funil em formato de funil (de cima para baixo), com a conversão de cada etapa ao lado da meta.
 * Abaixo da meta: laranja. Etapa mais longe da meta: faixa vermelha e laranja com a marca GARGALO. Venda: verde.
 */
export function FunilGrafico({ linhas, apagado = false }: { linhas: LinhaFunil[]; apagado?: boolean }) {
  const W = 300;
  const H = 34;
  const GAP = 4;
  const n = linhas.length;
  const topo = linhas[0]?.valor || 0;
  const larguras = linhas.map((l, i) =>
    apagado || !topo ? W - ((W - 70) * i) / Math.max(1, n - 1) : 60 + (W - 60) * Math.pow(l.valor / topo, 0.55),
  );
  const altura = n * (H + GAP);
  return (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
      <div className="min-w-[300px] flex-1">
        {!apagado && (
          <div className="mb-1 flex justify-end gap-3 text-[11px] uppercase tracking-wide text-muted/70">
            <span>realizado · taxa</span>
            <span className="min-w-[92px] text-right">meta · taxa</span>
          </div>
        )}
        {linhas.map((l, i) => {
          const ultima = i === n - 1;
          return (
            <div
              key={l.key}
              className="flex items-center justify-between gap-2 border-b border-dashed border-border/60"
              style={{ height: H, marginBottom: GAP }}
            >
              <span
                className={cn(
                  "flex items-center gap-1 text-[13px]",
                  apagado ? "text-muted" : ultima ? "font-semibold text-positive" : l.estado === "gargalo" ? "font-semibold text-negative" : "text-ink/90",
                )}
              >
                {l.label}
                {!apagado && <Ajuda linha={l} />}
              </span>
              {!apagado && (
                <span className="flex items-center gap-3 tabular-nums text-[12px]">
                  {i === 0 ? (
                    <span className="text-muted/70">topo · {l.valor}</span>
                  ) : (
                    <>
                      <span className="text-right">
                        <b
                          className={cn(
                            "font-semibold",
                            l.estado === "gargalo" ? "text-negative" : l.estado === "abaixo" ? "text-attention" : l.estado === "sem_base" ? "text-muted" : "text-ink",
                          )}
                        >
                          {l.valor}
                        </b>
                        <span className="text-muted"> · {fmtPct(l.conversao)}</span>
                      </span>
                      {l.meta != null && (
                        <span className="min-w-[92px] text-right text-muted">
                          meta <b className="font-semibold text-ink/80">{l.metaNumero ?? "-"}</b> · {l.meta}%
                        </span>
                      )}
                      {l.estado === "gargalo" && (
                        <span className="rounded-[6px] bg-negative-tint px-1.5 py-0.5 text-[12px] text-negative">gargalo</span>
                      )}
                    </>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <svg width={W} height={altura} viewBox={`0 0 ${W} ${altura}`} className="shrink-0" aria-hidden>
        <defs>
          <linearGradient id="fg-roxo" x1="0" x2="1">
            <stop offset="0" stopColor="#6e3aff" />
            <stop offset="1" stopColor="#a47bff" />
          </linearGradient>
          <linearGradient id="fg-verde" x1="0" x2="1">
            <stop offset="0" stopColor="#1f9e5f" />
            <stop offset="1" stopColor="#2fd27f" />
          </linearGradient>
          <linearGradient id="fg-gargalo" x1="0" x2="1">
            <stop offset="0" stopColor="#ff6b81" />
            <stop offset="1" stopColor="#ffb35c" />
          </linearGradient>
        </defs>
        {linhas.map((l, i) => {
          const w1 = larguras[i];
          const w2 = i + 1 < n ? larguras[i + 1] : larguras[i] * 0.92;
          const y = i * (H + GAP);
          const cx = W / 2;
          const fill = apagado
            ? "rgba(164,123,255,.10)"
            : l.estado === "gargalo"
              ? "url(#fg-gargalo)"
              : i === n - 1
                ? "url(#fg-verde)"
                : "url(#fg-roxo)";
          return (
            <g key={l.key}>
              <polygon points={`${cx - w1 / 2},${y} ${cx + w1 / 2},${y} ${cx + w2 / 2},${y + H} ${cx - w2 / 2},${y + H}`} fill={fill} />
              <text x={cx} y={y + H / 2 + 6} textAnchor="middle" fontWeight={600} fontSize={16} fill="#fff">
                {apagado ? "–" : l.valor}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** "?" ao lado da etapa: o que ela conta e de onde vem a taxa (18/11, Kelvin). */
function Ajuda({ linha: l }: { linha: LinhaFunil }) {
  const taxa =
    l.anterior != null && l.labelAnterior
      ? `Realizado: ${l.valor} de ${l.anterior} que chegaram em "${l.labelAnterior}" (${fmtPct(l.conversao)}).${l.meta != null ? ` Meta: ${l.metaNumero ?? "-"} (${l.meta}% da meta da etapa anterior, contando desde o topo da lista).` : ""}`
      : `${l.valor} no topo do funil.`;
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
