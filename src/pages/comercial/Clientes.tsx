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
import { useProjetosAll, useCreateProjeto } from "@/hooks/useProjetos";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { departamentoOptions } from "@/data/departamentos";
import type { ClienteStatus, Departamento } from "@/lib/types";

const filters: { key: "todos" | ClienteStatus; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "ativo", label: "Ativos" },
  { key: "pausado", label: "Pausados" },
  { key: "prospeccao", label: "Prospecção" },
];

export default function Clientes() {
  const { data: clientes = [] } = useClientes();
  const { data: projetos = [] } = useProjetosAll();
  const { hasPrivateAccess } = useAuth();
  const createCliente = useCreateCliente();
  const createProjeto = useCreateProjeto();
  const { showToast } = useToast();
  const [filtro, setFiltro] = React.useState<"todos" | ClienteStatus>("todos");
  const [modalOpen, setModalOpen] = React.useState(false);

  const [nome, setNome] = React.useState("");
  const [segmento, setSegmento] = React.useState("");
  const [status, setStatus] = React.useState<ClienteStatus>("ativo");
  const [projetoNome, setProjetoNome] = React.useState("");
  const [projetoDept, setProjetoDept] = React.useState<Departamento>("tecnologia");
  const [projetoPrazo, setProjetoPrazo] = React.useState("");

  const visiveis = clientes.filter((c) => hasPrivateAccess || !c.privado);
  const filtrados = filtro === "todos" ? visiveis : visiveis.filter((c) => c.status === filtro);

  function projetosAtivosDe(clienteId: string) {
    return projetos.filter((p) => p.clienteId === clienteId && p.status === "andamento").length;
  }

  function limpar() {
    setNome("");
    setSegmento("");
    setStatus("ativo");
    setProjetoNome("");
    setProjetoDept("tecnologia");
    setProjetoPrazo("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const cliente = await createCliente.mutateAsync({ nome, segmento, status });
      if (projetoNome.trim()) {
        await createProjeto.mutateAsync({
          nome: projetoNome,
          cliente_id: cliente.id,
          departamento: projetoDept,
          prazo: projetoPrazo || null,
        });
      }
      showToast(`Cliente "${nome}" adicionado`);
      setModalOpen(false);
      limpar();
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
        <EmptyState>
          {visiveis.length === 0
            ? 'Nenhum cliente cadastrado ainda. Clique em "Novo cliente" para começar.'
            : "Nenhum cliente encontrado para esse filtro."}
        </EmptyState>
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
                <Td>{projetosAtivosDe(c.id)}</Td>
                <Td>—</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>Cadastre o cliente e já deixe o primeiro projeto configurado.</DialogDescription>
          <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3.5 overflow-y-auto pr-1">
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

            <div className="mt-1 border-t border-border pt-3.5">
              <div className="mb-2.5 text-[12.5px] font-semibold text-muted">Projeto inicial (opcional)</div>
              <div className="flex flex-col gap-3.5">
                <div>
                  <Label htmlFor="fProjetoNome">Nome do projeto</Label>
                  <Input
                    id="fProjetoNome"
                    placeholder="Ex: Reformulação de site"
                    value={projetoNome}
                    onChange={(e) => setProjetoNome(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <Label>Departamento</Label>
                    <Select value={projetoDept} onValueChange={(v) => setProjetoDept(v as Departamento)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {departamentoOptions.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="fProjetoPrazo">Prazo</Label>
                    <Input id="fProjetoPrazo" type="date" value={projetoPrazo} onChange={(e) => setProjetoPrazo(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-1.5 flex justify-end gap-2.5">
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={createCliente.isPending || createProjeto.isPending}>
                Salvar cliente
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
