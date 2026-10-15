import * as React from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProjetoModal } from "@/components/shared/ProjetoModal";
import { useClientes } from "@/hooks/useClientes";
import { useProjetosCliente, type ProjetoView } from "@/hooks/useProjetos";
import { useAtividadesTodas } from "@/hooks/useAtividades";
import { useEscopo } from "@/hooks/useEscopo";
import type { EscopoEntrega } from "@/lib/types";

const statusLabels: Record<string, string> = {
  "a-fazer": "A fazer",
  andamento: "Em andamento",
  atrasado: "Atrasado",
  concluido: "Concluído",
};
const prioLabels: Record<string, string> = { urgente: "Urgente", alta: "Alta", media: "Média", baixa: "Baixa" };

function dataBR(iso: string | null) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : null;
}

function numeroEntrega(n: number) {
  return `Entrega ${String(n).padStart(2, "0")}`;
}

function clicavel(onOpen: () => void) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  } as const;
}

function CardProjeto({ p, rotulo, subtitulo, onOpen }: { p: ProjetoView; rotulo: string; subtitulo: string; onOpen: () => void }) {
  return (
    <Card
      {...clicavel(onOpen)}
      className="cursor-pointer p-[18px] pb-4 transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-primary-bright"
    >
      <div className="mb-1.5 font-mono text-[11px] text-muted">{rotulo}</div>
      <div className="mb-3.5 min-h-[38px] text-[14.5px] font-semibold leading-tight">{p.nome}</div>
      {subtitulo && <div className="-mt-2 mb-3.5 text-[13px] text-muted">{subtitulo}</div>}
      <div className="flex items-center justify-between">
        <StatusBadge status={p.status} />
        <span className="font-mono text-[11px] text-muted">Prioridade {prioLabels[p.prioridade] ?? p.prioridade}</span>
      </div>
    </Card>
  );
}

