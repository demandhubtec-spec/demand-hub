import * as React from "react";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/KpiCard";
import { Switch } from "@/components/ui/switch";

const initialToggles = [
  {
    id: "auto-resposta",
    title: "Responder automaticamente novos leads",
    sub: "Primeira resposta em até 1 minuto",
    checked: true,
  },
  {
    id: "qualificar",
    title: "Qualificar antes de encaminhar",
    sub: "Só passa pro comercial leads qualificados",
    checked: true,
  },
  {
    id: "followup",
    title: "Follow-up automático em 48h",
    sub: "Reengaja leads que pararam de responder",
    checked: false,
  },
];

export default function Sdr() {
  const [toggles, setToggles] = React.useState(initialToggles);

  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">SDR IA</div>
        <div className="mt-1 text-[13px] text-muted">Assistente de pré-vendas automatizado.</div>
      </div>

      <div className="mb-[22px] grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Status" value="Ativo" delta="Rodando no WhatsApp" deltaClass="up" index={0} />
        <KpiCard label="Leads atendidos (mês)" value="47" delta="+12 vs. mês anterior" deltaClass="up" index={1} />
        <KpiCard label="Taxa de resposta" value="81%" delta="acima da meta" deltaClass="up" index={2} />
      </div>

      <Card className="p-5 px-[22px]">
        <div className="text-sm font-semibold">Configurações do agente</div>
        <div className="mb-2 mt-0.5 text-[11.5px] text-muted">Ligue ou desligue comportamentos do SDR IA</div>
        {toggles.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-b-0">
            <div>
              <div className="text-[13.5px] font-semibold">{t.title}</div>
              <div className="mt-0.5 text-[11.5px] text-muted">{t.sub}</div>
            </div>
            <Switch
              checked={t.checked}
              onCheckedChange={(v) =>
                setToggles((prev) => prev.map((x) => (x.id === t.id ? { ...x, checked: v } : x)))
              }
            />
          </div>
        ))}
      </Card>
    </section>
  );
}
