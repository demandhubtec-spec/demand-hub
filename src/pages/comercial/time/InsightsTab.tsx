import * as React from "react";
import { ArrowRight, Check, Pencil, RefreshCw, TrendingUp, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  type FaseConversa,
  type Insight,
  useAnalisarAgora,
  useDecidirInsight,
  useInsights,
  useMetas,
  useVoltarVersao,
} from "@/hooks/useComercial";
import { cn } from "@/lib/utils";
import { fmtPct } from "./indicadores-calc";

const FASES: { key: FaseConversa; n: number; nome: string; pergunta: string; conta: string }[] = [
  { key: "abordagem", n: 1, nome: "Abordagem", pergunta: "O lead responde?", conta: "1ª mensagem até a resposta" },
  { key: "conexao", n: 2, nome: "Conexão", pergunta: "A conversa continua?", conta: "resposta até a 3ª troca" },
  { key: "qualificacao", n: 3, nome: "Qualificação", pergunta: "Descobre decisor, dor e momento?", conta: "conversa até qualificado" },
  { key: "agendamento", n: 4, nome: "Agendamento", pergunta: "Marca a reunião?", conta: "qualificado até reunião" },
];
const NOME_FASE = Object.fromEntries(FASES.map((f) => [f.key, f.nome])) as Record<FaseConversa, string>;
const CANAL: Record<string, string> = { google: "Google", instagram: "Instagram", linkedin: "LinkedIn", ligacoes: "Ligações", inbound: "Inbound" };
const AGENTE: Record<string, string> = { gabi: "Gabi", marina: "Marina" };

const Rotulo = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("text-[12px] text-muted", className)}>{children}</div>
);
const Tag = ({ children, tom = "roxo" }: { children: React.ReactNode; tom?: "roxo" | "vermelho" | "laranja" | "verde" }) => (
  <span
    className={cn(
      "rounded-[6px] px-2 py-0.5 text-[12px]",
      tom === "vermelho" && "bg-negative-tint text-negative",
      tom === "laranja" && "bg-attention-tint text-attention",
      tom === "verde" && "bg-positive-tint text-positive",
      tom === "roxo" && "bg-primary-tint text-[#d9cbff]",
    )}
  >
    {children}
  </span>
);

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " ·");

/**
 * Aba Insights: a Gabi analisa sozinha as conversas todo dia às 6h, mostra onde trava (abordagem, conexão,
 * qualificação ou agendamento), a causa com trecho real e a correção no manual. Só vale depois que você aprova.
 */
