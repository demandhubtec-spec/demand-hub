import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { useClientes } from "@/hooks/useClientes";
import { useProjetosAll } from "@/hooks/useProjetos";
import { useAuth } from "@/hooks/useAuth";

/** Aba "Projetos": um card por cliente; clicar abre a ficha com os projetos dele. */
export default function ProjetosHome() {
  const navigate = useNavigate();
  const { data: clientes = [], isLoading } = useClientes();
  const { data: projetos = [] } = useProjetosAll();
  const { hasPrivateAccess } = useAuth();

  // Ordem de cadastro, como no protótipo (mais antigos primeiro).
  const visiveis = clientes
    .filter((c) => hasPrivateAccess || !c.privado)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));

  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">Projetos</div>
        <div className="mt-1 text-[13px] text-muted">Selecione um cliente para ver os projetos dele.</div>
      </div>

      {!isLoading && visiveis.length === 0 ? (
        <EmptyState>Nenhum cliente cadastrado ainda. Cadastre em Comercial → Clientes.</EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3.5">
          {visiveis.map((c) => {
            const qtd = projetos.filter((p) => p.clienteId === c.id).length;
            return (
              <Card
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/projetos/${c.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/projetos/${c.id}`);
                  }
                }}
                className="cursor-pointer p-[18px] transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-primary-bright"
              >
                <div className="mb-1 flex items-center gap-1.5 text-[14.5px] font-semibold">
                  {c.nome}
                  {c.privado && (
                    <span title="Acesso restrito — apenas Kelvin" className="ml-[1px] inline-flex text-primary-bright">
                      <Lock className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <div className="mb-3 text-xs text-muted">{c.segmento}</div>
                <div className="flex items-center justify-between text-[11.5px] text-muted">
                  <StatusBadge status={c.status} />
                  <span>{qtd ? `${qtd} projeto(s)` : "Sem projetos ainda"}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
