import * as React from "react";
import { Plus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { useClientes, useCreateCliente } from "@/hooks/useClientes";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { ClienteStatus } from "@/lib/types";

const filters: { key: "todos" | ClienteStatus; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "ativo", label: "Ativos" },
  { key: "pausado", label: "Pausados" },
  { key: "prospeccao", label: "Prospecção" },
];

export default function Clientes() {
  const { data: clientes = [] } = useClientes();
  const { hasPrivateAccess } = useAuth();
  const createCliente = useCreateCliente();
  const { showToast } = useToast();
  const [filtro, setFiltro] = React.useState<"todos" | ClienteStatus>("todos");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [segmento, setSegmento] = React.useState("");
  const [status, setStatus] = React.useState<ClienteStatus>("ativo");

  const visiveis = clientes.filter((c) => hasPrivateAccess || !c.privado);
  const filtrados = filtro === "todos" ? visiveis : visiveis.filter((c) => c.status === filtro);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createCliente.mutateAsync({ nome, segmento, status });
      showToast(`Cliente "${nome}" adicionado`);
      setModalOpen(false);
      setNome("");
      setSegmento("");
      setStatus("ativo");
    } catch {
      showToast("Não foi possível salvar — verifique a conexão com o Supabase");
    }
  }

  return (
    <section>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[21px] font-semibold">Clientes</div>
          <div className="mt-1 text-[13px] text-muted">{visiveis.length} clientes cadastrados.</div>
        </div>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo cliente
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={cn(
              "rounded-full border border-border bg-surface px-[13px] py-1.5 text-xs font-medium text-muted",
              filtro === f.key && "border-primary bg-primary text-white",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <EmptyState>Nenhum cliente encontrado para esse filtro.</EmptyState>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Segmento</Th>
              <Th>Responsável</Th>
              <Th>Status</Th>
              <Th>Projetos ativos</Th>
              <Th>Última atividade</Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id}>
                <Td>
                  {c.nome}
                  {c.privado && (
                    <span title="Acesso restrito — apenas Kelvin" className="ml-[7px] inline-flex align-middle text-primary-bright">
                      <Lock className="h-3 w-3" />
                    </span>
                  )}
                </Td>
                <Td>{c.segmento}</Td>
                <Td>Kelvin</Td>
                <Td>
                  <StatusBadge status={c.status} />
                </Td>
                <Td>1</Td>
                <Td>—</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>Cadastre um cliente novo na empresa selecionada.</DialogDescription>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div>
              <Label htmlFor="fNome">Nome do cliente</Label>
              <Input id="fNome" required placeholder="Ex: Padaria Bom Dia" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="fSegmento">Segmento</Label>
              <Input
                id="fSegmento"
                required
                placeholder="Ex: Alimentação"
                value={segmento}
                onChange={(e) => setSegmento(e.target.value)}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ClienteStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="prospeccao">Prospecção</SelectItem>
                  <SelectItem value="pausado">Pausado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-1.5 flex justify-end gap-2.5">
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={createCliente.isPending}>
                Salvar cliente
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
