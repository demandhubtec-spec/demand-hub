import * as React from "react";
import { Instagram, Linkedin, MapPin, Megaphone, MessageCircle, Phone, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { ORIGEM_TEXTO, useContatos, useEtapaInbound, useLixeira } from "@/hooks/useCrm";
import { type OutreachLead, useOutreachLeads, useUpdateLead } from "@/hooks/useProspeccao";
import { cn } from "@/lib/utils";
import { useArrastarParaRolar } from "@/hooks/useArrastarParaRolar";
import { FichaLead } from "../prospeccao/FichaLead";
import { fmtData } from "../prospeccao/shared";
import {
  COLUNAS_INBOUND,
  COLUNAS_OUTBOUND,
  type Coluna,
  type EtapaInbound,
  type EtapaOutbound,
  COLUNAS_LIGACOES,
  COLUNAS_LISTA,
  etapaInbound,
  etapaInboundParaBanco,
  etapaOutbound,
  patchOutbound,
} from "./funis";
import { useListaLeads } from "@/hooks/useComercial";
import { FunilLista } from "./FunilLista";

export interface CardItem {
  id: string;
  titulo: string;
  sub: string;
  quando: string | null;
  conversa?: string | null;
  aviso?: string | null;
  /** Listas Instagram, LinkedIn e Ligações: nota do lead e etiqueta da rodada ou canal. */
  nota?: "Quente" | "Morno" | "Frio" | null;
  etiqueta?: string | null;
  valor?: number | null;
}

/** Quadro genérico: colunas, cards e arrastar entre colunas. Usado pelos dois funis. */
export function Quadro<K extends string>({
  colunas,
  itens,
  etapa,
  mover,
  abrir,
  abrirConversa,
  paraLixeira,
}: {
  paraLixeira?: (id: string) => void;
  colunas: readonly Coluna<K>[];
  itens: CardItem[];
  etapa: (id: string) => K | null;
  mover: (id: string, para: K) => void;
  abrir: (id: string) => void;
  abrirConversa: (id: string) => void;
}) {
  const [mostrarPerdidos, setMostrarPerdidos] = React.useState(false);
  const [sobre, setSobre] = React.useState<K | null>(null);
  const quadro = useArrastarParaRolar<HTMLDivElement>();
  const visiveis = colunas.filter((c) => !c.fim || mostrarPerdidos);
  const porColuna = (k: K) => itens.filter((i) => etapa(i.id) === k);
  const perdidos = colunas.filter((c) => c.fim).reduce((n, c) => n + porColuna(c.key).length, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[12.5px] text-muted">
        <span>Arraste o card para mudar de etapa. Segure em qualquer espaço vazio do quadro para mover a visão.</span>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={mostrarPerdidos} onChange={(e) => setMostrarPerdidos(e.target.checked)} />
          Mostrar perdidos ({perdidos})
        </label>
      </div>
      <div ref={quadro} className="flex cursor-grab select-none gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]">
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
                    className={cn(
                      "cursor-pointer rounded-[11px] border border-border bg-surface p-2.5 text-left transition-colors hover:border-primary-bright/50",
                      it.nota === "Quente" && "border-l-[3px] border-l-positive",
                      it.aviso && "border-l-[3px] border-l-attention",
                    )}
                  >
                    <div className="text-[13px] font-semibold leading-snug">{it.titulo}</div>
                    {it.sub && <div className="mt-0.5 text-[11.5px] text-muted">{it.sub}</div>}
                    {(it.nota || it.etiqueta) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {it.nota && (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              it.nota === "Quente" && "bg-positive-tint text-positive",
                              it.nota === "Morno" && "bg-attention-tint text-attention",
                              it.nota === "Frio" && "bg-surface-2 text-muted",
                            )}
                          >
                            {it.nota}
                          </span>
                        )}
                        {it.etiqueta && <span className="rounded-[5px] bg-primary-tint px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#d9cbff]">{it.etiqueta}</span>}
                      </div>
                    )}
                    {it.valor != null && it.valor > 0 && (
                      <div className="mt-1 text-[14px] font-semibold text-positive">{it.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                    )}
                    {it.aviso && <div className="mt-1 text-[11.5px] text-attention">{it.aviso}</div>}
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                      {it.quando && <span>{fmtData(it.quando)}</span>}
                      {paraLixeira && (
                        <button
                          title="Mover para a lixeira"
                          className="inline-flex items-center text-muted hover:text-negative"
                          onClick={(e) => {
                            e.stopPropagation();
                            paraLixeira(it.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
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
  const lixeira = useLixeira();
  const { showToast } = useToast();
  const [verLixeira, setVerLixeira] = React.useState(false);
  const naLixeira = contatos.filter((c) => c.tipo === "inbound" && c.lixeira_em);
  const inbound = contatos.filter((c) => c.tipo === "inbound" && !c.lixeira_em);
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

  const mandar = (ids: string[], para: boolean) =>
    lixeira.mutate(
      { ids, lixeira: para },
      {
        onSuccess: () => showToast(para ? (ids.length > 1 ? `${ids.length} cards foram para a lixeira` : "Card foi para a lixeira") : "Card restaurado"),
        onError: (e) => showToast(`Erro: ${(e as Error).message}`),
      },
    );

  if (isLoading) return <div className="text-[13px] text-muted">Carregando o funil…</div>;
  const barra = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button
        onClick={() => setVerLixeira((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[13px]",
          verLixeira ? "border-primary-bright bg-primary-tint text-ink" : "border-border bg-surface text-muted hover:text-ink",
        )}
      >
        <Trash2 className="h-3.5 w-3.5" /> Lixeira ({naLixeira.length})
      </button>
      {verLixeira && naLixeira.length > 0 && (
        <button className="text-[12.5px] text-primary-bright hover:underline" onClick={() => mandar(naLixeira.map((c) => c.id), false)}>
          Restaurar todos
        </button>
      )}
    </div>
  );
  if (verLixeira)
    return (
      <div>
        {barra}
        {!naLixeira.length ? (
          <EmptyState>A lixeira está vazia.</EmptyState>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {naLixeira.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-[11px] border border-border bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{c.nomeExibicao}</div>
                  <div className="text-[11.5px] text-muted">na lixeira desde {fmtData(c.lixeira_em!)}</div>
                </div>
                <button className="inline-flex items-center gap-1 text-[12.5px] text-primary-bright hover:underline" onClick={() => mandar([c.id], false)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  if (!inbound.length)
    return (
      <div>
        {barra}
        <EmptyState>Nenhum contato inbound ainda. Quem chega pelo anúncio, site ou WhatsApp entra aqui.</EmptyState>
      </div>
    );
  return (
    <div>
    {barra}
    <Quadro
      paraLixeira={(id) => mandar([id], true)}
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
    </div>
  );
}

type ListaFunil = "google" | "instagram" | "linkedin" | "ligacoes" | "inbound";

/**
 * Aba Funil: um Kanban por lista. Google Meu Negócio · Lista e Inbound · Anúncios seguem como já eram;
 * Instagram, LinkedIn e Ligações · Lista vêm da tabela das listas (nada é enviado sozinho para eles).
 */
export function FunilKanban({ abrirConversa }: { abrirConversa: (id: string) => void }) {
  const [visao, setVisao] = React.useState<ListaFunil>("google");
  const { data: leads = [] } = useOutreachLeads();
  const { contatos } = useContatos();
  const { data: listas = [] } = useListaLeads();
  const conta: Record<ListaFunil, number> = {
    google: leads.filter((l) => etapaOutbound(l) !== null).length,
    instagram: listas.filter((l) => l.lista === "instagram").length,
    linkedin: listas.filter((l) => l.lista === "linkedin").length,
    ligacoes: listas.filter((l) => l.lista === "ligacoes").length,
    inbound: contatos.filter((c) => c.tipo === "inbound" && !c.lixeira_em).length,
  };
  const opcoes: { k: ListaFunil; nome: string; icone: React.ComponentType<{ className?: string }> }[] = [
    { k: "google", nome: "Google Meu Negócio · Lista", icone: MapPin },
    { k: "instagram", nome: "Instagram · Lista", icone: Instagram },
    { k: "linkedin", nome: "LinkedIn · Lista", icone: Linkedin },
    { k: "ligacoes", nome: "Ligações · Lista", icone: Phone },
    { k: "inbound", nome: "Inbound · Anúncios", icone: Megaphone },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {opcoes.map((o) => {
          const Icone = o.icone;
          const vazio = o.k === "linkedin" && conta.linkedin === 0;
          return (
            <button
              key={o.k}
              onClick={() => setVisao(o.k)}
              className={cn(
                "inline-flex items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[13.5px] font-medium transition-colors",
                visao === o.k ? "border-primary-bright bg-primary-tint text-ink shadow-[0_0_22px_rgba(110,58,255,.28)]" : "border-border bg-surface text-ink/90 hover:border-primary-bright/50",
                vazio && visao !== o.k && "opacity-55",
              )}
            >
              <Icone className="h-4 w-4 text-primary-bright" />
              {o.nome}
              <span className="font-mono text-[12px] text-muted">{vazio ? "em breve" : conta[o.k]}</span>
            </button>
          );
        })}
      </div>
      {visao === "google" ? (
        <FunilOutbound abrirConversa={abrirConversa} />
      ) : visao === "inbound" ? (
        <FunilInbound abrirConversa={abrirConversa} />
      ) : (
        <FunilLista key={visao} lista={visao} colunas={visao === "ligacoes" ? COLUNAS_LIGACOES : COLUNAS_LISTA} abrirConversa={abrirConversa} />
      )}
    </div>
  );
}
