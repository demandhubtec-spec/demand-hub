import * as React from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { type SecaoPlaybook, useManuais, usePlaybook, useSalvarManual, useSalvarPlaybook } from "@/hooks/usePlaybook";
import { cn } from "@/lib/utils";
import { TemplatesTab } from "../prospeccao/TemplatesTab";
import { fmtData } from "../prospeccao/shared";

/** O que cada manual muda no dia a dia: deixa claro onde a edição faz efeito. */
const ONDE_VALE: Record<string, string> = {
  ana: "Vale no canal Você e a Gabi: como ela te responde, propõe mensagens e coordena o time.",
  leo: "Guia a análise da lista. As pesquisas do Léo (site, CNPJ, dono) são automáticas; mudar as regras de busca é ajuste no sistema.",
  rita: "Guia o raio-x digital e a pesquisa do nicho.",
  bia: "Vale na sequência de mensagens da prospecção e no Direct do Instagram.",
  duda: "Vale no site de demonstração para quem não tem site.",
  rui: "Vale na revisão final da sequência de mensagens.",
  caio: "Guia a cadência: quem, quando e por qual canal.",
  gabi: "Vale nas conversas com os leads (abordagem).",
  marina: "Vale nas conversas com os leads e nos follow-ups (qualificação e agendamento).",
  davi: "Ligações ainda em preparação.",
};

/**
 * Playbook comercial, manuais de cada agente e modelos de mensagem. Tudo editável: o time passa a
 * seguir a nova versão em até 1 minuto depois de salvar.
 */
export function PlaybookTab() {
  const [visao, setVisao] = React.useState<"playbook" | "manuais" | "mensagens">("playbook");
  return (
    <div>
      <Segmented
        value={visao}
        onChange={setVisao}
        opcoes={[
          { value: "playbook", label: "Playbook comercial" },
          { value: "manuais", label: "Manual de cada agente" },
          { value: "mensagens", label: "Modelos de mensagem" },
        ]}
      />
      {visao === "playbook" ? <Playbook /> : visao === "manuais" ? <Manuais /> : <TemplatesTab />}
    </div>
  );
}

function Playbook() {
  const { data, isLoading, isError } = usePlaybook();
  const salvar = useSalvarPlaybook();
  if (isLoading) return <div className="text-[13px] text-muted">Carregando o playbook…</div>;
  if (isError) return <EmptyState>Não consegui abrir o playbook. Tente recarregar a página.</EmptyState>;
  return (
    <EditorDeSecoes
      chave="playbook"
      secoes={data?.secoes ?? []}
      atualizadoEm={data?.atualizado_em ?? null}
      descricao="A Ana e o time seguem estas regras em todas as conversas: primeira mensagem, follow-ups, demo e o que você pede no canal."
      salvar={(s) => salvar.mutateAsync(s)}
      salvando={salvar.isPending}
    />
  );
}

function Manuais() {
  const { data: manuais = [], isLoading, isError } = useManuais();
  const salvar = useSalvarManual();
  const [id, setId] = React.useState("ana");
  if (isLoading) return <div className="text-[13px] text-muted">Carregando os manuais…</div>;
  if (isError || !manuais.length) return <EmptyState>Não consegui abrir os manuais. Tente recarregar a página.</EmptyState>;
  const m = manuais.find((x) => x.id === id) ?? manuais[0];
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {manuais.map((a) => (
          <button
            key={a.id}
            onClick={() => setId(a.id)}
            className={cn(
              "rounded-[12px] border px-3 py-1.5 text-left text-[13px] transition-colors",
              a.id === m.id ? "border-primary-bright bg-primary-tint/50" : "border-border hover:border-primary-bright/50",
            )}
          >
            <div className="font-semibold">{a.nome}</div>
            <div className="text-[12px] text-muted">{a.cargo}</div>
          </button>
        ))}
      </div>
      <EditorDeSecoes
        key={m.id}
        chave={m.id}
        secoes={m.secoes}
        atualizadoEm={m.atualizado_em}
        descricao={`${ONDE_VALE[m.id] ?? ""} Para mudar o nome ou o cargo, fale comigo.`}
        salvar={(s) => salvar.mutateAsync({ id: m.id, secoes: s })}
        salvando={salvar.isPending}
      />
    </div>
  );
}

/** Editor de seções (título + uma regra por linha). Usado no playbook e nos manuais dos agentes. */
function EditorDeSecoes({
  chave,
  secoes,
  atualizadoEm,
  descricao,
  salvar,
  salvando,
}: {
  chave: string;
  secoes: SecaoPlaybook[];
  atualizadoEm: string | null;
  descricao: string;
  salvar: (s: SecaoPlaybook[]) => Promise<unknown>;
  salvando: boolean;
}) {
  const { showToast } = useToast();
  const [rascunho, setRascunho] = React.useState<SecaoPlaybook[] | null>(null);
  React.useEffect(() => setRascunho(null), [chave]);

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
      await salvar(rascunho ?? []);
      setRascunho(null);
      showToast("Salvo. O time já segue a nova versão em até 1 minuto.");
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-[13px] text-muted">
          {descricao}
          {atualizadoEm && <span className="ml-1">Última edição: {fmtData(atualizadoEm)}.</span>}
        </div>
        {editando ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setRascunho(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={gravar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setRascunho(secoes.length ? secoes : [{ titulo: "", texto: "" }])}>
            <Pencil /> Editar
          </Button>
        )}
      </div>

      {!editando && !secoes.length && <EmptyState>Vazio. Clique em Editar para escrever as regras.</EmptyState>}

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
              <div className="mt-1.5 text-[12px] text-muted">Uma regra por linha.</div>
            </Card>
          ) : (
            <Card key={i} className="p-4">
              <div className="eyebrow mb-2 text-[12px] text-primary-bright">{s.titulo || "Sem título"}</div>
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
