import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/KpiCard";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { deptData } from "@/data/seed";
import type { Departamento } from "@/lib/types";
import { useAtividadesDept } from "@/hooks/useDepartamento";

export default function DepartmentVisao() {
  const { dept } = useParams<{ dept: Departamento }>();
  const key = (dept ?? "tecnologia") as Departamento;
  const d = deptData[key];
  const { data: atividades = d.atividades } = useAtividadesDept(key);

  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">{d.nome} — Visão do departamento</div>
        <div className="mt-1 text-[13px] text-muted">{d.resumo}</div>
      </div>

      <div className="mb-[22px] grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {d.kpis.map((k, i) => (
          <KpiCard key={k.label} label={k.label} value={k.value} delta={k.delta} deltaClass={k.deltaClass} index={i} />
        ))}
      </div>

      <Card className="p-5 px-[22px]">
        <div className="text-sm font-semibold">Atividades da equipe</div>
        <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">O que está em andamento no departamento</div>
        <TableWrap>
          <thead>
            <tr>
              <Th>Atividade</Th>
              <Th>Contexto</Th>
              <Th>Prazo</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {atividades.map((a) => (
              <tr key={a.titulo}>
                <Td wrap>{a.titulo}</Td>
                <Td>{a.contexto}</Td>
                <Td>{a.prazo}</Td>
                <Td>
                  <StatusBadge status={a.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </section>
  );
}
