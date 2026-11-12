/**
 * Emblema da marca criada para quem não tem logo (ver src/lib/identidade-nicho.ts).
 * Médico e profissional: monograma com as iniciais num círculo com anel fino. Empresa: símbolo do nicho
 * num quadrado arredondado. Cores do nicho, em degradê.
 */
import type { CoresMarca } from "@/src/lib/site-marca.ts";
import type { MarcaCriada, Simbolo } from "@/src/lib/identidade-nicho.ts";

const TRACOS: Record<Simbolo, React.ReactNode> = {
  molecula: (
    <>
      <path d="M12 3.5l7 4v9l-7 4-7-4v-9z" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 3.5v5.9M19 16.5l-4.8-3M5 16.5l4.8-3" />
    </>
  ),
  dente: <path d="M7.2 3.5C4.8 3.5 3.5 5.4 3.5 7.7c0 2.8 1.4 4.3 1.9 6.6.5 2.4.9 6.2 2.4 6.2 1.4 0 1.7-2.8 2.3-4.7.4-1 .8-1.4 1.9-1.4s1.5.4 1.9 1.4c.6 1.9.9 4.7 2.3 4.7 1.5 0 1.9-3.8 2.4-6.2.5-2.3 1.9-3.8 1.9-6.6 0-2.3-1.3-4.2-3.7-4.2-1.9 0-2.9.9-4.8.9s-2.9-.9-4.8-.9z" />,
  casa: (
    <>
      <path d="M3.5 11L12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  pata: (
    <>
      <ellipse cx="7" cy="9" rx="1.7" ry="2.2" />
      <ellipse cx="10.5" cy="5.8" rx="1.7" ry="2.2" />
      <ellipse cx="14.5" cy="5.8" rx="1.7" ry="2.2" />
      <ellipse cx="18" cy="9" rx="1.7" ry="2.2" />
      <path d="M12.5 11c-2.6 0-5.5 3.6-5.5 6 0 1.6 1.2 2.5 2.6 2.5 1.2 0 1.8-.7 2.9-.7s1.7.7 2.9.7c1.4 0 2.6-.9 2.6-2.5 0-2.4-2.9-6-5.5-6z" />
    </>
  ),
  coracao: <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0112 7.3a4.2 4.2 0 017.5 2.5C19.5 15.4 12 20 12 20z" />,
  folha: (
    <>
      <path d="M5 19.5C5 11 10.5 4.5 19.5 4.5c0 9-6 15-14.5 15z" />
      <path d="M5 19.5l8.5-8.5" />
    </>
  ),
  olho: (
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  cruz: <path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z" />,
  balanca: (
    <>
      <path d="M12 3.5v17M7.5 20.5h9M4.5 7h15" />
      <path d="M6.5 7l-3 6.2a3 3 0 006 0zM17.5 7l-3 6.2a3 3 0 006 0z" />
    </>
  ),
  brilho: (
    <>
      <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  ),
  laco: (
    <>
      <path d="M12 3.5c-2 0-3.4 1.4-3.4 3.4 0 2.2 1.6 4.7 3.4 7 1.8-2.3 3.4-4.8 3.4-7 0-2-1.4-3.4-3.4-3.4z" />
      <path d="M10.3 12.3L6.5 20.5M13.7 12.3l3.8 8.2" />
    </>
  ),
  mente: (
    <>
      <path d="M8.5 20.5v-3.2C6.4 16 5 13.8 5 11.2 5 7.2 8.1 4 12 4s7 3 7 6.6l1.6 3-1.6.7V17a1.6 1.6 0 01-1.6 1.6H15v1.9" />
      <path d="M12 8.5c1.6 0 2.5 1.1 2.5 2.3 0 1.4-1.2 2.2-2.5 2.2" />
    </>
  ),
  osso: (
    <>
      <path d="M7.5 7.5l9 9" />
      <circle cx="5.6" cy="7.9" r="2" />
      <circle cx="7.9" cy="5.6" r="2" />
      <circle cx="16.1" cy="18.4" r="2" />
      <circle cx="18.4" cy="16.1" r="2" />
    </>
  ),
  bebe: (
    <>
      <circle cx="12" cy="12.5" r="7.5" />
      <path d="M9.3 14.6c1.5 1.4 3.9 1.4 5.4 0M12 5c-1.3 0-1.8-1.6-.6-2.1" />
      <circle cx="9.5" cy="11" r=".5" />
      <circle cx="14.5" cy="11" r=".5" />
    </>
  ),
};

export function EmblemaMarca({ m, c, tamanho = 44, id = "e" }: { m: MarcaCriada; c: CoresMarca; tamanho?: number; id?: string }) {
  const g = `grad-${id}`;
  if (m.monograma) {
    const fonte = m.sigla.length > 1 ? 15 : 19;
    return (
      <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" role="img" aria-label={m.nome} style={{ flex: "none", display: "block" }}>
        <defs>
          <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={c.cor} />
            <stop offset="1" stopColor={c.escura} />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="23" fill={`url(#${g})`} />
        <circle cx="24" cy="24" r="19" fill="none" stroke={c.cor2 ?? "#fff"} strokeWidth="1" opacity=".9" />
        <text x="24" y="24" dy=".36em" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize={fonte} fontWeight="600" letterSpacing="1" fill="#fff">
          {m.sigla}
        </text>
      </svg>
    );
  }
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" role="img" aria-label={m.nome} style={{ flex: "none", display: "block" }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.cor} />
          <stop offset="1" stopColor={c.escura} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="14" fill={`url(#${g})`} />
      <circle cx="38" cy="10" r="3" fill={c.cor2 ?? "#fff"} />
      <g transform="translate(12 12)" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {TRACOS[m.simbolo]}
      </g>
    </svg>
  );
}

/** Emblema + nome + especialidade (a "logo" completa). `clara`: texto branco, para fundo escuro. */
export function MarcaCompleta({ m, c, tamanho = 44, clara = false, id }: { m: MarcaCriada; c: CoresMarca; tamanho?: number; clara?: boolean; id?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(tamanho * 0.27), minWidth: 0 }}>
      <EmblemaMarca m={m} c={c} tamanho={tamanho} id={id} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 }}>
        <span style={{ fontWeight: 800, fontSize: Math.round(tamanho * 0.38), color: clara ? "#fff" : c.escura, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.nome}</span>
        {m.sub && (
          <span style={{ fontWeight: 600, fontSize: Math.max(9, Math.round(tamanho * 0.22)), letterSpacing: ".08em", textTransform: "uppercase", color: clara ? c.cor2 ?? "#fff" : c.cor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
            {m.sub}
          </span>
        )}
      </div>
    </div>
  );
}
