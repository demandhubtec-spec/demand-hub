import * as React from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  AlertTriangle,
  AlarmClock,
  CalendarDays,
  Users,
  FolderKanban,
  Folder,
  Sparkles,
  Contact,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { BarChart } from "@/components/shared/BarChart";
import { BreakdownBar } from "@/components/shared/BreakdownBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { NovaAtividadeModal } from "@/components/shared/NovaAtividadeModal";
import { departamentoInfo } from "@/data/departamentos";
import { useClientes } from "@/hooks/useClientes";
import { useProjetosAll } from "@/hooks/useProjetos";
import { useAtividadesTodas, type AtividadeView } from "@/hooks/useAtividades";
import { useLancamentos } from "@/hooks/useFinanceiro";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { AtividadePrioridade } from "@/lib/types";

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const pesoPrioridade: Record<AtividadePrioridade, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

const bordaPrioridade: Record<AtividadePrioridade, string> = {
  urgente: "before:bg-negative",
  alta: "before:bg-attention",
  media: "before:bg-primary-bright",
  baixa: "before:bg-muted",
};

function saudacao(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** "2026-10-30" → Date local (meia-noite), ou null. */
function parsePrazo(prazo: string | null): Date | null {
  if (!prazo) return null;
  const d = new Date(prazo.length <= 10 ? `${prazo}T00:00:00` : prazo);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatPrazo(prazo: string | null) {
  const d = parsePrazo(prazo);
  if (!d) return prazo ?? "sem prazo";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function Dashboard() {
  const { hasPrivateAccess, isColaborador, perfil } = useAuth();
  const { data: clientes = [] } = useClientes();
  const { data: projetos = [] } = useProjetosAll();
  const { data: atividades = [] } = useAtividadesTodas();
  const { data: lancamentos = [] } = useLancamentos();
  const [modalOpen, setModalOpen] = React.useState(false);

  const now = new Date();
  const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fimSemana = new Date(hoje);
  fimSemana.setDate(hoje.getDate() + (7 - hoje.getDay()));

  const primeiroNome = (perfil?.nome ?? "Kelvin").split(" ")[0];

  const clientesVisiveis = clientes.filter((c) => hasPrivateAccess || !c.privado);
  const clientesAtivos = clientesVisiveis.filter((c) => c.status === "ativo").length;
  const projetosAndamento = projetos.filter((p) => p.status === "andamento").length;

  const pendentes = atividades.filter((a) => a.status !== "concluido");
  const atrasadas = pendentes.filter((a) => {
    const d = parsePrazo(a.prazo);
    return a.status === "atrasado" || (d !== null && d < hoje);
  });
  const vencemHoje = pendentes.filter((a) => parsePrazo(a.prazo)?.getTime() === hoje.getTime());
  const estaSemana = pendentes.filter((a) => {
    const d = parsePrazo(a.prazo);
    return d !== null && d > hoje && d <= fimSemana;
  });

  const principais = [...pendentes]
    .sort((a, b) => {
      const p = pesoPrioridade[a.prioridade] - pesoPrioridade[b.prioridade];
      if (p !== 0) return p;
      const da = parsePrazo(a.prazo)?.getTime() ?? Infinity;
      const db = parsePrazo(b.prazo)?.getTime() ?? Infinity;
      return da - db;
    })
    .slice(0, 8);

  const meses6 = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (5 - i), 1));
  const faturamentoPorMes = meses6.map((d) => {
    const total = lancamentos
      .filter((l) => l.tipo === "entrada")
      .filter((l) => {
        const ld = new Date(l.dataISO + "T00:00:00");
        return ld.getFullYear() === d.getFullYear() && ld.getMonth() === d.getMonth();
      })
      .reduce((acc, l) => acc + l.valor, 0);
    return { label: MESES[d.getMonth()], value: total };
  });
  const faturamentoMesAtual = faturamentoPorMes[faturamentoPorMes.length - 1]?.value ?? 0;

  const totalProjetos = projetos.length;
  const deptKeys = ["comercial", "tecnologia", "marketing", "administrativo"] as const;
  const breakdown = deptKeys
    .map((k) => ({
      label: departamentoInfo[k].nome,
      value: projetos.filter((p) => p.departamento === k).length,
      total: totalProjetos,
    }))
    .filter((b) => b.value > 0);

  const dataCurta = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <section>
      {/* Cabeçalho do Resumo */}
      <div className="mb-6">
        <div className="eyebrow mb-2 text-primary-bright">Resumo</div>
        <h1 className="brand-h text-[clamp(40px,5.6vw,64px)]">
          {saudacao(now)}, <span className="brand-hl">{primeiroNome}</span>
        </h1>
        <p className="eyebrow mt-3 text-[11px] text-muted">
          {dataCurta} · o que está com você agora
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova atividade
          </Button>
          {!isColaborador && (
            <>
              <QuickLink to="/projetos" icon={Folder}>
                Projetos
              </QuickLink>
              <QuickLink to="/comercial/prospeccao" icon={Sparkles}>
                Prospecção ativa
              </QuickLink>
              <QuickLink to="/comercial/clientes" icon={Contact}>
                Clientes
              </QuickLink>
            </>
          )}
        </div>
      </div>

      {/* Indicadores */}
      <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Atrasadas" value={String(atrasadas.length)} accent="negative" icon={AlertTriangle} index={0} />
        <KpiCard label="Vencem hoje" value={String(vencemHoje.length)} accent="attention" icon={AlarmClock} index={1} />
        <KpiCard label="Esta semana" value={String(estaSemana.length)} accent="primary" icon={CalendarDays} index={2} />
        <KpiCard
          label="Clientes ativos"
          value={String(clientesAtivos)}
          accent="positive"
          icon={Users}
          index={3}
        />
        <KpiCard
          label="Projetos em andamento"
          value={String(projetosAndamento)}
          accent="primary"
          icon={FolderKanban}
          index={4}
        />
      </div>

      {/* Principais pendências */}
      <div className="mb-3 flex items-baseline gap-2">
        <div className="eyebrow text-[11px] text-ink">Principais pendências</div>
        <div className="text-[11.5px] text-muted">por prioridade e prazo</div>
      </div>
      {principais.length === 0 ? (
        <EmptyState>
          Nenhuma atividade pendente. Clique em "Nova atividade" para cadastrar a primeira tarefa.
        </EmptyState>
      ) : (
        <div className="mb-7 flex flex-col gap-2">
          {principais.map((a) => (
            <PendenciaRow key={a.id} a={a} hoje={hoje} />
          ))}
        </div>
      )}

      {/* Números da operação */}
      <div className="mb-3 mt-7 flex items-baseline gap-2">
        <div className="eyebrow text-[11px] text-ink">Operação</div>
        <div className="text-[11.5px] text-muted">faturamento e distribuição de projetos</div>
      </div>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-5 px-[22px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Faturamento · últimos 6 meses</div>
              <div className="mt-0.5 text-[11.5px] text-muted">Entradas totais por mês</div>
            </div>
            <div className="text-right">
              <div className="brand-num text-[26px]">
                R$ {faturamentoMesAtual.toLocaleString("pt-BR")}
              </div>
              <div className="mt-1 text-[11px] text-muted">neste mês</div>
            </div>
          </div>
          <div className="mt-[18px]">
            <BarChart data={faturamentoPorMes} formatTooltip={(v) => `R$ ${v.toLocaleString("pt-BR")}`} />
          </div>
        </Card>
        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Projetos por departamento</div>
          <div className="mb-[18px] mt-0.5 text-[11.5px] text-muted">{totalProjetos} projetos no total</div>
          {breakdown.length === 0 ? (
            <EmptyState>Nenhum projeto cadastrado ainda.</EmptyState>
          ) : (
            <BreakdownBar items={breakdown} />
          )}
        </Card>
      </div>

      <NovaAtividadeModal open={modalOpen} onOpenChange={setModalOpen} />
    </section>
  );
}

function QuickLink({
  to,
  icon: Icon,
  children,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="eyebrow inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-[10px] text-[10.5px] text-ink backdrop-blur transition-colors hover:border-primary-bright/60 hover:text-primary-bright"
    >
      <Icon className="h-[14px] w-[14px]" />
      {children}
    </Link>
  );
}

function PendenciaRow({ a, hoje }: { a: AtividadeView; hoje: Date }) {
  const d = parsePrazo(a.prazo);
  const ehHoje = d?.getTime() === hoje.getTime();
  const atrasada = a.status === "atrasado" || (d !== null && d < hoje);
  const dept = a.departamento ? departamentoInfo[a.departamento].nome : "Geral";
  const meta = [dept, a.contexto, a.responsavelNome ? `resp. ${a.responsavelNome}` : null, `prazo ${formatPrazo(a.prazo)}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      to={a.departamento ? `/${a.departamento}/atividades` : "/"}
      className={cn(
        "sheen group relative flex items-center gap-3 overflow-hidden rounded-[14px] border border-border bg-surface py-3 pl-5 pr-4 transition-colors hover:border-primary-bright/40",
        "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-[3px]",
        bordaPrioridade[a.prioridade],
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{a.titulo}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted">{meta}</div>
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {atrasada && (
          <span className="rounded-md bg-negative-tint px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-wide text-negative">
            atrasada
          </span>
        )}
        {ehHoje && !atrasada && (
          <span className="rounded-md bg-attention-tint px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-wide text-attention">
            hoje
          </span>
        )}
        <span className="rounded-full border border-border px-2.5 py-[3px]">
          <StatusBadge status={a.status} />
        </span>
        <PriorityBadge prioridade={a.prioridade} />
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary-bright" />
    </Link>
  );
}
