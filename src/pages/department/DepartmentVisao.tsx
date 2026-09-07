import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/KpiCard";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { departamentoInfo } from "@/data/departamentos";
import type { Departamento } from "@/lib/types";
import { useAtividadesDept } from "@/hooks/useAtividades";
import { useProjetosDept } from "@/hooks/useProjetos";

export default function DepartmentVisao() {
  const { dept } = useParams<{ dept: Departamento }>();
  const key = (dept ?? "tecnologia") as Departamento;
  const info = departamentoInfo[key];
  const { data: atividades = [] } = useAtividadesDept(key);
  const { data: projetos = [] } = useProjetosDept(key);

  const projetosAtivos = projetos.filter((p) => p.status === "andamento").length;
  const tarefasAbertas = atividades.filter((a) => a.status !== "concluido").length;
  const concluidas = atividades.filter((a) => a.status === "concluido").length;
  const taxaConclusao = atividades.length > 0 ? Math.round((concluidas / atividades.length) * 100) : 0;

  const kpis = [
    {
      label: "Projetos ativos",
      value: String(projetosAtivos),
      delta: `${projetos.length} no total`,
      deltaClass: "up" as const,
    },
    {
      label: "Tarefas em aberto",
      value: String(tarefasAbertas),
      delta: `${atividades.length} no total`,
      deltaClass: tarefasAbertas > 0 ? ("warn" as const) : ("up" as const),
    },
    {
      label: "Taxa de conclusão",
      value: `${taxaConclusao}%`,
      delta: atividades.length > 0 ? `${concluidas} concluída(s)` : "Sem atividades ainda",
      deltaClass: "up" as const,
    },
  ];

  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">{info.nome} — Visão do departamento</div>
        <div className="mt-1 text-[13px] text-muted">{info.resumo}</div>
      </div>

      <div className="mb-[22px] grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} label={k.label} value={k.value} delta={k.delta} deltaClass={k.deltaClass} index={i} />
        ))}
      </div>

      <Card className="p-5 px-[22px]">
        <div className="text-sm font-semibold">Atividades da equipe</div>
        <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">O que está em andamento no departamento</div>
        {atividades.length === 0 ? (
          <EmptyState>Nenhuma atividade cadastrada em {info.nome} ainda.</EmptyState>
        ) : (
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
                <tr key={a.id}>
                  <Td wrap>{a.titulo}</Td>
                  <Td>{a.contexto}</Td>
                  <Td>{a.prazo ?? "—"}</Td>
                  <Td>
                    <StatusBadge status={a.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </section>
  );
}
