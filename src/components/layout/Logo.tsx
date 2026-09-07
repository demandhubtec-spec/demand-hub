export function LogoMark({ size = 36 }: { size?: number }) {
  const ringOffset = Math.max(4, Math.round(size * 0.14));
  const ringSize = size + ringOffset * 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* Halo animado girando ao redor da marca (não mais um "spinner" dentro do ícone). */}
      <div
        className="absolute rounded-[12px] opacity-70 blur-[3px] animate-logospin"
        style={{
          width: ringSize,
          height: ringSize,
          left: -ringOffset,
          top: -ringOffset,
          background:
            "conic-gradient(from 0deg, transparent 0%, var(--primary-bright) 22%, transparent 46%, transparent 100%)",
        }}
      />
      <div
        className="relative flex h-full w-full items-center justify-center rounded-[9px] bg-primary shadow-[0_0_14px_rgba(178,111,214,.4)] transition-all duration-300 group-hover:shadow-[0_0_24px_rgba(178,111,214,.75)] group-hover:scale-105"
      >
        <svg viewBox="0 0 48 48" fill="none" className="h-[60%] w-[60%]">
          <circle cx="24" cy="24" r="15" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" opacity="0.9" />
          <path
            d="M12 17 L23 24 L12 31 Z"
            stroke="#fff"
            strokeWidth="4.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
