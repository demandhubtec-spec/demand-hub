import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { acessosSeed } from "@/data/seed";

export default function Acessos() {
  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">Acessos e logins</div>
        <div className="mt-1 text-[13px] text-muted">Quem acessa o Demand Hub e o que cada um enxerga.</div>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <Th>Usuário</Th>
            <Th>Papel</Th>
            <Th>Empresas visíveis</Th>
            <Th>Acesso financeiro</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {acessosSeed.map((a) => (
            <tr key={a.usuario}>
              <Td>{a.usuario}</Td>
              <Td>{a.papel}</Td>
              <Td wrap>{a.empresas}</Td>
              <Td>{a.financeiro ? "Sim" : "Não"}</Td>
              <Td>
                <StatusBadge status={a.status} />
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <div className="mt-3.5">
        <EmptyState>
          Sentiari Music e K19 Barbearia são negócios pessoais do Kelvin — por isso ficam de fora do acesso de
          Matheus e Fabrício. Fabrício também não vê Financeiro, Contratos, CRM, SDR IA nem a lista de Clientes.
        </EmptyState>
      </div>
    </section>
  );
}
