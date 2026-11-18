import * as React from "react";
import { ArrowLeft, Bot, PauseCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { ORIGEM_TEXTO, useAlternarAna, useContatos, useConversa, useNaoELead, type Contato } from "@/hooks/useCrm";
import { fmtData } from "../prospeccao/shared";
import { STATUS_ANA } from "./InboundTab";
import { Compositor } from "./Compositor";
import { useListaLeads, type ListaLead } from "@/hooks/useComercial";
import { ORIGENS, ORIGEM_POR_CHAVE, origemDaFonte, type OrigemLead } from "../time/funis";

type Filtro = "todas" | "prospeccao" | "inbound";
type FiltroSdr = "todas" | "gabi" | "marina";

const fim8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);

/**
 * Canal de origem do contato, com as mesmas tags do funil (17/11, Kelvin): lead cadastrado à mão ou de lista
 * (Instagram, LinkedIn, ligação, indicação, network, evento...) vale primeiro; depois a prospecção do Google
 * ou da lista do Instagram; quem chamou sozinho é inbound (anúncio, site, WhatsApp).
 */
export function origemDoContato(c: Contato, listaPorFone: Map<string, ListaLead>): OrigemLead {
  const l = listaPorFone.get(fim8(c.phone));
  if (l) return l.lista === "instagram" ? "instagram" : l.lista === "linkedin" ? "linkedin" : l.lista === "ligacoes" ? "ligacao" : origemDaFonte(l.fonte);
  if (c.prospeccao) return c.prospeccao.place_id?.startsWith("ig_") || c.prospeccao.origem === "instagram" ? "instagram" : "google";
  return "anuncio";
}

function horaCurta(iso: string) {
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...(hoje ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }) });
}

