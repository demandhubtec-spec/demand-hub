import * as React from "react";
import { ArrowLeft, Bot, PauseCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { ORIGEM_TEXTO, useContatos, useConversa, type Contato } from "@/hooks/useCrm";
import { fmtData } from "../prospeccao/shared";
import { STATUS_ANA } from "./InboundTab";

type Filtro = "todas" | "prospeccao" | "inbound";

function horaCurta(iso: string) {
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...(hoje ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }) });
}

/** Espelho do WhatsApp da Ana: todas as conversas, atualizando sozinhas. Só leitura por enquanto. */
export function ConversasTab({ leadId, escolher }: { leadId: string | null; escolher: (id: string) => void }) {
  const { contatos, isLoading, isError } = useContatos();
  const [filtro, setFiltro] = React.useState<Filtro>("todas");
  const [busca, setBusca] = React.useState("");
  const [mobileLista, setMobileLista] = React.useState(!leadId);

  if (isError) return <EmptyState>Falta rodar o SQL do CRM unificado no Supabase para liberar as conversas.</EmptyState>;

  const lista = contatos
    .filter((c) => filtro === "todas" || c.tipo === filtro)
    .filter((c) => !busca.trim() || `${c.nomeExibicao} ${c.nome ?? ""} ${c.phone}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const atual = contatos.find((c) => c.id === leadId) ?? null;

  return (
    <div className="grid gap-3.5 lg:grid-cols-[320px_1fr]">
      <Card className={cn("flex h-[640px] flex-col overflow-hidden", !mobileLista && atual && "hidden lg:flex")}>
        <div className="border-b border-border p-3">
          <Input placeholder="Buscar conversa" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="mt-2 flex gap-1.5">
            {(["todas", "prospeccao", "inbound"] as Filtro[]).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={cn("rounded-full border px-2.5 py-0.5 text-[11.5px]", filtro === f ? "border-primary text-ink" : "border-border text-muted")}
              >
                {f === "todas" ? "Todas" : f === "prospeccao" ? "Prospecção" : "Inbound"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-3 text-[12.5px] text-muted">Carregando…</div>}
          {lista.map((c) => (
            <ItemLista
              key={c.id}
              c={c}
              ativo={c.id === leadId}
              onClick={() => {
                escolher(c.id);
                setMobileLista(false);
              }}
            />
          ))}
        </div>
      </Card>

      <Card className={cn("flex h-[640px] flex-col overflow-hidden", mobileLista && "hidden lg:flex")}>
        {atual ? (
          <Conversa c={atual} voltar={() => setMobileLista(true)} />
        ) : (
          <div className="m-auto text-[13px] text-muted">Escolha uma conversa na lista.</div>
        )}
      </Card>
    </div>
  );
}

function ItemLista({ c, ativo, onClick }: { c: Contato; ativo: boolean; onClick: () => void }) {
  const esperando = c.last_inbound_at && (!c.last_outbound_at || c.last_inbound_at > c.last_outbound_at);
  return (
    <button onClick={onClick} className={cn("block w-full border-b border-border px-3 py-2.5 text-left hover:bg-surface-2", ativo && "bg-surface-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold">{c.nomeExibicao}</span>
        <span className="shrink-0 font-mono text-[10.5px] text-muted">{horaCurta(c.ultimaAtividade)}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
        <span className={c.tipo === "prospeccao" ? "text-primary-bright" : "text-positive"}>{c.tipo === "prospeccao" ? "Prospecção" : "Inbound"}</span>
        <span>· {STATUS_ANA[c.status ?? ""] ?? c.status}</span>
        {c.ai_paused && <PauseCircle className="h-3 w-3 text-attention" />}
        {esperando && <span className="ml-auto h-2 w-2 rounded-full bg-positive" title="Última mensagem foi do contato" />}
      </div>
    </button>
  );
}

function Conversa({ c, voltar }: { c: Contato; voltar: () => void }) {
  const { data: msgs = [], isLoading } = useConversa(c.id);
  const fim = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => fim.current?.scrollIntoView({ block: "end" }), [msgs.length, c.id]);

  let diaAnterior = "";
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border p-3">
        <button onClick={voltar} className="lg:hidden" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{c.nomeExibicao}</div>
          <div className="truncate text-[11.5px] text-muted">
            {c.nome && c.nome !== c.nomeExibicao ? `${c.nome} · ` : ""}
            {c.phone} · {c.tipo === "prospeccao" ? "Prospecção ativa" : ORIGEM_TEXTO[c.origem ?? ""] ?? "Inbound"}
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            c.ai_paused ? "bg-attention-tint text-attention" : "bg-positive-tint text-positive",
          )}
        >
          {c.ai_paused ? <PauseCircle className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
          {c.ai_paused ? "Ana pausada" : "Ana atendendo"}
        </span>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto bg-surface-2/40 p-3">
        {isLoading && <div className="text-[12.5px] text-muted">Carregando…</div>}
        {!isLoading && msgs.length === 0 && <div className="text-[12.5px] text-muted">Sem mensagens registradas.</div>}
        {msgs.map((m) => {
          const dia = fmtData(m.created_at, false);
          const mostrarDia = dia !== diaAnterior;
          diaAnterior = dia;
          const robo = m.content.startsWith("[resposta automática]");
          const deles = m.direction === "in";
          return (
            <React.Fragment key={m.id}>
              {mostrarDia && <div className="py-1 text-center font-mono text-[10.5px] text-muted">{dia}</div>}
              <div className={cn("flex", deles ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "max-w-[78%] whitespace-pre-wrap rounded-[10px] px-3 py-2 text-[13px]",
                    deles ? "bg-surface border border-border" : "bg-primary/15",
                    robo && "opacity-70",
                  )}
                >
                  {!deles && m.author && m.author !== "ia" && <div className="mb-0.5 text-[10.5px] font-semibold text-primary-bright">Você</div>}
                  {robo && <div className="mb-0.5 text-[10.5px] font-semibold text-muted">Resposta automática da empresa</div>}
                  {robo ? m.content.replace(/^\[resposta automática\]\s*/, "") : m.content}
                  <div className="mt-1 text-right font-mono text-[10px] text-muted">
                    {new Date(m.created_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={fim} />
      </div>
      <div className="border-t border-border px-3 py-2 text-[11.5px] text-muted">
        Só leitura por enquanto. Para mandar uma mensagem, use o bloco "Mensagem avulsa" na ficha do lead.
      </div>
    </>
  );
}
