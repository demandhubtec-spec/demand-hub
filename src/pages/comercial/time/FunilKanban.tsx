import * as React from "react";
import { MessageCircle } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { ORIGEM_TEXTO, useContatos, useEtapaInbound } from "@/hooks/useCrm";
import { type OutreachLead, useOutreachLeads, useUpdateLead } from "@/hooks/useProspeccao";
import { cn } from "@/lib/utils";
import { FichaLead } from "../prospeccao/FichaLead";
import { fmtData } from "../prospeccao/shared";
import {
  COLUNAS_INBOUND,
  COLUNAS_OUTBOUND,
  type Coluna,
  type EtapaInbound,
  type EtapaOutbound,
  etapaInbound,
  etapaInboundParaBanco,
  etapaOutbound,
  patchOutbound,
} from "./funis";

interface CardItem {
  id: string;
  titulo: string;
  sub: string;
  quando: string | null;
  conversa?: string | null;
  aviso?: string | null;
}

/** Quadro genérico: colunas, cards e arrastar entre colunas. Usado pelos dois funis. */
function Quadro<K extends string>({
  colunas,
  itens,
  etapa,
  mover,
  abrir,
  abrirConversa,
}: {
  colunas: readonly Coluna<K>[];
  itens: CardItem[];
  etapa: (id: string) => K | null;
  mover: (id: string, para: K) => void;
  abrir: (id: string) => void;
  abrirConversa: (id: string) => void;
}) {
  const [mostrarPerdidos, setMostrarPerdidos] = React.useState(false);
  const [sobre, setSobre] = React.useState<K | null>(null);
  const visiveis = colunas.filter((c) => !c.fim || mostrarPerdidos);
  const porColuna = (k: K) => itens.filter((i) => etapa(i.id) === k);
  const perdidos = colunas.filter((c) => c.fim).reduce((n, c) => n + porColuna(c.key).length, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[12.5px] text-muted">
        <span>Arraste o card para mudar de etapa. Clique para abrir.</span>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={mostrarPerdidos} onChange={(e) => setMostrarPerdidos(e.target.checked)} />
          Mostrar perdidos ({perdidos})
        </label>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {visiveis.map((col) => {
          const lista = porColuna(col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(col.key);
              }}
              onDragLeave={() => setSobre((s) => (s === col.key ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setSobre(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id && etapa(id) !== col.key) mover(id, col.key);
              }}
              className={cn(
                "flex w-[248px] shrink-0 flex-col rounded-[14px] border border-border bg-surface-2/40 p-2.5 transition-colors",
                sobre === col.key && "border-primary-bright bg-primary-tint/40",
              )}
            >
              <div className="mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold">{col.label}</span>
                  <span className="ml-auto rounded-full bg-surface px-2 text-[11.5px] font-semibold text-muted">{lista.length}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted">{col.dica}</div>
              </div>
              <div className="flex min-h-[60px] flex-col gap-2">
                {lista.map((it) => (
                  <div
                    key={it.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", it.id)}
                    onClick={() => abrir(it.id)}
                    className="cursor-pointer rounded-[11px] border border-border bg-surface p-2.5 text-left transition-colors hover:border-primary-bright/50"
                  >
                    <div className="text-[13px] font-semibold leading-snug">{it.titulo}</div>
                    {it.sub && <div className="mt-0.5 text-[11.5px] text-muted">{it.sub}</div>}
                    {it.aviso && <div className="mt-1 text-[11.5px] text-attention">{it.aviso}</div>}
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                      {it.quando && <span>{fmtData(it.quando)}</span>}
                      {it.conversa && (
                        <button
                          className="ml-auto inline-flex items-center gap-1 text-primary-bright hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirConversa(it.conversa!);
                          }}
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Conversa
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const fim8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);

/** Funil da prospecção ativa (outbound). */
function FunilOutbound({ abrirConversa }: { abrirConversa: (id: string) => void }) {
  const { data: leads = [], isLoading } = useOutreachLeads();
  const { contatos } = useContatos();
  const update = useUpdateLead();
  const { showToast } = useToast();
  const [aberto, setAberto] = React.useState<OutreachLead | null>(null);

  const sdrPorFone = React.useMemo(() => new Map(contatos.map((c) => [fim8(c.phone), c.id])), [contatos]);
  const noFunil = leads.filter((l) => etapaOutbound(l) !== null);
  const porId = new Map(noFunil.map((l) => [l.place_id, l]));
  const itens: CardItem[] = noFunil.map((l) => ({
    id: l.place_id,
    titulo: l.empresa,
    sub: [l.nicho, l.cidade].filter(Boolean).join(" · "),
    quando: [l.updated_at, l.wa_sent_at].filter(Boolean).sort().pop() ?? null,
    conversa: l.whatsapp ? sdrPorFone.get(fim8(l.whatsapp)) ?? null : null,
    aviso: l.retorno_em ? `Retorno combinado: ${fmtData(l.retorno_em)}` : null,
  }));

  function mover(id: string, para: EtapaOutbound) {
    const l = porId.get(id);
    if (!l) return;
    const patch = patchOutbound(l, para);
    if (!patch) return showToast("Essa etapa é marcada sozinha quando a mensagem ou ligação sai.");
    const nome = COLUNAS_OUTBOUND.find((c) => c.key === para)?.label;
    update.mutate(
      { placeId: id, patch, descricao: `Funil: ${l.empresa} → ${nome}` },
      { onSuccess: () => showToast(`${l.empresa} → ${nome}`), onError: (e) => showToast(`Erro: ${(e as Error).message}`) },
    );
  }

  if (isLoading) return <div className="text-[13px] text-muted">Carregando o funil…</div>;
  if (!noFunil.length) return <EmptyState>Ninguém abordado ainda. Quem recebe a primeira mensagem entra aqui.</EmptyState>;
  return (
    <>
      <Quadro
        colunas={COLUNAS_OUTBOUND}
        itens={itens}
        etapa={(id) => {
          const l = porId.get(id);
          return l ? etapaOutbound(l) : null;
        }}
        mover={mover}
        abrir={(id) => setAberto(porId.get(id) ?? null)}
        abrirConversa={abrirConversa}
      />
      {aberto && <FichaLead lead={aberto} onClose={() => setAberto(null)} />}
    </>
  );
}

/** Funil inbound [anúncios]: quem chegou sozinho. */
function FunilInbound({ abrirConversa }: { abrirConversa: (id: string) => void }) {
  const { contatos, isLoading } = useContatos();
  const mudar = useEtapaInbound();
  const { showToast } = useToast();
  const inbound = contatos.filter((c) => c.tipo === "inbound");
  const porId = new Map(inbound.map((c) => [c.id, c]));
  const itens: CardItem[] = inbound.map((c) => ({
    id: c.id,
    titulo: c.nomeExibicao,
    sub: [c.origem ? ORIGEM_TEXTO[c.origem] ?? c.origem : null, c.segmento].filter(Boolean).join(" · "),
    quando: c.ultimaAtividade,
    conversa: c.id,
    aviso: c.last_inbound_at && (!c.last_outbound_at || c.last_inbound_at > c.last_outbound_at) ? "Esperando resposta nossa" : null,
  }));

  function mover(id: string, para: EtapaInbound) {
    const c = porId.get(id);
    if (!c) return;
    const nome = COLUNAS_INBOUND.find((x) => x.key === para)?.label;
    mudar.mutate(
      { id, etapa: etapaInboundParaBanco(para) },
      { onSuccess: () => showToast(`${c.nomeExibicao} → ${nome}`), onError: (e) => showToast(`Erro: ${(e as Error).message}`) },
    );
  }

  if (isLoading) return <div className="text-[13px] text-muted">Carregando o funil…</div>;
  if (!inbound.length) return <EmptyState>Nenhum contato inbound ainda. Quem chega pelo anúncio, site ou WhatsApp entra aqui.</EmptyState>;
  return (
    <Quadro
      colunas={COLUNAS_INBOUND}
      itens={itens}
      etapa={(id) => {
        const c = porId.get(id);
        return c ? etapaInbound(c) : null;
      }}
      mover={mover}
      abrir={abrirConversa}
      abrirConversa={abrirConversa}
    />
  );
}

/** Aba Funil: outbound (prospecção ativa) e inbound [anúncios], cada um com o seu Kanban. */
export function FunilKanban({ abrirConversa }: { abrirConversa: (id: string) => void }) {
  const [visao, setVisao] = React.useState<"outbound" | "inbound">("outbound");
  return (
    <div>
      <Segmented
        value={visao}
        onChange={setVisao}
        opcoes={[
          { value: "outbound", label: "Outbound · prospecção ativa" },
          { value: "inbound", label: "Inbound · anúncios" },
        ]}
      />
      {visao === "outbound" ? <FunilOutbound abrirConversa={abrirConversa} /> : <FunilInbound abrirConversa={abrirConversa} />}
    </div>
  );
}
