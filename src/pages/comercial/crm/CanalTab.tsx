import * as React from "react";
import { Bot, ImageIcon, MessageCircle, Mic, Search, Send, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { type MsgCanal, useCanal, useContatos, useDecidirRascunho } from "@/hooks/useCrm";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { fmtData } from "../prospeccao/shared";
import { Compositor } from "./Compositor";

/**
 * "Você e a Gabi" (14/11/2026, pedido do Kelvin): igual a um WhatsApp. À esquerda, uma conversa por lead
 * (mais a "Geral", com as regras para todas), com filtros Não lidas, Esperando você e Sem resposta sua.
 * À direita, só a conversa escolhida. Abrir uma conversa marca como lida (neste navegador).
 * A Gabi te chama aqui quando precisa de direcionamento; o que você responde no WhatsApp também aparece.
 */
type Filtro = "todas" | "nao_lidas" | "esperando" | "sem_resposta";
const GERAL = "__geral__";
const CHAVE_LIDO = "dh.gabi.lido";

interface Conversa {
  id: string; // lead_id ou GERAL
  nome: string;
  msgs: MsgCanal[];
  ultima: MsgCanal;
  naoLidas: number;
  esperando: number;
  semResposta: boolean;
}

function lerLidos(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_LIDO) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

const esperandoVoce = (m: MsgCanal) => m.status === "pendente" || m.status === "aguardando_ok";

export function CanalTab({ abrirConversa }: { abrirConversa: (id: string) => void }) {
  const { data: msgs = [], isLoading, isError } = useCanal();
  const { contatos } = useContatos();
  const decidir = useDecidirRascunho();
  const { showToast } = useToast();
  const [filtro, setFiltro] = React.useState<Filtro>("todas");
  const [busca, setBusca] = React.useState("");
  const [aberta, setAberta] = React.useState<string | null>(null);
  const [lidos, setLidos] = React.useState<Record<string, string>>(lerLidos);

  async function responder(id: string, acao: "aprovar" | "descartar") {
    try {
      const r = await decidir.mutateAsync({ canal_id: id, acao });
      showToast(r.conteudo);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  const nome = React.useCallback(
    (id: string) => (id === GERAL ? "Geral · regras para todas as conversas" : contatos.find((c) => c.id === id)?.nomeExibicao ?? "Contato"),
    [contatos],
  );

  const conversas = React.useMemo<Conversa[]>(() => {
    const grupos = new Map<string, MsgCanal[]>();
    for (const m of msgs) {
      const k = m.lead_id ?? GERAL;
      grupos.set(k, [...(grupos.get(k) ?? []), m]);
    }
    return [...grupos.entries()]
      .map(([id, ms]) => {
        const lido = lidos[id] ?? "";
        const ultima = ms[ms.length - 1];
        return {
          id,
          nome: nome(id),
          msgs: ms,
          ultima,
          naoLidas: ms.filter((m) => m.autor === "ana" && m.created_at > lido).length,
          esperando: ms.filter(esperandoVoce).length,
          semResposta: ultima.autor === "ana",
        };
      })
      .sort((a, b) => b.ultima.created_at.localeCompare(a.ultima.created_at));
  }, [msgs, lidos, nome]);

  const conta = {
    todas: conversas.length,
    nao_lidas: conversas.filter((c) => c.naoLidas > 0).length,
    esperando: conversas.filter((c) => c.esperando > 0).length,
    sem_resposta: conversas.filter((c) => c.semResposta).length,
  };
  const termo = busca.trim().toLowerCase();
  const lista = conversas.filter(
    (c) =>
      (filtro === "todas" || (filtro === "nao_lidas" ? c.naoLidas > 0 : filtro === "esperando" ? c.esperando > 0 : c.semResposta)) &&
      (!termo || c.nome.toLowerCase().includes(termo) || c.msgs.some((m) => m.conteudo.toLowerCase().includes(termo))),
  );

  // Abre sozinho a conversa mais recente que espera você (ou a primeira da lista)
  React.useEffect(() => {
    if (aberta || !conversas.length) return;
    setAberta((conversas.find((c) => c.esperando > 0) ?? conversas[0]).id);
  }, [conversas, aberta]);

  // Abrir a conversa marca como lida. Um lead sem conversa ainda (orientação nova) abre vazio.
  const atual: (Omit<Conversa, "ultima"> & { ultima: MsgCanal | null }) | null =
    conversas.find((c) => c.id === aberta) ??
    (aberta && contatos.some((c) => c.id === aberta)
      ? { id: aberta, nome: nome(aberta), msgs: [], ultima: null, naoLidas: 0, esperando: 0, semResposta: false }
      : null);
  React.useEffect(() => {
    if (!atual?.ultima) return;
    const ultimo = atual.ultima.created_at;
    if ((lidos[atual.id] ?? "") >= ultimo) return;
    const novo = { ...lidos, [atual.id]: ultimo };
    setLidos(novo);
    try {
      localStorage.setItem(CHAVE_LIDO, JSON.stringify(novo));
    } catch {
      /* sem armazenamento: só nesta visita */
    }
  }, [atual, lidos]);

  const fim = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [aberta, atual?.msgs.length]);

  const marcarNaoLida = (id: string) => {
    const novo = { ...lidos };
    delete novo[id];
    setLidos(novo);
    try {
      localStorage.setItem(CHAVE_LIDO, JSON.stringify(novo));
    } catch {
      /* ok */
    }
    setAberta(null);
  };

  if (isError) return <EmptyState>Falta rodar o SQL do canal com a Gabi no Supabase para liberar esta aba.</EmptyState>;

  const chip = (f: Filtro, t: string) => (
    <button
      key={f}
      onClick={() => setFiltro(f)}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-[13px]",
        filtro === f ? "bg-primary-tint font-semibold text-primary" : "bg-surface-2 text-muted hover:text-ink",
      )}
    >
      {t}
      {conta[f] > 0 && f !== "todas" && <span className="tabular-nums text-[12px]">{conta[f]}</span>}
    </button>
  );

  return (
    <Card className="grid h-[720px] grid-cols-1 overflow-hidden p-0 md:grid-cols-[340px_1fr]">
      {/* Lista de conversas */}
      <div className={cn("flex min-h-0 flex-col border-border md:border-r", aberta && "max-md:hidden")}>
        <div className="space-y-2.5 border-b border-border p-3">
          <label className="flex items-center gap-2 rounded-[8px] border border-border bg-surface px-3 py-2 text-muted focus-within:border-primary">
            <Search className="h-4 w-4 shrink-0" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar lead ou mensagem" className="w-full bg-transparent text-[14px] text-ink outline-none" />
          </label>
          <select
            value=""
            onChange={(e) => e.target.value && (setAberta(e.target.value), setFiltro("todas"))}
            className="w-full rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-[13px] text-muted"
          >
            <option value="">+ Orientar a Gabi sobre outro lead…</option>
            {contatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nomeExibicao}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {chip("todas", "Todas")}
            {chip("nao_lidas", "Não lidas")}
            {chip("esperando", "Esperando você")}
            {chip("sem_resposta", "Sem resposta sua")}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-4 text-[13px] text-muted">Carregando…</div>}
          {!isLoading && !lista.length && (
            <div className="p-4 text-[13px] text-muted">{filtro === "nao_lidas" ? "Nada novo: você leu tudo." : "Nenhuma conversa aqui."}</div>
          )}
          {lista.map((c) => (
            <button
              key={c.id}
              onClick={() => setAberta(c.id)}
              className={cn(
                "flex w-full gap-3 border-b border-border/70 px-3 py-2.5 text-left hover:bg-surface-2",
                aberta === c.id && "bg-primary-tint/60",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                  c.id === GERAL ? "bg-surface-2 text-muted" : "bg-primary-tint text-primary",
                )}
              >
                {c.id === GERAL ? <Bot className="h-4 w-4" /> : c.nome.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={cn("truncate text-[14px]", c.naoLidas ? "font-semibold text-ink" : "font-medium")}>{c.nome}</span>
                  <span className={cn("ml-auto shrink-0 tabular-nums text-[12px]", c.naoLidas ? "font-semibold text-primary" : "text-muted")}>
                    {fmtData(c.ultima.created_at)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={cn("truncate text-[13px]", c.naoLidas ? "text-ink" : "text-muted")}>
                    {c.ultima.autor === "kelvin" ? "Você: " : ""}
                    {c.ultima.conteudo.replace(/^\[áudio transcrito\]\s*/, "")}
                  </span>
                  {c.esperando > 0 && <span className="shrink-0 rounded-full bg-attention-tint px-1.5 text-[12px] font-semibold text-attention">espera você</span>}
                  {c.naoLidas > 0 && (
                    <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[12px] font-semibold tabular-nums text-white">{c.naoLidas}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversa aberta */}
      <div className={cn("flex min-h-0 flex-col", !aberta && "max-md:hidden")}>
        {!atual ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-[14px] text-muted">
            Escolha uma conversa à esquerda. A Gabi te chama aqui quando precisa de direcionamento.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button className="text-muted hover:text-ink md:hidden" onClick={() => setAberta(null)} aria-label="Voltar">
                ←
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-semibold">{atual.nome}</div>
                <div className="text-[12px] text-muted">
                  {atual.msgs.length ? `${atual.msgs.length} mensage${atual.msgs.length === 1 ? "m" : "ns"}` : "Nova orientação"}
                  {atual.esperando ? ` · ${atual.esperando} esperando você` : ""}
                </div>
              </div>
              <button className="text-[13px] text-muted hover:text-ink" onClick={() => marcarNaoLida(atual.id)}>
                Marcar como não lida
              </button>
              {atual.id !== GERAL && (
                <Button size="sm" variant="ghost" onClick={() => abrirConversa(atual.id)}>
                  <MessageCircle /> Ver conversa com o lead
                </Button>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-surface-2/50 p-4">
              {atual.msgs.map((m) => {
                const gabi = m.autor === "ana";
                return (
                  <div key={m.id} className={cn("flex", gabi ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[78%] whitespace-pre-wrap rounded-[10px] px-3 py-2 text-[14px] leading-relaxed",
                        gabi ? "border border-border bg-surface" : "bg-primary-tint",
                        esperandoVoce(m) && "ring-1 ring-attention/50",
                      )}
                    >
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold">
                        {gabi ? (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <Bot className="h-3 w-3" /> Gabi
                          </span>
                        ) : (
                          <span className="text-ink">Você{m.origem === "whatsapp" ? " · pelo WhatsApp" : ""}</span>
                        )}
                        {m.tipo === "audio" && <Mic className="h-3 w-3 text-muted" />}
                        {m.tipo === "imagem" && <ImageIcon className="h-3 w-3 text-muted" />}
                        {m.status === "pendente" && <span className="rounded bg-attention-tint px-1.5 text-attention">esperando você</span>}
                        {m.status === "aguardando_ok" && <span className="rounded bg-attention-tint px-1.5 text-attention">esperando seu ok</span>}
                        {m.status === "enviado" && <span className="rounded bg-positive-tint px-1.5 text-positive">enviado</span>}
                      </div>
                      {m.conteudo.replace(/^\[áudio transcrito\]\s*/, "")}
                      {m.status === "aguardando_ok" && (
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" className="h-7 px-2.5 text-[12px]" disabled={decidir.isPending} onClick={() => responder(m.id, "aprovar")}>
                            <Send /> Mandar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[12px]" disabled={decidir.isPending} onClick={() => responder(m.id, "descartar")}>
                            <X /> Descartar
                          </Button>
                        </div>
                      )}
                      <div className="mt-1 text-right tabular-nums text-[12px] text-muted">{fmtData(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={fim} />
            </div>
            <Compositor
              leadId={atual.id === GERAL ? null : atual.id}
              placeholder={atual.id === GERAL ? "Ex.: com imobiliária, sempre peça o e-mail do gerente" : "Ex.: oferece terça às 10h e manda o link da análise"}
            />
          </>
        )}
      </div>
    </Card>
  );
}
