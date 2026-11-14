import * as React from "react";
import { useParams } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { AtrasadaBadge } from "@/components/shared/AtrasadaBadge";
import { NovaAtividadeModal } from "@/components/shared/NovaAtividadeModal";
import { ProjetoModal } from "@/components/shared/ProjetoModal";
import { departamentoInfo } from "@/data/departamentos";
import type { Departamento } from "@/lib/types";
import { useAtividadesTodas, useUpdateAtividadeStatus, type AtividadeView } from "@/hooks/useAtividades";
import { useProjetosAll } from "@/hooks/useProjetos";
import { useAuth } from "@/hooks/useAuth";
import { diaMes, estaAtrasada } from "@/lib/prazo";
import { cn } from "@/lib/utils";

type Quem = "minhas" | "todas";
type Situacao = "pendentes" | "atrasadas" | "concluidas" | "todas";

/**
 * Lista de atividades agrupada por entrega/projeto.
 * Sem departamento na rota (/minhas-atividades) = todos os departamentos que a pessoa enxerga.
 * Com departamento (/:dept/atividades) = só daquele departamento.
 */
export default function MinhasAtividades() {
  const { dept } = useParams<{ dept?: Departamento }>();
  const { session } = useAuth();
  const meuId = session?.user.id ?? null;
  const { data: todas = [], isLoading } = useAtividadesTodas();
  const { data: projetos = [] } = useProjetosAll();
  const updateStatus = useUpdateAtividadeStatus();
  const [quem, setQuem] = React.useState<Quem>("minhas");
  const [situacao, setSituacao] = React.useState<Situacao>("pendentes");
  const [modalNova, setModalNova] = React.useState(false);
  const [aberta, setAberta] = React.useState<{ projetoId: string; atividadeId: string } | null>(null);

  const doDept = dept ? todas.filter((a) => a.departamento === dept) : todas;
  const daPessoa = quem === "minhas" ? doDept.filter((a) => a.responsavelId === meuId) : doDept;
  const contagem = {
    pendentes: daPessoa.filter((a) => a.status !== "concluido").length,
    atrasadas: daPessoa.filter((a) => estaAtrasada(a.prazo, a.status)).length,
    concluidas: daPessoa.filter((a) => a.status === "concluido").length,
    todas: daPessoa.length,
  };
  const lista = daPessoa.filter((a) =>
    situacao === "todas"
      ? true
      : situacao === "concluidas"
        ? a.status === "concluido"
        : situacao === "atrasadas"
          ? estaAtrasada(a.prazo, a.status)
          : a.status !== "concluido",
  );

  // Agrupa por projeto (entrega), na ordem do primeiro prazo de cada grupo
  const grupos = new Map<string, { titulo: string; sub: string; itens: AtividadeView[] }>();
  for (const a of lista) {
    const chave = a.projetoId ?? "interno";
    if (!grupos.has(chave)) {
      const titulo = a.entregaNumero
        ? `Entrega ${String(a.entregaNumero).padStart(2, "0")} · ${a.projetoNome}`
        : (a.projetoNome ?? "Atividades internas");
      const sub = a.contexto !== a.projetoNome ? a.contexto : "";
      grupos.set(chave, { titulo, sub, itens: [] });
    }
    grupos.get(chave)!.itens.push(a);
  }
  const ordem = (x: AtividadeView) => (estaAtrasada(x.prazo, x.status) ? "0" : "1") + (x.prazo ?? "9999");
  const listaGrupos = [...grupos.entries()]
    .map(([k, g]) => ({ k, ...g, itens: g.itens.sort((a, b) => ordem(a).localeCompare(ordem(b))) }))
    .sort((a, b) => ordem(a.itens[0]).localeCompare(ordem(b.itens[0])));

  const projetoAberto = aberta ? projetos.find((p) => p.id === aberta.projetoId) ?? null : null;
  const titulo = dept ? `${departamentoInfo[dept].nome} · Minhas atividades` : "Minhas atividades";

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[20px] font-semibold">{titulo}</div>
          <div className="mt-1 text-[13px] text-muted">
            Marque a caixinha quando terminar. Clique na atividade para ver detalhes, prazo e conversa.
          </div>
        </div>
        <Button variant="primary" onClick={() => setModalNova(true)}>
          <Plus className="h-4 w-4" />
          Nova atividade
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pilula ativo={quem === "minhas"} onClick={() => setQuem("minhas")}>
          Minhas
        </Pilula>
        <Pilula ativo={quem === "todas"} onClick={() => setQuem("todas")}>
          De todos
        </Pilula>
        <span className="mx-1 h-5 w-px bg-border" />
        <Pilula ativo={situacao === "pendentes"} onClick={() => setSituacao("pendentes")}>
          A fazer ({contagem.pendentes})
        </Pilula>
        <Pilula ativo={situacao === "atrasadas"} onClick={() => setSituacao("atrasadas")} alerta={contagem.atrasadas > 0}>
          Atrasadas ({contagem.atrasadas})
        </Pilula>
        <Pilula ativo={situacao === "concluidas"} onClick={() => setSituacao("concluidas")}>
          Concluídas ({contagem.concluidas})
        </Pilula>
        <Pilula ativo={situacao === "todas"} onClick={() => setSituacao("todas")}>
          Todas ({contagem.todas})
        </Pilula>
      </div>

      {!isLoading && listaGrupos.length === 0 ? (
        <EmptyState>
          {quem === "minhas" ? "Nenhuma atividade sua neste filtro." : "Nenhuma atividade neste filtro."}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {listaGrupos.map((g) => (
            <Card key={g.k} className="p-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-[22px] py-3">
                <div className="text-[14px] font-semibold">{g.titulo}</div>
                <div className="font-mono text-[12px] text-muted">
                  {g.sub && `${g.sub} · `}
                  {g.itens.length} atividade(s)
                </div>
              </div>
              <div className="flex flex-col px-[22px]">
                {g.itens.map((a) => {
                  const done = a.status === "concluido";
                  const atrasada = estaAtrasada(a.prazo, a.status);
                  return (
                    <div key={a.id} className="flex items-start gap-3 border-b border-border py-[12px] last:border-b-0">
                      <button
                        type="button"
                        aria-label={done ? "Marcar como não concluída" : "Marcar como concluída"}
                        onClick={() => updateStatus.mutate({ id: a.id, status: done ? "a-fazer" : "concluido" })}
                        className={cn(
                          "relative mt-0.5 h-[19px] w-[19px] shrink-0 rounded-[6px] border-[1.5px] border-border transition-all hover:border-primary-bright",
                          done && "border-primary bg-primary shadow-[0_0_10px_rgba(164,123,255,.6)]",
                        )}
                      >
                        {done && (
                          <svg viewBox="0 0 16 16" className="absolute inset-0 h-full w-full p-[3px] text-white">
                            <path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={!a.projetoId}
                        onClick={() => a.projetoId && setAberta({ projetoId: a.projetoId, atividadeId: a.id })}
                        className="group flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-default"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "text-[14px] font-medium group-hover:text-primary-bright",
                                done && "opacity-50 line-through",
                              )}
                            >
                              {a.titulo}
                            </span>
                            {atrasada && <AtrasadaBadge />}
                            <PriorityBadge prioridade={a.prioridade} />
                          </span>
                          <span className="text-[12px] text-muted">{a.responsavelNome ?? "Sem responsável"}</span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-[6px] px-2 py-[3px] font-mono text-[12px]",
                            atrasada ? "bg-negative-tint text-negative" : "bg-surface-2 text-muted",
                          )}
                        >
                          {diaMes(a.prazo)}
                        </span>
                        {a.projetoId && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      <NovaAtividadeModal open={modalNova} onOpenChange={setModalNova} departamentoFixo={dept} />
      <ProjetoModal
        projeto={projetoAberto}
        atividadeInicial={aberta?.atividadeId ?? null}
        onOpenChange={(open) => !open && setAberta(null)}
      />
    </section>
  );
}

function Pilula({
  ativo,
  alerta,
  onClick,
  children,
}: {
  ativo: boolean;
  alerta?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
        ativo
          ? "border-primary bg-primary text-white"
          : alerta
            ? "border-negative/40 bg-negative-tint text-negative hover:brightness-110"
            : "border-border bg-surface text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