export function InsightsTab() {
  const { data, isLoading } = useInsights();
  const { data: metas } = useMetas();
  const analisar = useAnalisarAgora();
  const { showToast } = useToast();
  const [aberto, setAberto] = React.useState<string | null>(null);

  const analise = data?.analise ?? null;
  const pendentes = (data?.insights ?? []).filter((i) => i.status === "pendente");
  const aplicados = (data?.insights ?? []).filter((i) => i.status === "aplicado").slice(0, 6);
  const principal = pendentes.find((i) => i.id === aberto) ?? pendentes[0] ?? null;

  const estado = (k: FaseConversa) => {
    const v = analise?.fases?.[k]?.valor ?? null;
    const m = metas?.fases?.[k] ?? null;
    if (v == null || m == null) return { v, m, st: "sem" as const };
    const gargalo = pendentes.some((i) => i.fase === k && i.gravidade === "gargalo");
    return { v, m, st: gargalo ? ("gargalo" as const) : v < m ? ("atencao" as const) : ("ok" as const) };
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="text-[13px] text-muted">
          A Gabi analisa sozinha todas as conversas, todo dia às 6h.{" "}
          {analise ? (
            <>
              Última análise: <b className="text-ink">{fmtData(analise.criado_em)}</b> · <b className="text-ink">{analise.conversas} conversas</b>.
            </>
          ) : (
            "Ainda não rodou nenhuma análise."
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={analisar.isPending}
          onClick={() =>
            analisar.mutate(undefined, {
              onSuccess: (r) => showToast(r.insights ? `${r.insights} insights novos` : "Análise feita, sem insight novo"),
              onError: (e) => showToast(`Erro: ${(e as Error).message}`),
            })
          }
        >
          <RefreshCw className={cn(analisar.isPending && "animate-spin")} />
          {analisar.isPending ? "Analisando…" : "Analisar agora"}
        </Button>
      </div>

      {/* As 4 fases */}
      <Card className="mb-4 grid overflow-hidden p-0 sm:grid-cols-2 lg:grid-cols-4">
        {FASES.map((f, i) => {
          const e = estado(f.key);
          return (
            <div
              key={f.key}
              className={cn(
                "relative p-5",
                i > 0 && "lg:border-l lg:border-border",
                e.st === "gargalo" && "bg-[linear-gradient(160deg,rgba(255,107,129,.15),transparent_70%)]",
              )}
            >
              <div className="absolute right-4 top-4">
                {e.st === "ok" && <Tag tom="verde">OK</Tag>}
                {e.st === "atencao" && <Tag tom="laranja">Atenção</Tag>}
                {e.st === "gargalo" && <Tag tom="vermelho">Gargalo</Tag>}
              </div>
              <Rotulo>
                {f.n} · {f.nome}
              </Rotulo>
              <div className="mt-1 text-[15.5px] font-semibold">{f.pergunta}</div>
              <div className="text-[13px] text-muted">{f.conta}</div>
              <div
                className={cn(
                  "mt-2 text-[32px] font-semibold leading-none",
                  e.st === "ok" && "text-positive",
                  e.st === "atencao" && "text-attention",
                  e.st === "gargalo" && "text-negative",
                )}
              >
                {fmtPct(e.v)}
              </div>
              <div className="mt-1 text-[12px] text-muted">meta {e.m ?? "-"}%</div>
            </div>
          );
        })}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div>
          {isLoading ? (
            <div className="text-[13px] text-muted">Carregando…</div>
          ) : !principal ? (
            <EmptyState>Nenhuma correção esperando você. A próxima análise roda amanhã às 6h, ou clique em "Analisar agora".</EmptyState>
          ) : (
            <InsightAberto key={principal.id} insight={principal} metricaAtual={analise?.fases?.[principal.fase]?.valor ?? null} />
          )}
          {pendentes
            .filter((i) => i.id !== principal?.id)
            .map((i) => (
              <Card key={i.id} className="mb-3 flex flex-wrap items-center gap-3 p-4">
                <Tag tom={i.gravidade === "gargalo" ? "vermelho" : "laranja"}>
                  {i.gravidade === "gargalo" ? "Gargalo" : "Atenção"} · {NOME_FASE[i.fase]}
                </Tag>
                <div className="min-w-0 flex-1 text-[14px] font-medium">
                  {i.titulo}
                  <span className="block text-[12px] font-normal text-muted">Baseado em {i.conversas} conversas.</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setAberto(i.id)}>
                  Abrir
                </Button>
              </Card>
            ))}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <Rotulo>Como funciona</Rotulo>
            <ol className="mt-3 space-y-2 text-[13px]">
              {[
                "A Gabi conversa com os leads",
                "Todo dia o sistema lê as conversas e acha o gargalo",
                "Mostra a causa e a correção do prompt",
                "Você aprova, e a próxima conversa já sai corrigida",
                "O sistema mede se melhorou",
              ].map((t, i) => (
                <li key={t} className="flex items-center gap-2.5">
                  <b className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-primary-tint text-[12px]">{i + 1}</b>
                  {t}
                </li>
              ))}
            </ol>
          </Card>
          <Card className="p-5">
            <Rotulo>Correções já aplicadas</Rotulo>
            {aplicados.length === 0 ? (
              <div className="mt-3 text-[13px] text-muted">Nenhuma ainda.</div>
            ) : (
              aplicados.map((i) => (
                <div key={i.id} className="border-t border-border py-3 text-[14px] first-of-type:border-0">
                  {i.incluir[0] ?? i.titulo}
                  <span className="mt-0.5 block text-[12px] text-muted">
                    {NOME_FASE[i.fase]} · {i.canais.map((c) => CANAL[c] ?? c).join(", ") || "todos"} · aprovado{" "}
                    {i.decidido_em ? new Date(i.decidido_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-[13px]">
                    {NOME_FASE[i.fase]}
                    <s className="text-muted">{fmtPct(i.metrica_antes)}</s>
                    <ArrowRight className="h-3.5 w-3.5" />
                    {i.metrica_depois == null ? (
                      <span className="text-muted">medindo (7 dias)</span>
                    ) : (
                      <b className={i.metrica_depois >= (i.metrica_antes ?? 0) ? "text-positive" : "text-negative"}>{fmtPct(i.metrica_depois)}</b>
                    )}
                  </span>
                </div>
              ))
            )}
          </Card>
          <Versoes />
        </div>
      </div>
    </div>
  );
}

function InsightAberto({ insight: i, metricaAtual }: { insight: Insight; metricaAtual: number | null }) {
  const decidir = useDecidirInsight();
  const { showToast } = useToast();
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState(i.incluir.join("\n"));
  const incluir = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const gargalo = i.gravidade === "gargalo";
  return (
    <Card className={cn("mb-3 p-5", gargalo ? "border-negative/45" : "border-attention/40")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tag tom={gargalo ? "vermelho" : "laranja"}>
          {gargalo ? "Gargalo" : "Atenção"} · {NOME_FASE[i.fase]}
        </Tag>
        {i.canais.map((c) => (
          <Tag key={c}>{CANAL[c] ?? c}</Tag>
        ))}
        <span className="ml-auto text-[12px] text-muted">baseado em {i.conversas} conversas</span>
      </div>
      <div className="mb-4 text-[18px] font-semibold leading-snug">{i.titulo}</div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <Rotulo className="mb-2">Causa raiz</Rotulo>
          <p className="text-[14px] leading-relaxed text-ink/90">{i.causa}</p>
          {i.trecho.length > 0 && (
            <>
              <Rotulo className="mb-2 mt-4">Trecho de uma conversa</Rotulo>
              <div className="rounded-[12px] border border-border bg-[rgba(11,4,32,.6)] p-3">
                {i.trecho.map((t, k) =>
                  t.de === "nota" ? (
                    <div key={k} className="py-1 text-center text-[12px] text-muted">
                      {t.texto}
                    </div>
                  ) : (
                    <div
                      key={k}
                      className={cn(
                        "mb-1.5 max-w-[88%] rounded-[12px] px-3 py-2 text-[13px] leading-snug",
                        t.de === "ia" ? "ml-auto rounded-br-[6px] bg-primary-tint" : "rounded-bl-[6px] bg-surface-2",
                      )}
                    >
                      {t.texto}
                    </div>
                  ),
                )}
              </div>
            </>
          )}
        </div>
        <div>
          <Rotulo className="mb-2">Correção sugerida no manual da {AGENTE[i.agente]}</Rotulo>
          {editando ? (
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
              className="w-full rounded-[12px] border border-primary-bright/50 bg-[rgba(11,4,32,.6)] p-3 font-mono text-[12px] leading-relaxed text-ink"
            />
          ) : (
            <div className="space-y-1 rounded-[12px] border border-border bg-[rgba(11,4,32,.6)] p-3 font-mono text-[12px] leading-relaxed">
              {i.remover && <div className="rounded-[6px] bg-negative-tint px-2 py-0.5 text-[#ffb3c0] line-through">{i.remover}</div>}
              {incluir.map((l) => (
                <div key={l} className="rounded-[6px] bg-positive-tint px-2 py-0.5 text-[#a6f0c9]">
                  {l}
                </div>
              ))}
            </div>
          )}
          {i.esperado && (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-positive">
              <TrendingUp className="h-4 w-4" />
              {i.esperado}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2.5 border-t border-border pt-4">
        <Button
          className="bg-positive text-[#062b18] shadow-none"
          disabled={decidir.isPending || !incluir.length}
          onClick={() =>
            decidir.mutate(
              { insight: i, aprovar: true, incluir, metricaAntes: metricaAtual },
              {
                onSuccess: () => showToast(`Aplicado no manual da ${AGENTE[i.agente]}. A próxima conversa já sai corrigida.`),
                onError: (e) => showToast(`Erro: ${(e as Error).message}`),
              },
            )
          }
        >
          <Check /> Aprovar e aplicar no prompt
        </Button>
        <Button variant="ghost" onClick={() => setEditando((v) => !v)}>
          <Pencil /> {editando ? "Ver como fica" : "Ajustar o texto"}
        </Button>
        <Button
          variant="ghost"
          disabled={decidir.isPending}
          onClick={() =>
            decidir.mutate({ insight: i, aprovar: false }, { onSuccess: () => showToast("Recusado. Nada mudou no manual."), onError: (e) => showToast(`Erro: ${(e as Error).message}`) })
          }
        >
          <X /> Recusar
        </Button>
      </div>
    </Card>
  );
}

function Versoes() {
  const { data } = useInsights();
  const voltar = useVoltarVersao();
  const { showToast } = useToast();
  const versoes = data?.versoes ?? [];
  return (
    <Card className="p-5">
      <Rotulo>Versões dos manuais (Gabi e Marina)</Rotulo>
      {versoes.length === 0 ? (
        <div className="mt-3 text-[13px] text-muted">A cada correção aprovada, a versão anterior fica guardada aqui.</div>
      ) : (
        versoes.slice(0, 5).map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-3 border-t border-border py-2.5 text-[13px] first-of-type:mt-2">
            <span className="min-w-0">
              {AGENTE[v.agente] ?? v.agente} · {new Date(v.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              <span className="block truncate text-[12px] text-muted">{v.motivo}</span>
            </span>
            <button
              className="shrink-0 text-[12px] text-primary-bright hover:underline"
              disabled={voltar.isPending}
              onClick={() => {
                if (!window.confirm(`Voltar o manual da ${AGENTE[v.agente] ?? v.agente} para esta versão?`)) return;
                voltar.mutate(v, { onSuccess: () => showToast("Manual voltou para a versão escolhida."), onError: (e) => showToast(`Erro: ${(e as Error).message}`) });
              }}
            >
              voltar para esta
            </button>
          </div>
        ))
      )}
    </Card>
  );
}
