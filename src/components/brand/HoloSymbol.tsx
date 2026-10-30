import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Símbolo DemandIA em modo "holograma".
 * A geometria do D e da estrela é a mesma do arquivo oficial (public/brand/demandia-simbolo.svg):
 * a animação só desenha o traço, acende a estrela no centro e projeta luz ao redor.
 * O estado final é o símbolo oficial, sem distorcer, girar ou trocar cores.
 *
 * Conceito do manual: "A demanda chega aberta. A inteligência acende no centro."
 */
export function HoloSymbol({ size = 360, className }: { size?: number; className?: string }) {
  const id = React.useId().replace(/:/g, "");
  const D = "M22 86 V14 H46 A36 36 0 0 1 55.3 84.8";
  const STAR = "47,31 49.6,47.4 62,50 49.6,52.6 47,69 44.4,52.6 32,50 44.4,47.4";

  return (
    <div className={cn("holo relative select-none", className)} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="-40 -40 180 200" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="20" y1="90" x2="80" y2="12">
            <stop offset="0" stopColor="#2A0C8F" />
            <stop offset="0.3" stopColor="#5A28E0" />
            <stop offset="0.6" stopColor="#8B5BFF" />
            <stop offset="0.85" stopColor="#C9B0FF" />
            <stop offset="1" stopColor="#F3EDFF" />
          </linearGradient>
          <radialGradient id={`h${id}`} cx="47" cy="50" r="24" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#D9C9FF" stopOpacity="0.7" />
            <stop offset="1" stopColor="#6E3AFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`f${id}`} cx="50" cy="128" r="46" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#A47BFF" stopOpacity="0.55" />
            <stop offset="1" stopColor="#6E3AFF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`b${id}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#A47BFF" stopOpacity="0.22" />
            <stop offset="1" stopColor="#6E3AFF" stopOpacity="0" />
          </linearGradient>
          <filter id={`bl${id}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
          <filter id={`bl2${id}`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          {/* Linhas de varredura do holograma, aplicadas só dentro do traço do D */}
          <pattern id={`p${id}`} width="4" height="3" patternUnits="userSpaceOnUse">
            <rect width="4" height="1" fill="#fff" />
          </pattern>
          <mask id={`m${id}`}>
            <path d={D} fill="none" stroke="#fff" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
          </mask>
          <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Projeção: base de luz e feixe subindo até o símbolo */}
        <g className="holo-base">
          <polygon points="4,128 96,128 70,46 30,46" fill={`url(#b${id})`} opacity="0.7" />
          <ellipse cx="50" cy="128" rx="44" ry="9" fill={`url(#f${id})`} />
          <ellipse cx="50" cy="128" rx="30" ry="5" fill="none" stroke="#A47BFF" strokeOpacity="0.55" strokeWidth="0.6" />
          <ellipse cx="50" cy="128" rx="40" ry="7.5" fill="none" stroke="#A47BFF" strokeOpacity="0.25" strokeWidth="0.5" strokeDasharray="2 3" className="holo-spin-slow" style={{ transformOrigin: "50px 128px" }} />
        </g>

        {/* Órbitas de dados */}
        <g style={{ transformOrigin: "47px 50px" }}>
          <circle cx="47" cy="50" r="58" fill="none" stroke="#A47BFF" strokeOpacity="0.18" strokeWidth="0.5" strokeDasharray="1 4" className="holo-spin" style={{ transformOrigin: "47px 50px" }} />
          <circle cx="47" cy="50" r="68" fill="none" stroke="#6E3AFF" strokeOpacity="0.28" strokeWidth="0.7" strokeDasharray="40 14 4 14" className="holo-spin-rev" style={{ transformOrigin: "47px 50px" }} />
          <g className="holo-spin" style={{ transformOrigin: "47px 50px" }}>
            <circle cx="47" cy="-8" r="1.6" fill="#C9B0FF" />
          </g>
          <g className="holo-spin-rev" style={{ transformOrigin: "47px 50px" }}>
            <circle cx="115" cy="50" r="1.2" fill="#A47BFF" />
          </g>
        </g>

        {/* Símbolo oficial */}
        <g className="holo-body">
          <path d={D} fill="none" stroke="#7B4BFF" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" filter={`url(#bl${id})`} opacity="0.55" className="holo-draw-glow" pathLength={1} />
          <path d={D} fill="none" stroke={`url(#g${id})`} strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" className="holo-draw" pathLength={1} />
          <path d={D} fill="none" stroke="#FFFFFF" strokeOpacity="0.28" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="holo-draw" pathLength={1} />
          <g mask={`url(#m${id})`} className="holo-lines">
            <rect x="0" y="0" width="100" height="100" fill={`url(#p${id})`} opacity="0.13" />
            <rect x="0" y="-30" width="100" height="26" fill={`url(#s${id})`} opacity="0.5" className="holo-sweep" />
          </g>
          <circle cx="47" cy="50" r="24" fill={`url(#h${id})`} className="holo-core" />
          <circle cx="47" cy="50" r="14" fill="#C9B0FF" filter={`url(#bl2${id})`} className="holo-flash" />
          <polygon points={STAR} fill="#FFFFFF" className="holo-star" style={{ transformOrigin: "47px 50px" }} />
        </g>
      </svg>
    </div>
  );
}

/** Estrela de 4 pontas usada como "brilho" solto na grade (elemento gráfico do manual). */
export function Sparkle({ size = 12, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 30 38" width={size} height={size * 1.27} className={className} style={style} aria-hidden>
      <polygon points="15,0 17.6,16.4 30,19 17.6,21.6 15,38 12.4,21.6 0,19 12.4,16.4" fill="currentColor" />
    </svg>
  );
}
