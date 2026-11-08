import * as React from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { type SecaoPlaybook, usePlaybook, useSalvarPlaybook } from "@/hooks/usePlaybook";
import { TemplatesTab } from "../prospeccao/TemplatesTab";
import { fmtData } from "../prospeccao/shared";

/**
 * Playbook comercial: as regras que a Ana e todo o time comercial seguem em todas as conversas
 * (primeira mensagem, follow-up, demo e o canal "Você e a Ana"). Ao lado, os modelos de mensagem.
 */
export function PlaybookTab() {
  const [visao, setVisao] = React.useState<"playbook" | "mensagens">("playbook");
  return (
    <div>
      <Segmented
        value={visao}
        onChange={setVisao}
        opcoes={[
          { value: "playbook", label: "Playbook comercial" },
          { value: "mensagens", label: "Modelos de mensagem" },
        ]}
      />
      {visao === "playbook" ? <Playbook /> : <TemplatesTab />}
    </div>
  );
}

function Playbook() {
  const { data, isLoading, isError } = usePlaybook();
  const salvar = useSalvarPlaybook();
  const { showToast } = useToast();
  const [rascunho, setRascunho] = React.useState<SecaoPlaybook[] | null>(null);

  if (isLoading) return <div className="text-[13px] text-muted">Carregando o playbook…</div>;
  if (isError) return <EmptyState>Não consegui abrir o playbook. Tente recarregar a página.</EmptyState>;

  const secoes = data?.secoes ?? [];
  const editando = rascunho !== null;
  const mudar = (i: number, campo: keyof SecaoPlaybook, v: string) =>
    setRascunho((r) => (r ?? []).map((s, j) => (j === i ? { ...s, [campo]: v } : s)));
  const mover = (i: number, d: -1 | 1) =>
    setRascunho((r) => {
      const n = [...(r ?? [])];
      const j = i + d;
      if (j < 0 || j >= n.length) return n;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  async function gravar() {
    try {
      await salvar.mutateAsync(rascunho ?? []);
      setRascunho(null);
      showToast("Playbook salvo. A Ana já segue a nova versão em até 1 minuto.");
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-[13px] text-muted">
          A Ana e o time seguem estas regras em todas as conversas: primeira mensagem, follow-ups, demo e o que você pede no canal.
          {data?.atualizado_em && <span className="ml-1">Última edição: {fmtData(data.atualizado_em)}.</span>}
        </div>
        {editando ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setRascunho(null)} disabled={salvar.isPending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={gravar} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar playbook"}
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setRascunho(secoes.length ? secoes : [{ titulo: "", texto: "" }])}>
            <Pencil /> Editar
          </Button>
        )}
      </div>

      {!editando && !secoes.length && (
        <EmptyState>Playbook vazio. Clique em Editar para escrever as regras que o time deve seguir.</EmptyState>
      )}

      <div className="grid gap-3.5 lg:grid-cols-2">
        {(editando ? rascunho : secoes).map((s, i) =>
          editando ? (
            <Card key={i} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Input value={s.titulo} onChange={(e) => mudar(i, "titulo", e.target.value)} placeholder="Título da seção" className="font-semibold" />
                <Button variant="icon" size="icon" title="Subir" onClick={() => mover(i, -1)} disabled={i === 0}>
                  <ArrowUp />
                </Button>
                <Button variant="icon" size="icon" title="Descer" onClick={() => mover(i, 1)} disabled={i === rascunho.length - 1}>
                  <ArrowDown />
                </Button>
                <Button variant="icon" size="icon" title="Apagar seção" onClick={() => setRascunho((r) => (r ?? []).filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              <Textarea value={s.texto} onChange={(e) => mudar(i, "texto", e.target.value)} rows={6} placeholder="Uma regra por linha" />
              <div className="mt-1.5 text-[11.5px] text-muted">Uma regra por linha.</div>
            </Card>
          ) : (
            <Card key={i} className="p-4">
              <div className="eyebrow mb-2 text-[10.5px] text-primary-bright">{s.titulo || "Sem título"}</div>
              <ul className="space-y-1.5 text-[13px] leading-relaxed">
                {s.texto
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l, j) => (
                    <li key={j} className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-bright" />
                      <span>{l.replace(/^[-•*]\s*/, "")}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          ),
        )}
      </div>

      {editando && (
        <Button variant="ghost" size="sm" className="mt-3.5" onClick={() => setRascunho((r) => [...(r ?? []), { titulo: "", texto: "" }])}>
          <Plus /> Nova seção
        </Button>
      )}
    </div>
  );
}