/** Espelho do WhatsApp da Ana: todas as conversas, atualizando sozinhas, com um campo para orientar a Ana. */
export function ConversasTab({ leadId, escolher }: { leadId: string | null; escolher: (id: string) => void }) {
  const { contatos, isLoading, isError } = useContatos();
  const { data: listas = [] } = useListaLeads();
  const [filtro, setFiltro] = React.useState<Filtro>("todas");
  const [sdr, setSdr] = React.useState<FiltroSdr>("todas");
  const [origens, setOrigens] = React.useState<OrigemLead[]>([]);
  const [esperando, setEsperando] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [mobileLista, setMobileLista] = React.useState(!leadId);

  const listaPorFone = React.useMemo(() => {
    const m = new Map<string, ListaLead>();
    for (const l of listas) if (fim8(l.whatsapp).length === 8) m.set(fim8(l.whatsapp), l);
    return m;
  }, [listas]);
  const origemDe = React.useMemo(() => new Map(contatos.map((c) => [c.id, origemDoContato(c, listaPorFone)])), [contatos, listaPorFone]);

  if (isError) return <EmptyState>Falta rodar o SQL do CRM unificado no Supabase para liberar as conversas.</EmptyState>;

  const semLixeira = contatos.filter((c) => !c.lixeira_em);
  const porTipo = semLixeira.filter((c) => filtro === "todas" || c.tipo === filtro);
  const porSdr = porTipo.filter((c) => sdr === "todas" || (sdr === "marina" ? c.agente === "marina" : c.agente !== "marina"));
  const contaOrigem = new Map<OrigemLead, number>();
  for (const c of porSdr) contaOrigem.set(origemDe.get(c.id)!, (contaOrigem.get(origemDe.get(c.id)!) ?? 0) + 1);
  const ehEsperando = (c: Contato) => !!c.last_inbound_at && (!c.last_outbound_at || c.last_inbound_at > c.last_outbound_at);
  const lista = porSdr
    .filter((c) => !origens.length || origens.includes(origemDe.get(c.id)!))
    .filter((c) => !esperando || ehEsperando(c))
    .filter((c) => !busca.trim() || `${c.nomeExibicao} ${c.nome ?? ""} ${c.phone}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const chip = (ativo: boolean) => cn("rounded-full border px-2.5 py-0.5 text-[12px]", ativo ? "border-primary text-ink" : "border-border text-muted");
  const atual = contatos.find((c) => c.id === leadId) ?? null;

  return (
    <div className="grid gap-3.5 lg:grid-cols-[320px_1fr]">
      <Card className={cn("flex h-[640px] flex-col overflow-hidden", !mobileLista && atual && "hidden lg:flex")}>
        <div className="border-b border-border p-3">
          <Input placeholder="Buscar conversa" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(["todas", "prospeccao", "inbound"] as Filtro[]).map((f) => (
              <button key={f} onClick={() => setFiltro(f)} className={chip(filtro === f)}>
                {f === "todas" ? "Todas" : f === "prospeccao" ? "Prospecção" : "Inbound"}
              </button>
            ))}
          </div>
          {/* Quem conversou: Gabi ou Marina (cada uma no seu número) */}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(["todas", "gabi", "marina"] as FiltroSdr[]).map((f) => (
              <button key={f} onClick={() => setSdr(f)} className={chip(sdr === f)}>
                {f === "todas" ? "Gabi e Marina" : f === "gabi" ? "Gabi" : "Marina"}
              </button>
            ))}
            <button onClick={() => setEsperando(!esperando)} className={chip(esperando)} title="A última mensagem foi do contato">
              Esperando resposta
            </button>
          </div>
          {/* Canal de origem, com as mesmas tags do funil; dá para marcar mais de um */}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ORIGENS.filter((o) => contaOrigem.get(o.k) || origens.includes(o.k)).map((o) => {
              const ativo = origens.includes(o.k);
              return (
                <button
                  key={o.k}
                  onClick={() => setOrigens(ativo ? origens.filter((x) => x !== o.k) : [...origens, o.k])}
                  className="rounded-full border px-2.5 py-0.5 text-[12px]"
                  style={ativo ? { borderColor: o.cor, color: o.cor, background: o.fundo } : undefined}
                  title={`${o.nome} · ${o.grupo}`}
                >
                  {o.k === "google" ? "Google" : o.k === "anuncio" ? "Anúncio (inbound)" : o.nome} {contaOrigem.get(o.k) ?? 0}
                </button>
              );
            })}
            {origens.length > 0 && (
              <button onClick={() => setOrigens([])} className="px-1 text-[12px] text-muted underline">
                limpar
              </button>
            )}
          </div>
          <div className="mt-1.5 text-[12px] text-muted">{lista.length} conversa{lista.length === 1 ? "" : "s"}</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-3 text-[13px] text-muted">Carregando…</div>}
          {lista.map((c) => (
            <ItemLista
              key={c.id}
              c={c}
              origem={origemDe.get(c.id)!}
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

function ItemLista({ c, origem, ativo, onClick }: { c: Contato; origem: OrigemLead; ativo: boolean; onClick: () => void }) {
  const o = ORIGEM_POR_CHAVE[origem];
  const esperando = c.last_inbound_at && (!c.last_outbound_at || c.last_inbound_at > c.last_outbound_at);
  return (
    <button onClick={onClick} className={cn("block w-full border-b border-border px-3 py-2.5 text-left hover:bg-surface-2", ativo && "bg-surface-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold">{c.nomeExibicao}</span>
        <span className="shrink-0 tabular-nums text-[12px] text-muted">{horaCurta(c.ultimaAtividade)}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
        <span style={{ color: o.cor }}>{origem === "google" ? "Google" : origem === "anuncio" ? "Inbound" : o.nome}</span>
        <span className={c.agente === "marina" ? "text-attention" : ""}> · {c.agente === "marina" ? "Marina" : "Gabi"}</span>
        <span>· {STATUS_ANA[c.status ?? ""] ?? c.status}</span>
        {c.ai_paused && <PauseCircle className="h-3 w-3 text-attention" />}
        {esperando && <span className="ml-auto h-2 w-2 rounded-full bg-positive" title="Última mensagem foi do contato" />}
      </div>
    </button>
  );
}

function Conversa({ c, voltar }: { c: Contato; voltar: () => void }) {
  const { data: msgs = [], isLoading } = useConversa(c.id);
  // Gabi ou Marina (16/11): cada conversa fica com a SDR do número em que acontece
  const SDR = c.agente === "marina" ? "Marina" : "Gabi";
  const alternar = useAlternarAna();
  const naoELead = useNaoELead();
  const { showToast } = useToast();
  const foraDoFunil = c.status === "desqualificado" || c.status === "opt_out";
  const fim = React.useRef<HTMLDivElement>(null);
  // Em navegadores novos o scrollIntoView devolve uma Promise: o efeito não pode retornar isso
  React.useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [msgs.length, c.id]);

  let diaAnterior = "";
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border p-3">
        <button onClick={voltar} className="lg:hidden" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{c.nomeExibicao}</div>
          <div className="truncate text-[12px] text-muted">
            {c.nome && c.nome !== c.nomeExibicao ? `${c.nome} · ` : ""}
            {c.phone} · {c.tipo === "prospeccao" ? "Prospecção ativa" : ORIGEM_TEXTO[c.origem ?? ""] ?? "Inbound"} · número da {SDR}
          </div>
        </div>
        {!foraDoFunil ? (
          <button
            type="button"
            disabled={naoELead.isPending}
            onClick={() => {
              if (!window.confirm(`Marcar ${c.nomeExibicao} como "não é lead"? A ${SDR} para de responder e não manda mais follow-up.`)) return;
              naoELead.mutate(
                { id: c.id, phone: c.phone },
                {
                  onSuccess: () => showToast(`Marcado como não é lead. A ${SDR} não fala mais com esse contato.`),
                  onError: () => showToast("Não consegui marcar agora. Tente de novo."),
                },
              );
            }}
            className="rounded-full border border-border px-2.5 py-1 text-[12px] font-semibold text-muted hover:text-foreground"
            title="Fornecedor, contato pessoal ou robô: a SDR nunca responde nem faz follow-up"
          >
            Não é lead
          </button>
        ) : (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-muted">Fora do funil</span>
        )}
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-full py-1 pl-2.5 pr-1 text-[12px] font-semibold",
            c.ai_paused ? "bg-attention-tint text-attention" : "bg-positive-tint text-positive",
          )}
          title={c.ai_paused ? `Ligar a ${SDR} nesta conversa` : `Pausar a ${SDR} nesta conversa`}
        >
          {c.ai_paused ? <PauseCircle className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
          {c.ai_paused ? `${SDR} pausada` : `${SDR} atendendo`}
          <Switch
            checked={!c.ai_paused}
            disabled={alternar.isPending || c.status === "opt_out"}
            onCheckedChange={(ligar) =>
              alternar.mutate(
                { id: c.id, ligar, status: c.status },
                {
                  onSuccess: () =>
                    showToast(ligar ? `${SDR} ligada. Ela responde a partir da próxima mensagem do contato.` : `${SDR} pausada nesta conversa.`),
                  onError: () => showToast("Não consegui mudar agora. Tente de novo."),
                },
              )
            }
            aria-label={c.ai_paused ? `Ligar a ${SDR}` : `Pausar a ${SDR}`}
          />
        </label>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto bg-surface-2/40 p-3">
        {isLoading && <div className="text-[13px] text-muted">Carregando…</div>}
        {!isLoading && msgs.length === 0 && <div className="text-[13px] text-muted">Sem mensagens registradas.</div>}
        {msgs.map((m) => {
          const dia = fmtData(m.created_at, false);
          const mostrarDia = dia !== diaAnterior;
          diaAnterior = dia;
          const robo = m.content.startsWith("[resposta automática]");
          const deles = m.direction === "in";
          return (
            <React.Fragment key={m.id}>
              {mostrarDia && <div className="py-1 text-center tabular-nums text-[12px] text-muted">{dia}</div>}
              <div className={cn("flex", deles ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "max-w-[78%] whitespace-pre-wrap rounded-[8px] px-3 py-2 text-[13px]",
                    deles ? "bg-surface border border-border" : "bg-primary/15",
                    robo && "opacity-70",
                  )}
                >
                  {!deles && m.author && m.author !== "ia" && <div className="mb-0.5 text-[12px] font-semibold text-primary-bright">Você</div>}
                  {robo && <div className="mb-0.5 text-[12px] font-semibold text-muted">Resposta automática da empresa</div>}
                  {robo ? m.content.replace(/^\[resposta automática\]\s*/, "") : m.content === "[reactionMessage]" ? "Reagiu à mensagem 👍" : m.content}
                  <div className="mt-1 text-right tabular-nums text-[12px] text-muted">
                    {new Date(m.created_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={fim} />
      </div>
      <div className="border-t border-border px-3 pt-2 text-[12px] text-muted">
        Fale com a {SDR} sobre esta conversa: ela monta a mensagem, te mostra na aba Você e a {SDR} e só manda com o seu ok.
      </div>
      <Compositor leadId={c.id} placeholder={`Ex.: ${SDR}, não é assim. Pede desculpa e oferece terça às 10h`} compacto />
    </>
  );
}
