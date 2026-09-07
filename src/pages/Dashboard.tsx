import * as React from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { BarChart } from "@/components/shared/BarChart";
import { BreakdownBar } from "@/components/shared/BreakdownBar";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { NovaAtividadeModal } from "@/components/shared/NovaAtividadeModal";
import { departamentoInfo } from "@/data/departamentos";
import { useClientes } from "@/hooks/useClientes";
import { useProjetosAll } from "@/hooks/useProjetos";
import { useAtividadesTodas } from "@/hooks/useAtividades";
import { useLancamentos } from "@/hooks/useFinanceiro";
import { useAuth } from "@/hooks/useAuth";

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export default function Dashboard() {
  const { hasPrivateAccess } = useAuth();
  const { data: clientes = [] } = useClientes();
  const { data: projetos = [] } = useProjetosAll();
  const { data: atividades = [] } = useAtividadesTodas();
  const { data: lancamentos = [] } = useLancamentos();
  const [modalOpen, setModalOpen] = React.useState(false);

  const clientesVisiveis = clientes.filter((c) => hasPrivateAccess || !c.privado);
  const clientesAtivos = clientesVisiveis.filter((c) => c.status === "ativo").length;

  const projetosAndamento = projetos.filter((p) => p.status === "andamento").length;
  const atividadesPendentes = atividades.filter((a) => a.status !== "concluido").length;

  const now = new Date();
  const meses6 = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (5 - i), 1));
  const faturamentoPorMes = meses6.map((d) => {
    const total = lancamentos
      .filter((l) => l.tipo === "entrada")
      .filter((l) => {
        const ld = new Date(l.dataISO + "T00:00:00");
        return ld.getFullYear() === d.getFullYear() && ld.getMonth() === d.getMonth();
      })
      .reduce((acc, l) => acc + l.valor, 0);
    return { label: MESES[d.getMonth()], value: total };
  });
  const faturamentoMesAtual = faturamentoPorMes[faturamentoPorMes.length - 1]?.value ?? 0;
  const faturamentoMesAnterior = faturamentoPorMes[faturamentoPorMes.length - 2]?.value ?? 0;
  const variacaoFaturamento =
    faturamentoMesAnterior > 0
      ? Math.round(((faturamentoMesAtual - faturamentoMesAnterior) / faturamentoMesAnterior) * 100)
      : null;

  const totalProjetos = projetos.length;
  const deptKeys = ["comercial", "tecnologia", "marketing", "administrativo"] as const;
  const breakdown = deptKeys
    .map((k) => ({
      label: departamentoInfo[k].nome,
      value: projetos.filter((p) => p.departamento === k).length,
      total: totalProjetos,
    }))
    .filter((b) => b.value > 0);

  const atividadesRecentes = atividades.filter((a) => a.status !== "concluido").slice(0, 8);

  return (
    <section>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[21px] font-semibold">Visão geral</div>
          <div className="mt-1 text-[13px] text-muted">O panorama da operação até agora.</div>
        </div>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Nova atividade
        </Button>
      </div>

      <div className="mb-[22px] grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Clientes ativos" value={String(clientesAtivos)} delta={`${clientesVisiveis.length} no total`} deltaClass="up" accent="primary" index={0} />
        <KpiCard
          label="Projetos em andamento"
          value={String(projetosAndamento)}
          delta={`de ${totalProjetos} no total`}
          deltaClass="up"
          accent="positive"
          index={1}
        />
        <KpiCard
          label="Atividades pendentes"
          value={String(atividadesPendentes)}
          delta={`${atividades.length} no total`}
          deltaClass={atividadesPendentes > 0 ? "warn" : "up"}
          accent="attention"
          index={2}
        />
        <KpiCard
          label="Faturamento do mês"
          value={`R$ ${faturamentoMesAtual.toLocaleString("pt-BR")}`}
          delta={variacaoFaturamento === null ? "Sem histórico" : `${variacaoFaturamento >= 0 ? "+" : ""}${variacaoFaturamento}% vs. mês anterior`}
          deltaClass={variacaoFaturamento === null || variacaoFaturamento >= 0 ? "up" : "warn"}
          accent="primary"
          index={3}
        />
      </div>

      <div className="mb-[22px] grid grid-cols-1 gap-3.5 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Faturamento — últimos 6 meses</div>
          <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">Entradas totais por mês (DemandHub)</div>
          <BarChart data={faturamentoPorMes} formatTooltip={(v) => `R$ ${v.toLocaleString("pt-BR")}`} />
        </Card>
        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Projetos por departamento</div>
          <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">{totalProjetos} projetos no total</div>
          {breakdown.length === 0 ? (
            <EmptyState>Nenhum projeto cadastrado ainda.</EmptyState>
          ) : (
            <BreakdownBar items={breakdown} />
          )}
        </Card>
      </div>

      <Card className="p-5 px-[22px]">
        <div className="text-sm font-semibold">Atividades recentes</div>
        <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">
          O que está em movimento agora, entre todos os departamentos
        </div>
        {atividadesRecentes.length === 0 ? (
          <EmptyState>
            Nenhuma atividade pendente. Clique em "Nova atividade" para cadastrar a primeira tarefa.
          </EmptyState>
        ) : (
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
                <tr key={a.id}>
                  <Td wrap>{a.titulo}</Td>
                  <Td>{a.departamento ? departamentoInfo[a.departamento].nome : "—"}</Td>
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

      <NovaAtividadeModal open={modalOpen} onOpenChange={setModalOpen} />
    </section>
  );
}
