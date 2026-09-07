import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DualBarChart } from "@/components/shared/BarChart";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { useLancamentos } from "@/hooks/useFinanceiro";
import { cn } from "@/lib/utils";

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export default function Financas() {
  const navigate = useNavigate();
  const { data: lancamentos = [] } = useLancamentos();

  const now = new Date();
  const isMesAtual = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const doMes = lancamentos.filter((l) => isMesAtual(l.dataISO));
  const entradasMes = doMes.filter((l) => l.tipo === "entrada").reduce((a, b) => a + b.valor, 0);
  const saidasMes = doMes.filter((l) => l.tipo === "saida").reduce((a, b) => a + b.valor, 0);

  const meses6 = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (5 - i), 1));
  const fluxoCaixa = meses6.map((d) => {
    const doMesRef = lancamentos.filter((l) => {
      const ld = new Date(l.dataISO + "T00:00:00");
      return ld.getFullYear() === d.getFullYear() && ld.getMonth() === d.getMonth();
    });
    return {
      label: MESES[d.getMonth()],
      a: doMesRef.filter((l) => l.tipo === "entrada").reduce((acc, l) => acc + l.valor, 0),
      b: doMesRef.filter((l) => l.tipo === "saida").reduce((acc, l) => acc + l.valor, 0),
    };
  });

  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">Administrativo</div>
        <div className="mt-1 text-[13px] text-muted">Financeiro da DemandHub.</div>
      </div>

      <Tabs value="financas" onValueChange={(v) => v === "contratos" && navigate("/administrativo/contratos")}>
        <TabsList>
          <TabsTrigger value="financas">Finanças</TabsTrigger>
          <TabsTrigger value="contratos">Contratos</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-[22px] grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <Card className="p-5 px-[22px]">
          <div className="mb-2 text-xs font-medium text-muted">Entradas do mês</div>
          <div className="font-display text-[25px] font-bold text-positive">
            R$ {entradasMes.toLocaleString("pt-BR")}
          </div>
        </Card>
        <Card className="p-5 px-[22px]">
          <div className="mb-2 text-xs font-medium text-muted">Saídas do mês</div>
          <div className="font-display text-[25px] font-bold text-negative">
            R$ {saidasMes.toLocaleString("pt-BR")}
          </div>
        </Card>
        <Card className="p-5 px-[22px]">
          <div className="mb-2 text-xs font-medium text-muted">Saldo do mês</div>
          <div
            className={cn(
              "font-display text-[25px] font-bold",
              entradasMes - saidasMes >= 0 ? "text-positive" : "text-negative",
            )}
          >
            R$ {(entradasMes - saidasMes).toLocaleString("pt-BR")}
          </div>
        </Card>
      </div>

      <Card className="mb-[22px] p-5 px-[22px]">
        <div className="text-sm font-semibold">Fluxo de caixa — últimos 6 meses</div>
        <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">Entradas x saídas</div>
        <DualBarChart data={fluxoCaixa} />
        <div className="mt-4 flex gap-[18px]">
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="h-2 w-2 rounded-sm bg-positive" /> Entradas
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: "var(--negative-tint)" }} /> Saídas
          </div>
        </div>
      </Card>

      <Card className="p-5 px-[22px]">
        <div className="text-sm font-semibold">Lançamentos</div>
        <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">Todos os lançamentos cadastrados</div>
        {lancamentos.length === 0 ? (
          <EmptyState>Nenhum lançamento financeiro cadastrado ainda.</EmptyState>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Descrição</Th>
                <Th>Cliente</Th>
                <Th>Categoria</Th>
                <Th>Tipo</Th>
                <Th>Valor</Th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l, i) => (
                <tr key={i}>
                  <Td>{l.data}</Td>
                  <Td wrap>{l.descricao}</Td>
                  <Td>{l.cliente}</Td>
                  <Td>{l.categoria}</Td>
                  <Td>
                    <StatusBadge status={l.tipo} />
                  </Td>
                  <Td>
                    <span className={cn("font-mono font-semibold", l.tipo === "entrada" ? "text-positive" : "text-negative")}>
                      {l.tipo === "entrada" ? "+ " : "− "}R$ {l.valor.toLocaleString("pt-BR")}
                    </span>
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
