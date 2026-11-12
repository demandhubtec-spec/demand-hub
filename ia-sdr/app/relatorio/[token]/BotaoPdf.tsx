"use client";

/** Baixa o PDF que o cliente recebe; se ainda não foi gerado, salva pela impressão do navegador. */
export function BotaoPdf({ pdf }: { pdf?: string | null }) {
  return (
    <button
      onClick={() => (pdf ? window.open(pdf, "_blank") : window.print())}
      style={{ marginLeft: 8, background: "transparent", border: "1px solid #3a2a72", color: "#cfc6f5", borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}
    >
      Baixar PDF
    </button>
  );
}
