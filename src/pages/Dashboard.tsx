import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/KpiCard";
import { BarChart } from "@/components/shared/BarChart";
import { BreakdownBar } from "@/components/shared/BreakdownBar";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { faturamentoMensal, atividadesRecentes, deptData } from "@/data/seed";

export default function Dashboard() {
  const totalProjetos = Object.values(deptData).reduce((acc, d) => acc + d.projetos.length, 0);
  const breakdown = [
    { label: "Comercial", value: deptData.comercial.projetos.length, total: totalProjetos },
    { label: "Tecnologia", value: deptData.tecnologia.projetos.length, total: totalProjetos },
    { label: "Marketing", value: deptData.marketing.projetos.length, total: totalProjetos },
  ];

  return (
    <section>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[21px] font-semibold">Visão geral</div>
          <div className="mt-1 text-[13px] text-muted">O panorama da operação até agora.</div>
        </div>
      </div>

      <div className="mb-[22px] grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Clientes ativos" value="5" delta="+1 este mês" deltaClass="up" accent="primary" index={0} />
        <KpiCard label="Projetos em andamento" value="8" delta="de 10 no total" deltaClass="up" accent="positive" index={1} />
        <KpiCard label="Atividades pendentes" value="9" delta="3 vencem esta semana" deltaClass="warn" accent="attention" index={2} />
        <KpiCard label="Faturamento do mês" value="R$ 19.300" delta="+8% vs. mês anterior" deltaClass="up" accent="primary" index={3} />
      </div>

      <div className="mb-[22px] grid grid-cols-1 gap-3.5 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Faturamento — últimos 6 meses</div>
          <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">Entradas totais por mês (DemandHub)</div>
          <BarChart
            data={faturamentoMensal.map((f) => ({ label: f.mes, value: f.valor }))}
            formatTooltip={(v) => `R$ ${v.toLocaleString("pt-BR")}`}
          />
        </Card>
        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Projetos por departamento</div>
          <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">{totalProjetos} projetos no total</div>
          <BreakdownBar items={breakdown} />
        </Card>
      </div>

      <Card className="p-5 px-[22px]">
        <div className="text-sm font-semibold">Atividades recentes</div>
        <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">
          O que está em movimento agora, entre todos os departamentos
        </div>
        <TableWrap>
          <thead>
            <tr>
              <Th>Atividade</Th>
              <Th>Departamento</Th>
              <Th>Contexto</Th>
              <Th>Prazo</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {atividadesRecentes.map((a) => (
              <tr key={a.atividade}>
                <Td wrap>{a.atividade}</Td>
                <Td>{a.departamento}</Td>
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
