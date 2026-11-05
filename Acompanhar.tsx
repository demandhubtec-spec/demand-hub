import * as React from "react";
import { useParams } from "react-router-dom";
import { Check, ChevronDown, MessageSquare, RefreshCw, Send } from "lucide-react";
import { BrandLogo } from "@/components/layout/Logo";
import {
  useAcompanhamentoPublico,
  useComentarPublico,
  type ComentarioCliente,
  type EntregaPublica,
} from "@/hooks/useAcompanhamento";
import { FASES, faseIndice, faseLabel, faseProgresso } from "@/lib/fases";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Página pública de acompanhamento (sem login): portal.demandhub.com.br/acompanhar/<token>
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
  if (e.fim && e.fim < hojeISO()) return "atrasada";
  if (e.fase || e.status === "andamento") return "andamento";
  return "proxima";
}

const situacaoInfo: Record<Situacao, { label: string; cls: string }> = {
  concluida: { label: "Concluída", cls: "bg-positive-tint text-positive" },
  andamento: { label: "Em andamento", cls: "bg-primary-tint text-primary-bright" },
  atrasada: { label: "Prazo vencido", cls: "bg-attention-tint text-attention" },
  proxima: { label: "Próxima", cls: "bg-surface-2 text-muted" },
};

const CHAVE_NOME = "demandia-acompanhar-nome";

