import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DualBarChart } from "@/components/shared/BarChart";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { fluxoCaixa } from "@/data/seed";
import { useLancamentos } from "@/hooks/useFinanceiro";
import { cn } from "@/lib/utils";

export default function Financas() {
  const navigate = useNavigate();
  const { data: lancamentos = [] } = useLancamentos();
  const entradasMes = lancamentos.filter((l) => l.tipo === "entrada").reduce((a, b) => a + b.valor, 0);
  const saidasMes = lancamentos.filter((l) => l.tipo === "saida").reduce((a, b) => a + b.valor, 0);

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
        <DualBarChart data={fluxoCaixa.map((f) => ({ label: f.mes, a: f.entrada, b: f.saida }))} />
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
        <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">Setembro / Agosto</div>
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
      </Card>
    </section>
  );
}
