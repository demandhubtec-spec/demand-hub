import type { Config } from "tailwindcss";

export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        primary: {
          DEFAULT: "var(--primary)",
          bright: "var(--primary-bright)",
          tint: "var(--primary-tint)",
        },
        positive: {
          DEFAULT: "var(--positive)",
          tint: "var(--positive-tint)",
        },
        attention: {
          DEFAULT: "var(--attention)",
          tint: "var(--attention-tint)",
        },
        negative: {
          DEFAULT: "var(--negative)",
          tint: "var(--negative-tint)",
        },
        sidebar: {
          bg: "var(--sb-bg)",
          bg2: "var(--sb-bg-2)",
          text: "var(--sb-text)",
          "text-active": "var(--sb-text-active)",
          border: "var(--sb-border)",
        },
      },
      borderRadius: {
        DEFAULT: "9px",
      },
      keyframes: {
        gridshift: {
          from: { backgroundPosition: "0 0, 0 0" },
          to: { backgroundPosition: "130px 130px, 130px 130px" },
        },
        logospin: {
          to: { transform: "rotate(360deg)" },
        },
        fade: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        kpiIn: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        barGrow: {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(226,88,90,.55)" },
          "50%": { boxShadow: "0 0 0 5px rgba(226,88,90,0)" },
        },
      },
      animation: {
        gridshift: "gridshift 40s linear infinite",
        logospin: "logospin 7s linear infinite",
        fade: "fade .25s ease",
        kpiIn: "kpiIn .5s ease backwards",
        barGrow: "barGrow .6s cubic-bezier(.2,.8,.3,1) backwards",
        pulseGlow: "pulseGlow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
