export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[--radius] border border-dashed border-border p-10 text-center text-[13px] text-muted">
      {children}
    </div>
  );
}
