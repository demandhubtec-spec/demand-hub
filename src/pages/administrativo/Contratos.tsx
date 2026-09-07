import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useContratos } from "@/hooks/useContratos";

export default function Contratos() {
  const navigate = useNavigate();
  const { data: contratos = [] } = useContratos();

  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">Administrativo</div>
        <div className="mt-1 text-[13px] text-muted">Contratos da DemandHub.</div>
      </div>

      <Tabs value="contratos" onValueChange={(v) => v === "financas" && navigate("/administrativo/financas")}>
        <TabsList>
          <TabsTrigger value="financas">Finanças</TabsTrigger>
          <TabsTrigger value="contratos">Contratos</TabsTrigger>
        </TabsList>
      </Tabs>

      <TableWrap>
        <thead>
          <tr>
            <Th>Cliente</Th>
            <Th>Tipo de contrato</Th>
            <Th>Início</Th>
            <Th>Renovação</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {contratos.map((c, i) => (
            <tr key={i}>
              <Td>{c.cliente}</Td>
              <Td>{c.tipo}</Td>
              <Td>{c.inicio}</Td>
              <Td>{c.renovacao}</Td>
              <Td>
                <StatusBadge status={c.status} />
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </section>
  );
}
