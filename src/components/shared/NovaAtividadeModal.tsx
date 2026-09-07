import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useCreateAtividade } from "@/hooks/useAtividades";
import { useProjetosAll } from "@/hooks/useProjetos";
import { usePerfis } from "@/hooks/usePerfis";
import { departamentoOptions } from "@/data/departamentos";
import type { AtividadePrioridade, Departamento } from "@/lib/types";

const prioridadeOptions: { value: AtividadePrioridade; label: string }[] = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

interface NovaAtividadeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando definido, o campo de departamento fica travado nesse valor. */
  departamentoFixo?: Departamento;
}

export function NovaAtividadeModal({ open, onOpenChange, departamentoFixo }: NovaAtividadeModalProps) {
  const { showToast } = useToast();
  const createAtividade = useCreateAtividade();
  const { data: projetos = [] } = useProjetosAll();
  const { data: perfis = [] } = usePerfis();

  const [departamento, setDepartamento] = React.useState<Departamento>(departamentoFixo ?? "tecnologia");
  const [projetoId, setProjetoId] = React.useState<string>("");
  const [titulo, setTitulo] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [prazo, setPrazo] = React.useState("");
  const [prioridade, setPrioridade] = React.useState<AtividadePrioridade>("media");
  const [responsavelId, setResponsavelId] = React.useState<string>("");

  React.useEffect(() => {
    if (open && departamentoFixo) setDepartamento(departamentoFixo);
  }, [open, departamentoFixo]);

  const projetosDoDept = projetos.filter((p) => p.departamento === departamento);

  function limpar() {
    setTitulo("");
    setDescricao("");
    setPrazo("");
    setPrioridade("media");
    setResponsavelId("");
    setProjetoId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createAtividade.mutateAsync({
        titulo,
        descricao: descricao || null,
        departamento,
        projeto_id: projetoId || null,
        responsavel_id: responsavelId || null,
        prazo: prazo || null,
        prioridade,
      });
      showToast(`Atividade "${titulo}" criada`);
      onOpenChange(false);
      limpar();
    } catch {
      showToast("Não foi possível salvar — verifique a conexão com o Supabase");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Nova atividade</DialogTitle>
        <DialogDescription>Cadastre uma tarefa e defina quem é o responsável por ela.</DialogDescription>
        <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3.5 overflow-y-auto pr-1">
          {!departamentoFixo && (
            <div>
              <Label>Departamento</Label>
              <Select
                value={departamento}
                onValueChange={(v) => {
                  setDepartamento(v as Departamento);
                  setProjetoId("");
                }}
              >
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
          )}

          <div>
            <Label htmlFor="fTitulo">Título</Label>
            <Input
              id="fTitulo"
              required
              placeholder="Ex: Revisar arquitetura do portal"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="fDescricao">Descrição</Label>
            <Textarea
              id="fDescricao"
              rows={3}
              placeholder="Detalhes da tarefa (opcional)"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div>
            <Label>Cliente / Projeto</Label>
            <Select value={projetoId || "none"} onValueChange={(v) => setProjetoId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhum (tarefa interna)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum (tarefa interna)</SelectItem>
                {projetosDoDept.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.empresa} — {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <Label htmlFor="fPrazo">Prazo</Label>
              <Input id="fPrazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as AtividadePrioridade)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {prioridadeOptions.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Responsável</Label>
            <Select value={responsavelId || "none"} onValueChange={(v) => setResponsavelId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem responsável definido</SelectItem>
                {perfis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-1.5 flex justify-end gap-2.5">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={createAtividade.isPending}>
              Salvar atividade
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
