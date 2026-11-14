import * as React from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Download } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";
import { AcompanhamentoCliente } from "@/components/shared/AcompanhamentoCliente";
import { faseLabel } from "@/lib/fases";
import { diaMes, estaAtrasada } from "@/lib/prazo";
import { AtrasadaBadge } from "@/components/shared/AtrasadaBadge";
import { areaInfo, rotuloEntrega } from "@/lib/areas";

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

function numeroEntrega(n: number, rotulo?: string | null) {
  return rotuloEntrega(n, rotulo);
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

const COLS = "md:grid md:grid-cols-[minmax(0,1fr)_120px_150px_150px_130px] md:items-center md:gap-4";

function Cabecalho() {
  return (
    <div className={`hidden border-b border-border px-[18px] py-2.5 text-[12px] font-medium text-muted ${COLS}`}>
      <span>Entrega</span>
      <span>Fase</span>
      <span>Etapas</span>
      <span>Prazo</span>
      <span>Status</span>
    </div>
  );
}

function LinhaProjeto({
  p,
  rotulo,
  subtitulo,
  feitas,
  total,
  onOpen,
}: {
  p: ProjetoView;
  rotulo: string;
  subtitulo: string;
  feitas: number;
  total: number;
  onOpen: () => void;
}) {
  const atrasada = estaAtrasada(p.prazoFim, p.status);
  const pct = total ? Math.round((feitas / total) * 100) : 0;
  return (
    <div
      {...clicavel(onOpen)}
      className={`flex cursor-pointer flex-col gap-2.5 border-b border-border px-[18px] py-3.5 transition-colors last:border-b-0 hover:bg-surface-2/60 ${COLS}`}
    >
      <div className="min-w-0">
        <div className="mb-0.5 tabular-nums text-[12px] text-muted">{rotulo}</div>
        <div className="text-[14px] font-semibold leading-tight">{p.nome}</div>
        {subtitulo && <div className="mt-0.5 truncate text-[13px] text-muted">{subtitulo}</div>}
      </div>
      <div>
        {p.fase ? (
          <span className="rounded-full bg-primary-tint px-2 py-0.5 tabular-nums text-[12px] font-semibold text-primary-bright">
            {faseLabel[p.fase] ?? p.fase}
          </span>
        ) : (
          <span className="tabular-nums text-[12px] text-muted">Não iniciada</span>
        )}
      </div>
      <div>
        {total ? (
          <>
            <div className="mb-1 tabular-nums text-[12px] text-muted">
              {feitas}/{total} feitas
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <span className="tabular-nums text-[12px] text-muted">Sem etapas</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 tabular-nums text-[12px]">
        <span className={atrasada ? "text-negative" : "text-muted"}>
          {p.prazoInicio || p.prazoFim ? `${diaMes(p.prazoInicio)} a ${diaMes(p.prazoFim)}` : "a definir"}
        </span>
        {atrasada && <AtrasadaBadge />}
      </div>
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={p.status} />
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
      </div>
    </div>
  );
}

function LinhaTravada({ e }: { e: EscopoEntrega }) {
  return (
    <div className={`flex flex-col gap-1 border-b border-border px-[18px] py-3.5 opacity-50 last:border-b-0 ${COLS}`}>
      <div className="min-w-0">
        <div className="mb-0.5 tabular-nums text-[12px] text-muted">{numeroEntrega(e.numero, e.rotulo)}</div>
        <div className="text-[14px] font-semibold leading-tight">{e.nome}</div>
        {e.resumo && <div className="mt-0.5 truncate text-[13px] text-muted">{e.resumo}</div>}
      </div>
      <span className="tabular-nums text-[12px] text-muted">Não iniciada</span>
      <span />
      <span className="tabular-nums text-[12px] text-muted">a definir</span>
      <span className="text-[12px] text-muted">Ainda não iniciado</span>
    </div>
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
  const { isColaborador } = useAuth();

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
  const contar = (projetoId: string) => {
    const ativs = atividades.filter((a) => a.projetoId === projetoId);
    return { total: ativs.length, feitas: ativs.filter((a) => a.status === "concluido").length };
  };

  // Só o segmento: tipo de contrato e valor não aparecem na ficha (ela é mostrada ao cliente).
  const sub = cliente.segmento ?? "";

  // Entregas agrupadas pela área do cliente (quando o escopo tem área definida).
  const escopoPorNumero = new Map(escopo.map((e) => [e.numero, e] as [number, EscopoEntrega]));
  const gruposEscopo: { area: string | null; itens: EscopoEntrega[] }[] = [];
  for (const e of escopo) {
    const area = e.area ?? null;
    const g = gruposEscopo.find((x) => x.area === area);
    if (g) g.itens.push(e);
    else gruposEscopo.push({ area, itens: [e] });
  }
  const temAreas = escopo.some((e) => e.area);
  const rotuloDe = (n: number | null) => {
    if (!n) return "";
    const e = escopoPorNumero.get(n);
    return numeroEntrega(n, e?.rotulo);
  };

  // Ordem do PDF: a mesma do escopo (por área), depois os outros projetos.
  const ordemPdf = (p: ProjetoView) => {
    if (!p.entregaNumero) return 9999;
    const e = escopoPorNumero.get(p.entregaNumero);
    return e?.ordem ?? p.entregaNumero;
  };
  const projetosPdf = [...projetos].sort((a, b) => ordemPdf(a) - ordemPdf(b));

  return (
    <section>
      <BotaoVoltar onClick={() => navigate("/projetos")} />

      <div className="mb-[18px] mt-2.5 flex flex-wrap items-center gap-3.5">
        <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-primary-tint font-display text-[16px] font-bold text-primary-bright">
          {iniciais}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[20px] font-semibold">{cliente.nome}</div>
          <div className="mt-1 text-[13px] text-muted">{sub}</div>
        </div>
        {!isColaborador && <AcompanhamentoCliente clienteId={cliente.id} clienteNome={cliente.nome} projetos={projetos} />}
        <Button variant="primary" onClick={() => setImprimindo(true)}>
          <Download className="h-4 w-4" />
          Exportar ficha em PDF
        </Button>
      </div>

      {escopo.length === 0 && projetos.length === 0 ? (
        <EmptyState>Nenhum projeto cadastrado ainda para este cliente.</EmptyState>
      ) : (
        <>
          {gruposEscopo.map((g, gi) => (
            <React.Fragment key={g.area ?? "sem-area"}>
              {temAreas && (
                <div className={`mb-3 flex items-center gap-2 text-[12px] font-bold tracking-[.04em] text-muted ${gi ? "mt-7" : ""}`}>
                  {(() => {
                    const info = areaInfo(g.area);
                    const Icone = info.icone;
                    return (
                      <>
                        <span className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-primary-tint text-primary-bright">
                          <Icone className="h-3.5 w-3.5" />
                        </span>
                        {info.nome}
                      </>
                    );
                  })()}
                </div>
              )}
              <Card className="overflow-hidden p-0">
                <Cabecalho />
                {g.itens.map((e) => {
                  const p = porNumero.get(e.numero);
                  return p ? (
                    <LinhaProjeto
                      key={e.id}
                      p={p}
                      rotulo={numeroEntrega(e.numero, e.rotulo)}
                      subtitulo={p.subtitulo ?? e.resumo ?? ""}
                      feitas={contar(p.id).feitas}
                      total={contar(p.id).total}
                      onOpen={() => setAbertoId(p.id)}
                    />
                  ) : (
                    <LinhaTravada key={e.id} e={e} />
                  );
                })}
              </Card>
            </React.Fragment>
          ))}

          {outros.length > 0 && (
            <>
              {escopo.length > 0 && (
                <div className="mb-3 mt-7 text-[12px] font-bold tracking-[.04em] text-muted">Outros projetos</div>
              )}
              <Card className="overflow-hidden p-0">
                <Cabecalho />
                {outros.map((p) => {
                  const b = p.briefing ?? "";
                  return (
                    <LinhaProjeto
                      key={p.id}
                      p={p}
                      rotulo="Projeto"
                      subtitulo={b.length > 110 ? b.slice(0, 110) + "…" : b}
                      feitas={contar(p.id).feitas}
                      total={contar(p.id).total}
                      onOpen={() => setAbertoId(p.id)}
                    />
                  );
                })}
              </Card>
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
              <h2>{cliente.nome} · Acompanhamento de projetos</h2>
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
                    {p.entregaNumero ? `${rotuloDe(p.entregaNumero)} · ` : ""}
                    {p.nome} · {p.fase ? faseLabel[p.fase] : statusLabels[p.status] ?? p.status}
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
      className="inline-flex items-center gap-1 py-1 text-[13px] font-semibold text-muted hover:text-primary-bright"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Projetos
    </button>
  );
}
