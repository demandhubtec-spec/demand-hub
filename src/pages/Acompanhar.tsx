import * as React from "react";
import { useParams } from "react-router-dom";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  FlaskConical,
  Hammer,
  MessageSquare,
  PartyPopper,
  RefreshCw,
  Send,
  Wrench,
} from "lucide-react";
import { BrandLogo } from "@/components/layout/Logo";
import {
  useAcompanhamentoPublico,
  useComentarPublico,
  type ComentarioCliente,
  type EntregaPublica,
} from "@/hooks/useAcompanhamento";
import { FASES, faseIndice, faseLabel } from "@/lib/fases";
import { AREAS, OUTRAS, areaInfo, ehDefinicao, rotuloEntrega, type AreaInfo } from "@/lib/areas";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Página pública de acompanhamento (sem login): portal.demandhub.com.br/acompanhar/<token>
// Entregas agrupadas por área (departamento do portal do cliente), com as atividades de cada uma.
// ---------------------------------------------------------------------------

const hojeISO = () => new Date().toLocaleDateString("en-CA");

function dataCurta(iso: string | null) {
  if (!iso) return "a definir";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function dataLonga(iso: string | null) {
  if (!iso) return "a definir";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function quando(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

type Situacao = "concluida" | "andamento" | "atrasada" | "proxima";

function situacao(e: EntregaPublica): Situacao {
  if (e.status === "concluido" || e.fase === "concluido") return "concluida";
  const total = e.atividades.length;
  if (total && e.atividades.every((a) => a.status === "concluido")) return "concluida";
  if (e.fim && e.fim < hojeISO()) return "atrasada";
  if (e.fase || e.status === "andamento" || e.atividades.some((a) => a.status === "andamento")) return "andamento";
  return "proxima";
}

const situacaoInfo: Record<Situacao, { label: string; cls: string }> = {
  concluida: { label: "Concluída", cls: "bg-positive-tint text-positive" },
  andamento: { label: "Em andamento", cls: "bg-primary-tint text-primary-bright" },
  atrasada: { label: "Prazo vencido", cls: "bg-attention-tint text-attention" },
  proxima: { label: "Próxima", cls: "bg-surface-2 text-muted" },
};

const FASE_TEXTO: Record<string, { texto: string; icone: typeof Hammer }> = {
  implementacao: { texto: "A gente constrói.", icone: Hammer },
  teste: { texto: "A equipe usa com dados reais.", icone: FlaskConical },
  correcao: { texto: "Ajustamos o que apareceu no teste.", icone: Wrench },
  aprovacao: { texto: "O cliente confere e aprova.", icone: BadgeCheck },
  concluido: { texto: "Entregue e em uso.", icone: PartyPopper },
};

const CHAVE_NOME = "demandia-acompanhar-nome";

interface Grupo {
  area: AreaInfo;
  entregas: EntregaPublica[];
}

function agrupar(entregas: EntregaPublica[]): Grupo[] {
  const temArea = entregas.some((e) => e.area);
  if (!temArea) return [{ area: OUTRAS, entregas }];
  const grupos: Grupo[] = [];
  for (const e of entregas) {
    const info = areaInfo(e.area);
    let g = grupos.find((x) => x.area.id === info.id);
    if (!g) {
      g = { area: info, entregas: [] };
      grupos.push(g);
    }
    g.entregas.push(e);
  }
  const ordem = (id: string) => {
    const i = AREAS.findIndex((a) => a.id === id);
    return i < 0 ? 99 : i;
  };
  return grupos.sort((a, b) => ordem(a.area.id) - ordem(b.area.id));
}

function contar(entregas: EntregaPublica[]) {
  let total = 0;
  let feitas = 0;
  for (const e of entregas) {
    total += e.atividades.length;
    feitas += e.atividades.filter((a) => a.status === "concluido").length;
  }
  return { total, feitas, pct: total ? Math.round((feitas / total) * 100) : 0 };
}

/** Número da entrega no contrato (09.1 conta como parte da 09). */
function numeroBase(e: EntregaPublica) {
  return e.rotulo ? e.rotulo.split(".")[0] : String(e.numero).padStart(2, "0");
}

export default function Acompanhar() {
  const { token = "" } = useParams<{ token: string }>();
  const { data, isLoading, isError, dataUpdatedAt, refetch, isFetching } = useAcompanhamentoPublico(token);
  const [filtro, setFiltro] = React.useState<"todas" | Situacao>("todas");
  const [areaSel, setAreaSel] = React.useState<string>("todas");
  const listaRef = React.useRef<HTMLDivElement>(null);
  const [nome, setNome] = React.useState(() => {
    try {
      return localStorage.getItem(CHAVE_NOME) ?? "";
    } catch {
      return "";
    }
  });

  React.useEffect(() => {
    if (data?.cliente) document.title = `${data.cliente.nome} · Acompanhamento · DemandIA`;
  }, [data?.cliente]);

  const salvarNome = (n: string) => {
    setNome(n);
    try {
      localStorage.setItem(CHAVE_NOME, n);
    } catch {
      /* navegador sem armazenamento: segue só nesta visita */
    }
  };

  if (isLoading) return <Tela>Carregando o cronograma…</Tela>;
  if (isError) return <Tela>Não foi possível carregar agora. Tente de novo em alguns instantes.</Tela>;
  if (!data)
    return (
      <Tela>
        Este link não está mais ativo.
        <br />
        Peça um link novo para a equipe da Demand.
      </Tela>
    );

  const entregas = data.entregas;
  const grupos = agrupar(entregas);
  const porArea = grupos.length > 1;
  const geral = contar(entregas);
  const comSit = entregas.map((e) => ({ e, s: situacao(e) }));
  const nAndamento = comSit.filter((x) => x.s === "andamento" || x.s === "atrasada").length;
  const nConcluidas = comSit.filter((x) => x.s === "concluida").length;
  const nProximas = comSit.filter((x) => x.s === "proxima").length;
  const nContrato = new Set(entregas.map(numeroBase)).size;
  const abertas = entregas.filter((e) => situacao(e) !== "concluida" && e.fim).sort((a, b) => a.fim!.localeCompare(b.fim!));
  const proximaEntrega = abertas[0];
  const fimPrevisto = entregas.reduce<string | null>((m, e) => (e.fim && (!m || e.fim > m) ? e.fim : m), null);
  const gerais = data.comentarios.filter((c) => !c.projeto_id);
  const paineis = entregas.filter((e) => e.painel);

  const grupoSel = grupos.find((g) => g.area.id === areaSel) ?? null;
  const gruposVisiveis = grupoSel ? [grupoSel] : grupos;
  const base = gruposVisiveis.flatMap((g) => g.entregas);
  const cont = {
    todas: base.length,
    andamento: base.filter((e) => ["andamento", "atrasada"].includes(situacao(e))).length,
    proxima: base.filter((e) => situacao(e) === "proxima").length,
    concluida: base.filter((e) => situacao(e) === "concluida").length,
  };
  const passa = (e: EntregaPublica) => {
    const s = situacao(e);
    return filtro === "todas" || s === filtro || (filtro === "andamento" && s === "atrasada");
  };

  function escolherArea(id: string) {
    setAreaSel((atual) => (atual === id ? "todas" : id));
    setFiltro("todas");
    setTimeout(() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(900px_500px_at_85%_-10%,rgba(110,58,255,.28),transparent_60%)]">
      <div className="mx-auto max-w-[1040px] px-4 pb-16 pt-6 sm:px-6">
        {/* Topo */}
        <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <BrandLogo height={28} />
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 tabular-nums text-[12px] text-muted hover:text-ink"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
            </span>
            Ao vivo · atualizado {new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </button>
        </header>

        <div className="mb-2 text-[12px] text-primary-bright">
          Acompanhamento do projeto
        </div>
        <h1 className="text-[28px] leading-none sm:text-[46px]">{data.cliente.nome}</h1>
        <p className="mt-3 max-w-[620px] text-[14px] text-muted">
          {porArea
            ? "O projeto separado por departamento: cada entrega mostra o que já foi feito e o que vem a seguir."
            : "Cada entrega mostra o que já foi feito e o que vem a seguir."}
        </p>

        {/* Resumo */}
        <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Numero
            rotulo="Atividades feitas"
            valor={`${geral.feitas}/${geral.total}`}
            detalhe={porArea ? `${nContrato} entregas · ${grupos.length} áreas` : `${entregas.length} entregas`}
          />
          <Numero rotulo="Em andamento" valor={String(nAndamento)} detalhe={`${nConcluidas} concluídas · ${nProximas} próximas`} />
          <Numero
            rotulo="Próximo prazo"
            valor={proximaEntrega ? dataCurta(proximaEntrega.fim) : "—"}
            detalhe={proximaEntrega ? `${rotuloEntrega(proximaEntrega.numero, proximaEntrega.rotulo).replace("Entrega ", "")} · ${proximaEntrega.nome}` : undefined}
          />
          <Numero rotulo="Conclusão prevista" valor={fimPrevisto ? dataCurta(fimPrevisto) : "—"} detalhe={fimPrevisto?.slice(0, 4)} />
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="font-semibold">Andamento geral</span>
            <span className="tabular-nums text-primary-bright">{geral.pct}%</span>
          </div>
          <Barra pct={geral.pct} />
        </div>

        {/* Fases */}
        <div className="mt-3 rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 text-[12px] text-primary-bright">As fases de cada entrega</div>
          <ol className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
            {FASES.map((f, i) => {
              const info = FASE_TEXTO[f.value];
              const Icone = info?.icone ?? Check;
              return (
                <li key={f.value} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="tabular-nums text-[12px] font-bold text-primary-bright">{i + 1}.</span>
                    <span className="text-[13px] font-semibold">{f.label}</span>
                    <Icone className="ml-auto h-3.5 w-3.5 text-primary-bright" />
                  </div>
                  <div className="text-[12px] leading-snug text-muted">{info?.texto}</div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Como o portal é montado */}
        {porArea && (
          <div className="mt-8 grid items-center gap-5 overflow-hidden rounded-2xl border border-border bg-surface p-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
            <div>
              <div className="mb-1.5 text-[12px] text-primary-bright">Como o portal é montado</div>
              <h3 className="text-[20px] leading-tight">Uma base e um painel por área</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted">
                <li>
                  A <b className="font-semibold text-ink">base</b> é igual para todos: acesso, menu e integrações.
                </li>
                <li>
                  Cada <b className="font-semibold text-ink">departamento</b> tem as suas telas e o seu painel de indicadores.
                </li>
                <li>
                  Os indicadores de cada painel são <b className="font-semibold text-ink">definidos com vocês</b> antes de construir.
                </li>
              </ul>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              {grupos
                .filter((g) => g.area.id !== "portal")
                .map((g) => {
                  const Icone = g.area.icone;
                  const painel = g.entregas.find((e) => e.painel);
                  return (
                    <div key={g.area.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px]">
                      <IconeArea Icone={Icone} pequeno />
                      {g.area.nome}
                      <span className="ml-auto min-w-0 truncate tabular-nums text-[12px] text-muted">
                        {painel ? (/^painel/i.test(painel.nome) ? painel.nome : `Painel ${g.area.nome.toLowerCase()}`) : "telas da área"}
                      </span>
                    </div>
                  );
                })}
              <div className="flex items-center gap-2.5 rounded-xl border border-[rgba(110,58,255,.5)] bg-gradient-to-r from-[rgba(110,58,255,.35)] to-[rgba(110,58,255,.1)] px-3 py-2 text-[13px]">
                <IconeArea Icone={areaInfo("portal").icone} pequeno />
                <b className="shrink-0">Base do portal</b>
                <span className="ml-auto min-w-0 truncate tabular-nums text-[12px] text-muted">
                  {paineis.some((e) => e.area === "portal") ? "acesso · menu · integrações · painel geral" : "acesso · menu · integrações"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Departamentos */}
        {porArea && (
          <>
            <div className="mb-2.5 mt-8 text-[12px] text-primary-bright">Departamentos do portal</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {grupos.map((g) => {
                const c = contar(g.entregas);
                const ativo = areaSel === g.area.id;
                return (
                  <button
                    key={g.area.id}
                    type="button"
                    onClick={() => escolherArea(g.area.id)}
                    className={cn(
                      "rounded-2xl border bg-surface p-4 text-left transition-all hover:-translate-y-px hover:border-[rgba(164,123,255,.45)]",
                      ativo ? "border-primary shadow-[0_0_0_1px_var(--primary),0_10px_30px_-12px_rgba(110,58,255,.6)]" : "border-border",
                    )}
                  >
                    <div className="flex items-center gap-2.5 text-[14px] font-semibold leading-tight">
                      <IconeArea Icone={g.area.icone} />
                      {g.area.nome}
                    </div>
                    <div className="mb-2 mt-3 flex justify-between tabular-nums text-[12px] text-muted">
                      <span>
                        {g.entregas.length} {g.entregas.length === 1 ? "entrega" : "entregas"}
                      </span>
                      <span>{c.pct}%</span>
                    </div>
                    <Barra pct={c.pct} fina />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Lista */}
        <div ref={listaRef} className="mb-3 mt-10 flex scroll-mt-4 flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-3 text-[28px] leading-tight">
              {grupoSel && <IconeArea Icone={grupoSel.area.icone} grande />}
              {grupoSel ? grupoSel.area.nome : "Todas as entregas"}
            </h2>
            <p className="mt-1.5 max-w-[640px] text-[13px] text-muted">
              {grupoSel ? grupoSel.area.desc : porArea ? "Agrupadas pelo departamento do portal. Toque em um departamento acima para ver só ele." : "Todas as entregas do escopo."}
              {grupoSel && (
                <>
                  {" "}
                  <button type="button" onClick={() => setAreaSel("todas")} className="text-primary-bright underline">
                    Ver todos os departamentos
                  </button>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["todas", `Todas (${cont.todas})`],
                ["andamento", `Em andamento (${cont.andamento})`],
                ["proxima", `Próximas (${cont.proxima})`],
                ["concluida", `Concluídas (${cont.concluida})`],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setFiltro(v)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  filtro === v ? "border-primary bg-primary text-white" : "border-border bg-surface text-muted hover:text-ink",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          {gruposVisiveis.every((g) => g.entregas.filter(passa).length === 0) && (
            <div className="rounded-2xl border border-border bg-surface p-6 text-center text-[14px] text-muted">Nenhuma entrega neste filtro.</div>
          )}
          {gruposVisiveis.map((g) => {
            const lista = g.entregas.filter(passa);
            if (!lista.length) return null;
            return (
              <div key={g.area.id}>
                {porArea && !grupoSel && (
                  <div className="mb-2.5 mt-6 flex items-center gap-2 text-[12px] text-primary-bright">
                    <IconeArea Icone={g.area.icone} pequeno />
                    {g.area.nome}
                  </div>
                )}
                <div className="space-y-2.5">
                  {lista.map((e) => (
                    <CardEntrega
                      key={e.numero}
                      e={e}
                      s={situacao(e)}
                      token={token}
                      nome={nome}
                      onNome={salvarNome}
                      comentarios={data.comentarios.filter((c) => e.projeto_id && c.projeto_id === e.projeto_id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Comentários gerais */}
        <section className="mt-10 rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-1 flex items-center gap-2 text-[16px]">
            <MessageSquare className="h-4 w-4 text-primary-bright" />
            Recados para a equipe
          </h3>
          <p className="mb-4 text-[13px] text-muted">Dúvidas ou pedidos que não são de uma entrega específica.</p>
          <Conversa comentarios={gerais} />
          <CaixaComentario token={token} projetoId={null} nome={nome} onNome={salvarNome} />
        </section>

        <footer className="mt-10 text-center tabular-nums text-[12px] text-muted">
          DemandIA · Demand Hub · prazos estimados, podem mudar conforme os testes e as aprovações
        </footer>
      </div>
    </div>
  );
}

function Tela({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center text-[14px] text-muted">
      <BrandLogo height={30} />
      <div>{children}</div>
    </div>
  );
}

function Barra({ pct, fina }: { pct: number; fina?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-full bg-surface-2", fina ? "h-1.5" : "h-2")}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#5A28E0] via-[#8B5BFF] to-[#C9B0FF] transition-[width] duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function IconeArea({ Icone, pequeno, grande }: { Icone: AreaInfo["icone"]; pequeno?: boolean; grande?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-primary-tint text-primary-bright",
        pequeno ? "h-6 w-6 rounded-[8px]" : grande ? "h-10 w-10 rounded-xl" : "h-8 w-8 rounded-[8px]",
      )}
    >
      <Icone className={pequeno ? "h-3.5 w-3.5" : grande ? "h-5 w-5" : "h-4 w-4"} />
    </span>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-[12px] text-muted">{rotulo}</div>
      <div className="mt-1 font-display text-[28px] font-extrabold leading-none [font-stretch:75%]">{valor}</div>
      {detalhe && <div className="mt-1.5 truncate text-[12px] text-muted">{detalhe}</div>}
    </div>
  );
}

function Etapas({ fase }: { fase: string | null }) {
  const atual = faseIndice(fase);
  return (
    <div className="flex items-center">
      {FASES.map((f, i) => {
        const feito = i < atual || fase === "concluido";
        const agora = i === atual && fase !== "concluido";
        return (
          <React.Fragment key={f.value}>
            {i > 0 && <div className={cn("h-[2px] flex-1", i <= atual ? "bg-primary" : "bg-surface-2")} />}
            <div className="flex flex-col items-center gap-1" title={f.label}>
              <div
                className={cn(
                  "flex h-[18px] w-[18px] items-center justify-center rounded-full border-2",
                  feito && "border-primary bg-primary text-white",
                  agora && "border-primary-bright bg-primary-tint shadow-[0_0_12px_rgba(164,123,255,.6)]",
                  !feito && !agora && "border-muted/40 bg-surface",
                )}
              >
                {feito && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                {agora && <span className="h-1.5 w-1.5 rounded-full bg-primary-bright" />}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CardEntrega({
  e,
  s,
  token,
  nome,
  onNome,
  comentarios,
}: {
  e: EntregaPublica;
  s: Situacao;
  token: string;
  nome: string;
  onNome: (n: string) => void;
  comentarios: ComentarioCliente[];
}) {
  const [aberto, setAberto] = React.useState(false);
  const info = situacaoInfo[s];
  const feitas = e.atividades.filter((a) => a.status === "concluido").length;
  const definir = e.atividades.some((a) => a.status !== "concluido" && ehDefinicao(a.titulo));

  return (
    <article
      className={cn(
        "rounded-2xl border bg-surface transition-colors",
        aberto ? "border-[rgba(110,58,255,.55)]" : "border-border hover:border-[rgba(164,123,255,.45)]",
      )}
    >
      <button type="button" onClick={() => setAberto((v) => !v)} className="w-full p-4 text-left sm:p-5">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-[12px] text-muted">{rotuloEntrega(e.numero, e.rotulo)}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", info.cls)}>{info.label}</span>
              {e.painel && (
                <span className="rounded-full border border-[rgba(164,123,255,.45)] px-2 py-0.5 text-[12px] font-semibold text-primary-bright">
                  Painel de indicadores
                </span>
              )}
              {definir && (
                <span className="rounded-full bg-attention-tint px-2 py-0.5 text-[12px] font-semibold text-attention">Definir juntos</span>
              )}
              {comentarios.length > 0 && (
                <span className="inline-flex items-center gap-1 tabular-nums text-[12px] text-muted">
                  <MessageSquare className="h-3 w-3" />
                  {comentarios.length}
                </span>
              )}
            </div>
            <div className="text-[16px] font-semibold leading-snug">{e.nome}</div>
            {e.resumo && <div className="mt-0.5 text-[13px] text-muted">{e.resumo}</div>}
          </div>
          <div className="text-right">
            <div className="tabular-nums text-[12px] text-muted">Prazo</div>
            <div className="text-[13px] font-semibold">{e.inicio || e.fim ? `${dataCurta(e.inicio)} a ${dataCurta(e.fim)}` : "a definir"}</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <Etapas fase={e.fase} />
            <div className="mt-1 hidden justify-between tabular-nums text-[12px] text-muted sm:flex">
              {FASES.map((f) => (
                <span key={f.value} className={cn("w-0 whitespace-nowrap", f.value === e.fase && "font-bold text-primary-bright")}>
                  <span className={cn("inline-block", f.value === "implementacao" ? "" : f.value === "concluido" ? "-translate-x-full" : "-translate-x-1/2")}>
                    {f.label}
                  </span>
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between tabular-nums text-[12px] text-muted sm:mt-2">
              <span>{e.fase ? `Fase: ${faseLabel[e.fase]}` : "Ainda não iniciada"}</span>
              {e.atividades.length > 0 && (
                <span>
                  {feitas}/{e.atividades.length} atividades feitas
                </span>
              )}
            </div>
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", aberto && "rotate-180")} />
        </div>
      </button>

      {aberto && (
        <div className="border-t border-border px-4 pb-5 pt-4 sm:px-5">
          {e.aviso && (
            <div className="mb-4 rounded-xl border border-[rgba(255,179,92,.25)] bg-attention-tint px-3 py-2.5 text-[13px] leading-relaxed text-attention">
              {e.aviso}
            </div>
          )}
          {e.briefing && <p className="mb-4 text-[13px] leading-relaxed text-ink/90">{e.briefing}</p>}

          {e.atividades.length > 0 && (
            <ul className="mb-5">
              {e.atividades.map((a) => {
                const def = a.status !== "concluido" && ehDefinicao(a.titulo);
                const feito = a.status === "concluido";
                const futuro = a.prazo && a.prazo > hojeISO();
                return (
                  <li key={a.id} className="flex items-start gap-2.5 border-b border-dashed border-border py-1.5 text-[13px] last:border-b-0">
                    <span
                      className={cn(
                        "mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        feito
                          ? "border-positive bg-positive text-[#0b0420]"
                          : a.status === "andamento"
                            ? "border-primary-bright"
                            : def
                              ? "border-attention"
                              : "border-muted/50",
                      )}
                    >
                      {feito && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                      {a.status === "andamento" && <span className="h-1.5 w-1.5 rounded-full bg-primary-bright" />}
                    </span>
                    <span className={cn("flex-1", feito && "text-muted")}>{a.titulo}</span>
                    <span className="shrink-0 tabular-nums text-[12px] text-muted">
                      {feito
                        ? futuro || !a.prazo
                          ? "feito"
                          : `feito · ${dataCurta(a.prazo)}`
                        : def
                          ? a.prazo
                            ? `conversa · ${dataCurta(a.prazo)}`
                            : "conversa a marcar"
                          : a.status === "andamento"
                            ? `em andamento${a.prazo ? ` · ${dataCurta(a.prazo)}` : ""}`
                            : dataCurta(a.prazo)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mb-2 text-[12px] font-bold tracking-[.05em] text-muted">Comentários</div>
          {e.projeto_id ? (
            <>
              <Conversa comentarios={comentarios} />
              <CaixaComentario token={token} projetoId={e.projeto_id} nome={nome} onNome={onNome} />
            </>
          ) : (
            <p className="text-[13px] text-muted">
              Os comentários abrem quando esta entrega começar. Até lá, use os recados no fim da página.
            </p>
          )}
          <div className="mt-3 tabular-nums text-[12px] text-muted">Previsão de conclusão: {dataLonga(e.fim)}</div>
        </div>
      )}
    </article>
  );
}

function Conversa({ comentarios }: { comentarios: ComentarioCliente[] }) {
  if (comentarios.length === 0) return null;
  return (
    <div className="mb-3 space-y-2">
      {comentarios.map((c) => (
        <div
          key={c.id}
          className={cn(
            "rounded-xl px-3 py-2.5 text-[13px]",
            c.autor_tipo === "equipe" ? "mr-6 border border-[rgba(110,58,255,.3)] bg-primary-tint" : "ml-6 bg-surface-2",
          )}
        >
          <div className="mb-0.5 flex justify-between gap-2">
            <span className="text-[12px] font-bold text-primary-bright">{c.autor_nome}</span>
            <span className="tabular-nums text-[12px] text-muted">{quando(c.criado_em)}</span>
          </div>
          <div className="whitespace-pre-wrap break-words">{c.texto}</div>
        </div>
      ))}
    </div>
  );
}

function CaixaComentario({
  token,
  projetoId,
  nome,
  onNome,
}: {
  token: string;
  projetoId: string | null;
  nome: string;
  onNome: (n: string) => void;
}) {
  const comentar = useComentarPublico(token);
  const [texto, setTexto] = React.useState("");
  const [nomeLocal, setNomeLocal] = React.useState(nome);
  const [erro, setErro] = React.useState("");
  React.useEffect(() => setNomeLocal(nome), [nome]);

  async function enviar() {
    const t = texto.trim();
    const n = nomeLocal.trim();
    if (!n) return setErro("Escreva seu nome para a equipe saber quem comentou.");
    if (!t) return;
    setErro("");
    try {
      await comentar.mutateAsync({ projetoId, nome: n, texto: t });
      onNome(n);
      setTexto("");
    } catch (err) {
      const msg = String((err as { message?: string })?.message ?? "");
      setErro(
        msg.includes("limite_por_hora")
          ? "Muitos comentários em pouco tempo. Tente de novo daqui a pouco."
          : "Não foi possível enviar agora. Tente de novo.",
      );
    }
  }

  return (
    <div className="space-y-2">
      {!nome && (
        <input
          value={nomeLocal}
          onChange={(e) => setNomeLocal(e.target.value)}
          placeholder="Seu nome"
          maxLength={80}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] text-ink sm:w-[240px]"
        />
      )}
      <div className="flex gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={2000}
          placeholder={nome ? `Comentar como ${nome}...` : "Escreva seu comentário..."}
          className="max-h-[140px] min-h-[44px] flex-1 resize-y rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink focus:outline focus:outline-[1.5px] focus:outline-primary-bright"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={comentar.isPending || !texto.trim()}
          aria-label="Enviar comentário"
          className="flex w-[44px] shrink-0 items-center justify-center rounded-xl bg-primary text-white hover:brightness-110 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {nome && (
        <button type="button" onClick={() => onNome("")} className="text-[12px] text-muted hover:text-ink">
          Não é {nome}? Trocar nome
        </button>
      )}
      {erro && <div className="text-[12px] text-attention">{erro}</div>}
    </div>
  );
}