export default function Acompanhar() {
  const { token = "" } = useParams<{ token: string }>();
  const { data, isLoading, isError, dataUpdatedAt, refetch, isFetching } = useAcompanhamentoPublico(token);
  const [filtro, setFiltro] = React.useState<"todas" | Situacao>("todas");
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
  const comSit = entregas.map((e) => ({ e, s: situacao(e) }));
  const total = entregas.length;
  const concluidas = comSit.filter((x) => x.s === "concluida").length;
  const emAndamento = comSit.filter((x) => x.s === "andamento" || x.s === "atrasada").length;
  const progressoGeral = total ? Math.round(entregas.reduce((s, e) => s + faseProgresso(e.fase), 0) / total) : 0;
  const abertas = entregas.filter((e) => situacao(e) !== "concluida" && e.fim).sort((a, b) => a.fim!.localeCompare(b.fim!));
  const proximaEntrega = abertas[0];
  const fimPrevisto = entregas.reduce<string | null>((m, e) => (e.fim && (!m || e.fim > m) ? e.fim : m), null);
  const visiveis = comSit
    .filter((x) => filtro === "todas" || x.s === filtro || (filtro === "andamento" && x.s === "atrasada"))
    .sort((a, b) => ordemSituacao(a.s) - ordemSituacao(b.s) || (a.e.fim ?? "9").localeCompare(b.e.fim ?? "9"));
  const gerais = data.comentarios.filter((c) => !c.projeto_id);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[980px] px-4 pb-16 pt-6 sm:px-6">
        {/* Topo */}
        <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <BrandLogo height={28} />
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[11px] text-muted hover:text-ink"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
            </span>
            Ao vivo · atualizado {new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </button>
        </header>

        <div className="mb-2 font-mono text-[11px] uppercase tracking-[.12em] text-primary-bright">
          Acompanhamento do projeto
        </div>
        <h1 className="text-[34px] leading-none sm:text-[44px]">{data.cliente.nome}</h1>
        <p className="mt-3 max-w-[620px] text-[14px] text-muted">
          Aqui você acompanha todas as entregas do escopo, em que fase cada uma está e os prazos previstos. A página se
          atualiza sozinha. Se tiver alguma dúvida, é só comentar na entrega.
        </p>

        {/* Resumo */}
        <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Numero rotulo="Entregas concluídas" valor={`${concluidas}/${total}`} />
          <Numero rotulo="Em andamento" valor={String(emAndamento)} />
          <Numero
            rotulo="Próximo prazo"
            valor={proximaEntrega ? dataCurta(proximaEntrega.fim) : "—"}
            detalhe={proximaEntrega ? `${String(proximaEntrega.numero).padStart(2, "0")} · ${proximaEntrega.nome}` : undefined}
          />
          <Numero rotulo="Conclusão prevista" valor={fimPrevisto ? dataCurta(fimPrevisto) : "—"} detalhe={fimPrevisto?.slice(0, 4)} />
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between text-[12.5px]">
            <span className="font-semibold">Andamento geral</span>
            <span className="font-mono text-primary-bright">{progressoGeral}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#5A28E0] via-[#8B5BFF] to-[#C9B0FF] transition-[width] duration-700"
              style={{ width: `${progressoGeral}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
            <span>Toda entrega passa por:</span>
            {FASES.map((f, i) => (
              <span key={f.value} className="font-mono">
                {i + 1}. {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* Filtro */}
        <div className="mb-3 mt-8 flex flex-wrap gap-2">
          {(
            [
              ["todas", `Todas (${total})`],
              ["andamento", `Em andamento (${emAndamento})`],
              ["proxima", `Próximas (${comSit.filter((x) => x.s === "proxima").length})`],
              ["concluida", `Concluídas (${concluidas})`],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFiltro(v)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                filtro === v ? "border-primary bg-primary text-white" : "border-border bg-surface text-muted hover:text-ink",
              )}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Entregas */}
        <div className="space-y-3">
          {visiveis.length === 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
              Nenhuma entrega neste filtro.
            </div>
          )}
          {visiveis.map(({ e, s }) => (
            <CardEntrega
              key={e.numero}
              e={e}
              s={s}
              token={token}
              nome={nome}
              onNome={salvarNome}
              comentarios={data.comentarios.filter((c) => e.projeto_id && c.projeto_id === e.projeto_id)}
            />
          ))}
        </div>

        {/* Comentários gerais */}
        <section className="mt-10 rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-1 flex items-center gap-2 text-[15px]">
            <MessageSquare className="h-4 w-4 text-primary-bright" />
            Recados para a equipe
          </h3>
          <p className="mb-4 text-[12.5px] text-muted">Dúvidas ou pedidos que não são de uma entrega específica.</p>
          <Conversa comentarios={gerais} />
          <CaixaComentario token={token} projetoId={null} nome={nome} onNome={salvarNome} />
        </section>

        <footer className="mt-10 text-center font-mono text-[11px] text-muted">
          DemandIA · Demand Hub · prazos estimados, podem mudar conforme os testes e as aprovações
        </footer>
      </div>
    </div>
  );
}

function ordemSituacao(s: Situacao) {
  return { atrasada: 0, andamento: 1, proxima: 2, concluida: 3 }[s];
}

function Tela({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center text-[14px] text-muted">
      <BrandLogo height={30} />
      <div>{children}</div>
    </div>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-[11.5px] text-muted">{rotulo}</div>
      <div className="mt-1 font-display text-[28px] font-extrabold leading-none [font-stretch:75%]">{valor}</div>
      {detalhe && <div className="mt-1.5 truncate text-[11.5px] text-muted">{detalhe}</div>}
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

  return (
    <article
      className={cn(
        "rounded-2xl border bg-surface transition-colors",
        aberto ? "border-primary/50" : "border-border hover:border-primary/40",
      )}
    >
      <button type="button" onClick={() => setAberto((v) => !v)} className="w-full p-4 text-left sm:p-5">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted">Entrega {String(e.numero).padStart(2, "0")}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", info.cls)}>{info.label}</span>
              {comentarios.length > 0 && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted">
                  <MessageSquare className="h-3 w-3" />
                  {comentarios.length}
                </span>
              )}
            </div>
            <div className="text-[15.5px] font-semibold leading-snug">{e.nome}</div>
            {e.resumo && <div className="mt-0.5 text-[12.5px] text-muted">{e.resumo}</div>}
          </div>
          <div className="text-right">
            <div className="font-mono text-[11px] text-muted">Prazo</div>
            <div className="text-[13px] font-semibold">
              {dataCurta(e.inicio)} a {dataCurta(e.fim)}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <Etapas fase={e.fase} />
            <div className="mt-1 hidden justify-between font-mono text-[10px] text-muted sm:flex">
              {FASES.map((f) => (
                <span key={f.value} className={cn("w-0 whitespace-nowrap", f.value === e.fase && "font-bold text-primary-bright")}>
                  <span className={cn("inline-block", f.value === "implementacao" ? "" : f.value === "concluido" ? "-translate-x-full" : "-translate-x-1/2")}>
                    {f.label}
                  </span>
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-muted sm:mt-2">
              <span className="sm:hidden">{e.fase ? `Fase: ${faseLabel[e.fase]}` : "Ainda não iniciada"}</span>
              <span className="hidden sm:inline">{e.fase ? "" : "Ainda não iniciada"}</span>
              {e.atividades.length > 0 && (
                <span>
                  {feitas}/{e.atividades.length} etapas
                </span>
              )}
            </div>
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", aberto && "rotate-180")} />
        </div>
      </button>

      {aberto && (
        <div className="border-t border-border px-4 pb-5 pt-4 sm:px-5">
          {e.briefing && <p className="mb-4 text-[13px] leading-relaxed text-ink/90">{e.briefing}</p>}

          {e.atividades.length > 0 && (
            <ul className="mb-5 space-y-1.5">
              {e.atividades.map((a) => (
                <li key={a.id} className="flex items-start gap-2.5 text-[13px]">
                  <span
                    className={cn(
                      "mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      a.status === "concluido"
                        ? "border-positive bg-positive text-[#0b0420]"
                        : a.status === "andamento"
                          ? "border-primary-bright"
                          : "border-muted/50",
                    )}
                  >
                    {a.status === "concluido" && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                    {a.status === "andamento" && <span className="h-1.5 w-1.5 rounded-full bg-primary-bright" />}
                  </span>
                  <span className={cn("flex-1", a.status === "concluido" && "text-muted")}>{a.titulo}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted">
                    {a.status === "concluido" ? "feito" : dataCurta(a.prazo)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.05em] text-muted">Comentários</div>
          {e.projeto_id ? (
            <>
              <Conversa comentarios={comentarios} />
              <CaixaComentario token={token} projetoId={e.projeto_id} nome={nome} onNome={onNome} />
            </>
          ) : (
            <p className="text-[12.5px] text-muted">
              Os comentários abrem quando esta entrega começar. Até lá, use os recados no fim da página.
            </p>
          )}
          <div className="mt-3 font-mono text-[10.5px] text-muted">Previsão de conclusão: {dataLonga(e.fim)}</div>
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
            c.autor_tipo === "equipe" ? "mr-6 border border-primary/30 bg-primary-tint" : "ml-6 bg-surface-2",
          )}
        >
          <div className="mb-0.5 flex justify-between gap-2">
            <span className="text-[11.5px] font-bold text-primary-bright">{c.autor_nome}</span>
            <span className="font-mono text-[10px] text-muted">{quando(c.criado_em)}</span>
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
        <button type="button" onClick={() => onNome("")} className="text-[11px] text-muted hover:text-ink">
          Não é {nome}? Trocar nome
        </button>
      )}
      {erro && <div className="text-[12px] text-attention">{erro}</div>}
    </div>
  );
}
