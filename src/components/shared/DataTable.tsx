import { type ReactNode } from "react";

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[--radius] border border-border bg-surface">
      <table className="min-w-[640px] w-full border-collapse">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap border-b border-border bg-surface-2 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </th>
  );
}

export function Td({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) {
  return (
    <td className={`border-b border-border px-4 py-[13px] text-[13px] last:border-b-0 ${wrap ? "whitespace-normal" : "whitespace-nowrap"}`}>
      {children}
    </td>
  );
}
