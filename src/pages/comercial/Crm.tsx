import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { kanbanCrm } from "@/data/seed";

export default function Crm() {
  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">CRM — Funil comercial</div>
        <div className="mt-1 text-[13px] text-muted">Oportunidades em andamento na DemandHub.</div>
      </div>
      <div className="grid grid-cols-1 items-start gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {kanbanCrm.map((col) => (
          <div key={col.titulo}>
            <div className="mb-3 flex items-center justify-between px-0.5">
              <span className="text-[12.5px] font-semibold">{col.titulo}</span>
              <span className="rounded-full bg-surface-2 px-[9px] py-0.5 font-mono text-[11px] text-muted">
                {col.cards.length}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {col.cards.length === 0 ? (
                <EmptyState>Nenhum lead no momento</EmptyState>
              ) : (
                col.cards.map((c) => (
                  <Card key={c.nome} className="p-[15px] px-[14px]">
                    <div className="mb-2 text-[13px] font-semibold leading-snug">{c.nome}</div>
                    <div className="mb-0.5 text-[11px] text-muted">{c.meta}</div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="rounded-[5px] bg-surface-2 px-2 py-[3px] font-mono text-[11px] text-muted">
                        {c.valor}
                      </span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
