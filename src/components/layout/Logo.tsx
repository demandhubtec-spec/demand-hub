export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[9px] bg-primary shadow-[0_0_14px_rgba(178,111,214,.4)] transition-all duration-300 group-hover:shadow-[0_0_24px_rgba(178,111,214,.75)] group-hover:scale-105"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 48 48" fill="none" className="h-[60%] w-[60%] overflow-visible">
        <circle
          className="origin-center animate-logospin"
          style={{ transformBox: "fill-box" }}
          cx="24"
          cy="24"
          r="15"
          stroke="#fff"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeDasharray="70.69 23.56"
          transform="rotate(-135 24 24)"
        />
        <path
          d="M12 17 L23 24 L12 31 Z"
          stroke="#fff"
          strokeWidth="4.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
