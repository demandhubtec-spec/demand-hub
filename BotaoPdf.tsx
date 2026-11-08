"use client";

/** Salva o relatório em PDF pela impressão do navegador. */
export function BotaoPdf() {
  return (
    <button
      onClick={() => window.print()}
      style={{ marginLeft: 8, background: "transparent", border: "1px solid #3a2a72", color: "#cfc6f5", borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}
    >
      Baixar PDF
    </button>
  );
}