function CardTravado({ e }: { e: EscopoEntrega }) {
  return (
    <Card className="p-[18px] pb-4 opacity-50">
      <div className="mb-1.5 font-mono text-[11px] text-muted">{numeroEntrega(e.numero)}</div>
      <div className="mb-3.5 min-h-[38px] text-[14.5px] font-semibold leading-tight">{e.nome}</div>
      {e.resumo && <div className="-mt-2 mb-3.5 text-[13px] text-muted">{e.resumo}</div>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Ainda não iniciado</span>
      </div>
    </Card>
  );
}

/** Ficha do cliente: entregas do escopo (abertas = projeto real, travadas = ainda não iniciadas) + exportar PDF. */
export default function ProjetosCliente() {
  const { clienteId = "" } = useParams<{ clienteId: string }>();
  const navigate = useNavigate();
  const { data: clientes = [], isLoading: carregandoClientes } = useClientes();
  const { data: projetos = [] } = useProjetosCliente(clienteId);
  const { data: escopo = [] } = useEscopo(clienteId);
  const { data: atividades = [] } = useAtividadesTodas();
  const [abertoId, setAbertoId] = React.useState<string | null>(null);
  const [imprimindo, setImprimindo] = React.useState(false);

  const cliente = clientes.find((c) => c.id === clienteId);
  const aberto = projetos.find((p) => p.id === abertoId) ?? null;

  React.useEffect(() => {
    if (!imprimindo) return;
    const fim = () => setImprimindo(false);
    window.addEventListener("afterprint", fim);
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", fim);
    };
  }, [imprimindo]);

  if (!cliente) {
    return (
      <section>
        <BotaoVoltar onClick={() => navigate("/projetos")} />
        <div className="mt-4">
          <EmptyState>{carregandoClientes ? "Carregando..." : "Cliente não encontrado."}</EmptyState>
        </div>
      </section>
    );
  }

  const iniciais = cliente.nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const porNumero = new Map(projetos.filter((p) => p.entregaNumero).map((p) => [p.entregaNumero!, p] as [number, ProjetoView]));
  const numerosEscopo = new Set(escopo.map((e) => e.numero));
  const outros = projetos.filter((p) => !p.entregaNumero || !numerosEscopo.has(p.entregaNumero));

  const sub = [
    cliente.segmento,
    escopo.length ? cliente.contrato_resumo : null,
    escopo.length ? cliente.mensalidade : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Ordem do PDF: entregas iniciadas primeiro (pela numeração), depois os outros projetos.
  const projetosPdf = [...projetos].sort((a, b) => (a.entregaNumero ?? 999) - (b.entregaNumero ?? 999));

  return (
    <section>
      <BotaoVoltar onClick={() => navigate("/projetos")} />

      <div className="mb-[18px] mt-2.5 flex flex-wrap items-center gap-3.5">
        <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-primary-tint font-display text-base font-bold text-primary-bright">
          {iniciais}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[21px] font-semibold">{cliente.nome}</div>
          <div className="mt-1 text-[13px] text-muted">{sub}</div>
        </div>
        <Button variant="primary" onClick={() => setImprimindo(true)}>
          <Download className="h-4 w-4" />
          Exportar ficha em PDF
        </Button>
      </div>

      {escopo.length === 0 && projetos.length === 0 ? (
        <EmptyState>Nenhum projeto cadastrado ainda para este cliente.</EmptyState>
      ) : (
        <>
          {escopo.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3.5">
              {escopo.map((e) => {
                const p = porNumero.get(e.numero);
                return p ? (
                  <CardProjeto
                    key={e.id}
                    p={p}
                    rotulo={numeroEntrega(e.numero)}
                    subtitulo={p.subtitulo ?? e.resumo ?? ""}
                    onOpen={() => setAbertoId(p.id)}
                  />
                ) : (
                  <CardTravado key={e.id} e={e} />
                );
              })}
            </div>
          )}

          {outros.length > 0 && (
            <>
              {escopo.length > 0 && (
                <div className="mb-3 mt-7 text-xs font-bold uppercase tracking-[.04em] text-muted">Outros projetos</div>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3.5">
                {outros.map((p) => {
                  const b = p.briefing ?? "";
                  return (
                    <CardProjeto
                      key={p.id}
                      p={p}
                      rotulo="Projeto"
                      subtitulo={b.length > 90 ? b.slice(0, 90) + "…" : b}
                      onOpen={() => setAbertoId(p.id)}
                    />
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <ProjetoModal projeto={aberto} onOpenChange={(open) => !open && setAbertoId(null)} />

      {imprimindo &&
        createPortal(
          <div id="printArea">
            <div className="print-header">
              <div className="print-mark">
                <svg viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="15" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" opacity="0.9" />
                  <path d="M12 17 L23 24 L12 31 Z" stroke="#fff" strokeWidth="4.2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </div>
              <div className="print-brand">Demand Hub</div>
            </div>
            <div className="print-meta">
              <h2>{cliente.nome} — Acompanhamento de projetos</h2>
              <p>
                Atualizado em{" "}
                {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </p>
            </div>
            {projetosPdf.length === 0 && (
              <div className="print-section">
                <p>Nenhum projeto em andamento no momento.</p>
              </div>
            )}
            {projetosPdf.map((p) => {
              const ativs = atividades.filter((a) => a.projetoId === p.id);
              const prazo =
                p.prazoInicio || p.prazoFim
                  ? ` · ${dataBR(p.prazoInicio) ?? "a definir"} a ${dataBR(p.prazoFim) ?? "a definir"}`
                  : "";
              return (
                <div className="print-section" key={p.id}>
                  <h3>
                    {p.entregaNumero ? `${numeroEntrega(p.entregaNumero)} · ` : ""}
                    {p.nome} — {statusLabels[p.status] ?? p.status}
                    {prazo}
                  </h3>
                  {ativs.length === 0 ? (
                    <div className="print-row">
                      <span className="print-row-title">Sem atividades cadastradas ainda.</span>
                    </div>
                  ) : (
                    ativs.map((a) => (
                      <div className="print-row" key={a.id}>
                        <span className="print-row-title">{a.titulo}</span>
                        <span className="print-row-meta">
                          {statusLabels[a.status] ?? a.status} · {a.responsavelNome || "a definir"} · prazo{" "}
                          {dataBR(a.prazo) ?? "a definir"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
            <div className="print-footer">Demand Hub · acompanhamento resumido gerado automaticamente para o cliente.</div>
          </div>,
          document.body,
        )}
    </section>
  );
}

function BotaoVoltar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 py-1 text-[12.5px] font-semibold text-muted hover:text-primary-bright"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Projetos
    </button>
  );
}
