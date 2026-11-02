import * as React from "react";
import { CalendarClock, CheckCircle2, Circle, GripVertical, Pause, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { type OutreachLead, useOutreachLeads, useOutreachLog, useUpdateLead } from "@/hooks/useProspeccao";
import { useContatos } from "@/hooks/useCrm";
import { cn } from "@/lib/utils";
import {
  CADENCIA_PADRAO,
  type CtxConversa,
  ETAPAS,
  ETAPAS_CONVERSA,
  type Etapa,
  type EtapaConversa,
  diasUteisDesde,
  etapaConversa,
  etapaDoLead,
  funil,
  objetivo,
  patchParaEtapa,
  pontuacao,
  respostasPorToque,
  resumoCadencia,
} from "./cadencia";
import { FichaLead } from "./FichaLead";

/** Colunas do Kanban: "Respondeu" vira três (Em conversa, Retorno combinado, Parou no meio). */
type Coluna = Exclude<Etapa, "respondeu"> | EtapaConversa;
const GRUPO_CONVERSA: Coluna[] = ["conversa", "retorno", "parou"];
const COLUNAS: { key: Coluna; label: string; dica: string }[] = [
  ...ETAPAS.filter((e) => ["aprovar", "aprovado", "cadencia"].includes(e.key)),
  ...ETAPAS_CONVERSA,
  ...ETAPAS.filter((e) => ["reuniao", "proposta", "ganho", "retomar", "descartado", "fora"].includes(e.key)),
] as { key: Coluna; label: string; dica: string }[];

const label = (c: Coluna) => COLUNAS.find((x) => x.key === c)?.label ?? c;
const fim8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);

function colunaDoLead(l: OutreachLead, ctx: CtxConversa): Coluna {
  const e = etapaDoLead(l);
  return e === "respondeu" ? etapaConversa(l, ctx) : e;
}

/** Próximo dia útil às 09:30 (padrão quando você arrasta para "Retorno combinado"). */
function proximoDiaUtil(): string {
  let d = new Date(Date.now() + 864e5);
  while ([0, 6].includes(new Date(d.getTime() - 3 * 3600e3).getUTCDay())) d = new Date(d.getTime() + 864e5);
  const ymd = new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
  return new Date(`${ymd}T09:30:00-03:00`).toISOString();
}

/** Para onde um card pode ser arrastado, saindo de cada coluna. */
function destinosPermitidos(l: OutreachLead, de: Coluna): Coluna[] {
  if (de === "fora") return [];
  if (de === "aprovar") return l.sequencia?.length ? ["aprovado", "descartado"] : ["descartado"];
  if (de === "aprovado") return ["aprovar", "descartado"];
  // "Parou no meio" é calculado pelo tempo sem resposta: não dá para soltar lá
  const base: Coluna[] = ["conversa", "retorno", "reuniao", "proposta", "ganho", "retomar", "descartado"];
  return base.filter((x) => x !== de && !(de === "parou" && x === "conversa"));
}

function patchArraste(l: OutreachLead, de: Coluna, para: Coluna): Partial<OutreachLead> | null {
  if (de === "aprovar" && para === "aprovado") return { msg_status: "aprovada", msg_aprovada_em: new Date().toISOString() };
  if (de === "aprovado" && para === "aprovar") return { msg_status: "rascunho", msg_aprovada_em: null };
  if ((de === "aprovar" || de === "aprovado") && para === "descartado") return { msg_status: "rejeitada", status_comercial: "descartado" };
  const jaConversa = GRUPO_CONVERSA.includes(de);
  if (para === "conversa") return jaConversa ? { retorno_em: null, retorno_nota: null } : { ...patchParaEtapa(l, "respondeu"), retorno_em: null };
  if (para === "retorno") return { ...(jaConversa ? {} : patchParaEtapa(l, "respondeu")), retorno_em: proximoDiaUtil() };
  const p = patchParaEtapa(l, para as Etapa);
  return p ? { ...p, ...(l.retorno_em ? { retorno_em: null } : {}) } : null;
}

/** Valor de <input type="datetime-local"> no horário de Brasília. */
const paraInput = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 16);
const deInput = (v: string) => new Date(`${v}:00-03:00`).toISOString();

/** Funil em pé: cada faixa mais estreita que a anterior, com a conversão entre elas. */
function FunilVertical({ leads }: { leads: OutreachLead[] }) {
  const f = funil(leads);
  const topo = Math.max(1, f[0].n);
  return (
    <div className="mx-auto flex max-w-[460px] flex-col items-center">
      {f.map((x, i) => {
        const largura = 100 - i * (62 / (f.length - 1));
        const conv = i > 0 && f[i - 1].n > 0 ? Math.round((x.n / f[i - 1].n) * 100) : null;
        return (
          <React.Fragment key={x.key}>
            {i > 0 && (
              <div className="py-0.5 text-[11px] text-muted">
                {conv === null ? "sem dados ainda" : `${conv}% passaram para a próxima etapa`}
              </div>
            )}
            <div
              className="relative flex h-[46px] items-center justify-center text-white"
              style={{
                width: `${largura}%`,
                clipPath: "polygon(0 0, 100% 0, 93% 100%, 7% 100%)",
                background: `linear-gradient(90deg, rgba(122,75,255,${0.55 + i * 0.09}), rgba(178,111,214,${0.55 + i * 0.09}))`,
                opacity: x.n === 0 && i > 0 ? 0.45 : 1,
              }}
              title={`${x.n} de ${topo} abordados`}
            >
              <span className="text-[12.5px] font-semibold">{x.label}</span>
              <span className="ml-2 font-display text-[18px] font-bold">{x.n}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CardKanban({
  lead,
  etapa,
  ctx,
  onAbrir,
  onArrastar,
}: {
  lead: OutreachLead;
  etapa: Coluna;
  ctx: CtxConversa;
  onAbrir: () => void;
  onArrastar: (l: OutreachLead | null) => void;
}) {
  const update = useUpdateLead();
  const { showToast } = useToast();
  const resumo = resumoCadencia(lead);
  const podeArrastar = destinosPermitidos(lead, etapa).length > 0;

  async function salvar(e: React.SyntheticEvent | null, patch: Partial<OutreachLead>, msg: string) {
    e?.stopPropagation();
    try {
      await update.mutateAsync({ placeId: lead.place_id, patch, descricao: `${msg}: ${lead.empresa}` });
      showToast(msg);
    } catch (err) {
      showToast(`Erro: ${(err as Error).message}`);
    }
  }

  return (
    <div
      draggable={podeArrastar}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", lead.place_id);
        e.dataTransfer.effectAllowed = "move";
        onArrastar(lead);
      }}
      onDragEnd={() => onArrastar(null)}
      onClick={onAbrir}
      className={cn(
        "group cursor-pointer rounded-md border border-border bg-surface p-2.5 text-[12.5px] transition-colors hover:border-primary-bright/60",
        podeArrastar && "active:cursor-grabbing",
      )}
    >
      <div className="flex items-start gap-1.5">
        {podeArrastar && <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted opacity-50 group-hover:opacity-100" />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">{lead.empresa}</div>
          <div className="mt-0.5 text-[11.5px] text-muted">{[lead.nicho, lead.cidade].filter(Boolean).join(" · ")}</div>
        </div>
        {(() => {
          const p = pontuacao(lead);
          return (
            <span
              title={`Prioridade ${p.nivel.toLowerCase()}: ${p.motivos.join(", ")}`}
              className={cn(
                "shrink-0 rounded-full px-1.5 text-[10.5px] font-semibold",
                p.nivel === "Alta" ? "bg-positive-tint text-positive" : p.nivel === "Média" ? "bg-primary-tint text-primary-bright" : "bg-surface-2 text-muted",
              )}
            >
              {p.nota}
            </span>
          );
        })()}
      </div>
      {etapa === "aprovar" && (
        <div className="mt-1.5 text-[11.5px] text-muted">{lead.sequencia?.length ? "Sequência pronta para revisar" : "A Ana ainda não escreveu"}</div>
      )}
      {resumo && <div className="mt-1.5 text-[11.5px] text-primary-bright">{resumo}</div>}
      {etapa === "retomar" && lead.retomar_em && (
        <div className="mt-1.5 text-[11.5px] text-muted">Volta para aprovação em {new Date(`${lead.retomar_em}T12:00:00`).toLocaleDateString("pt-BR")}</div>
      )}
      {etapa === "retorno" && lead.retorno_em && (
        <div className="mt-1.5 space-y-1" onClick={(e) => e.stopPropagation()}>
          <label className="flex items-center gap-1.5 text-[11.5px] text-primary-bright">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <input
              type="datetime-local"
              className="min-w-0 flex-1 rounded border border-border bg-transparent px-1 text-[11.5px] text-ink"
              defaultValue={paraInput(lead.retorno_em)}
              onBlur={(e) => e.target.value && deInput(e.target.value) !== lead.retorno_em && salvar(null, { retorno_em: deInput(e.target.value) }, "Data do retorno alterada")}
            />
          </label>
          {lead.retorno_nota && <div className="text-[11.5px] text-muted">{lead.retorno_nota}</div>}
        </div>
      )}
      {etapa === "parou" && (() => {
        const ult = [ctx.ultimaEntrada, ctx.ultimaSaida, lead.retomada_em].filter(Boolean).sort().pop();
        const n = ult ? diasUteisDesde(new Date(ult)) : null;
        return (
          <div className="mt-1.5 text-[11.5px] text-attention">
            {n !== null ? `Sem resposta há ${n} dias úteis` : "Sem resposta"}
            {lead.retomadas ? ` · ${lead.retomadas} de 2 retomadas propostas` : ""}
          </div>
        );
      })()}
      {etapa === "conversa" && ctx.ultimaEntrada && (!ctx.ultimaSaida || ctx.ultimaEntrada > ctx.ultimaSaida) && (
        <div className="mt-1.5 text-[11.5px] text-attention">Respondeu e está esperando resposta nossa</div>
      )}
      {GRUPO_CONVERSA.includes(etapa) && lead.reply_text && <div className="mt-1 line-clamp-2 text-[11.5px] italic text-muted">"{lead.reply_text}"</div>}
      {[...GRUPO_CONVERSA, "reuniao", "proposta"].includes(etapa) && (() => {
        const o = objetivo(lead);
        const Marca = ({ ok, children, onClick, title }: { ok: boolean; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void; title?: string }) => (
          <button
            onClick={onClick}
            title={title}
            disabled={!onClick}
            className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 text-[10.5px] font-semibold", ok ? "bg-positive-tint text-positive" : "bg-surface-2 text-muted")}
          >
            {ok ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
            {children}
          </button>
        );
        return (
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Marca
              ok={o.diagnostico}
              title="Clique para marcar ou desmarcar"
              onClick={(e) => salvar(e, { diag_enviado_em: o.diagnostico ? null : new Date().toISOString() }, o.diagnostico ? "Diagnóstico desmarcado" : "Diagnóstico enviado")}
            >
              Diagnóstico
            </Marca>
            <Marca
              ok={o.responsavel}
              title={lead.responsavel_contato ?? "Clique para marcar que já temos o contato do responsável"}
              onClick={(e) => salvar(e, { responsavel_contato: o.responsavel ? null : "informado" }, o.responsavel ? "Contato do responsável desmarcado" : "Contato do responsável marcado")}
            >
              Responsável
            </Marca>
            <Marca ok={o.reuniao}>Reunião</Marca>
          </div>
        );
      })()}
      {lead.cadencia === "ativa" && (
        <Button size="sm" variant="ghost" className="mt-1.5 h-6 px-1.5 text-[11px]" onClick={(e) => salvar(e, { cadencia: "pausada" }, "Cadência pausada")}>
          <Pause /> Pausar
        </Button>
      )}
      {lead.cadencia === "pausada" && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1.5 h-6 px-1.5 text-[11px]"
          onClick={(e) =>
            salvar(e, { cadencia: "ativa", proximo_toque_em: new Date(Math.max(Date.now(), new Date(lead.proximo_toque_em ?? 0).getTime())).toISOString() }, "Cadência retomada")
          }
        >
          <Play /> Retomar
        </Button>
      )}
    </div>
  );
}

export function FunilTab() {
  const { data: leads = [] } = useOutreachLeads();
  const { data: log = [] } = useOutreachLog();
  const { contatos } = useContatos();
  const update = useUpdateLead();
  const { showToast } = useToast();
  const [mostrarFora, setMostrarFora] = React.useState(false);
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [arrastando, setArrastando] = React.useState<OutreachLead | null>(null);
  const [sobre, setSobre] = React.useState<Coluna | null>(null);
  const [mostrarFila, setMostrarFila] = React.useState(false);
  const [prio, setPrio] = React.useState<"todas" | "Alta" | "Média" | "Baixa">("todas");

  const conversaPorFone = React.useMemo(() => {
    const m = new Map<string, CtxConversa>();
    for (const c of contatos) m.set(fim8(c.phone), { ultimaEntrada: c.last_inbound_at, ultimaSaida: c.last_outbound_at });
    return m;
  }, [contatos]);
  const ctxDe = (l: OutreachLead): CtxConversa => (l.whatsapp ? conversaPorFone.get(fim8(l.whatsapp)) ?? {} : {});

  const porEtapa = new Map<Coluna, OutreachLead[]>();
  for (const l of leads) {
    if (prio !== "todas" && pontuacao(l).nivel !== prio) continue;
    const e = colunaDoLead(l, ctxDe(l));
    porEtapa.set(e, [...(porEtapa.get(e) ?? []), l]);
  }
  for (const [k, arr] of porEtapa) {
    if (k === "retorno") arr.sort((a, b) => (a.retorno_em ?? "").localeCompare(b.retorno_em ?? ""));
    else if (GRUPO_CONVERSA.includes(k)) {
      const ult = (l: OutreachLead) => [ctxDe(l).ultimaEntrada, ctxDe(l).ultimaSaida].filter(Boolean).sort().pop() ?? "";
      arr.sort((a, b) => (k === "parou" ? ult(a).localeCompare(ult(b)) : ult(b).localeCompare(ult(a))));
    } else arr.sort((a, b) => (a.proximo_toque_em ?? "9").localeCompare(b.proximo_toque_em ?? "9") || pontuacao(b).nota - pontuacao(a).nota);
  }

  const porToque = respostasPorToque(leads, CADENCIA_PADRAO);
  const maxToque = Math.max(1, ...porToque.map((t) => t.n));
  const inicioHoje = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T00:00:00-03:00").getTime();
  const hoje = log.filter((e) => new Date(e.created_at).getTime() >= inicioHoje);
  const contar = (ch: string, ev: string) => hoje.filter((e) => e.channel === ch && e.event === ev).length;
  const colunas = COLUNAS.filter((e) => (e.key !== "fora" || mostrarFora) && (!["aprovado", "cadencia"].includes(e.key) || mostrarFila));
  const deArrasto = arrastando ? colunaDoLead(arrastando, ctxDe(arrastando)) : null;
  const alvos = arrastando && deArrasto ? destinosPermitidos(arrastando, deArrasto) : [];
  const leadAberto = aberto ? leads.find((l) => l.place_id === aberto) : null;

  async function soltar(para: Coluna) {
    const l = arrastando;
    setArrastando(null);
    setSobre(null);
    if (!l || !deArrasto || !alvos.includes(para)) return;
    const patch = patchArraste(l, deArrasto, para);
    if (!patch) return;
    try {
      await update.mutateAsync({ placeId: l.place_id, patch, descricao: `Movido para ${label(para)}: ${l.empresa}` });
      showToast(para === "retorno" ? `${l.empresa} foi para Retorno combinado: ajuste a data no card` : `${l.empresa} foi para ${label(para)}`);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Funil da prospecção</div>
          <div className="mb-4 mt-0.5 text-[11.5px] text-muted">Cada etapa conta quem chegou nela. Abaixo de cada faixa, quantos passaram para a próxima.</div>
          <FunilVertical leads={leads} />
          <div className="mt-4 text-center text-[12px] text-muted">
            Hoje: {contar("whatsapp", "sent")} primeiras mensagens · {contar("whatsapp", "followup")} follow-ups no WhatsApp · {contar("email", "sent")} e-mails
          </div>
        </Card>

        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Em qual toque responderam</div>
          <div className="mb-3 mt-0.5 text-[11.5px] text-muted">Mostra qual mensagem da cadência está funcionando.</div>
          <div className="space-y-2">
            {porToque.map((t) => (
              <div key={t.toque} className="text-[12px]">
                <div className="flex justify-between">
                  <span className="text-muted">{t.label}</span>
                  <b>{t.n}</b>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-positive" style={{ width: `${(t.n / maxToque) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] text-muted">
          Aqui ficam as conversas. Quem vai receber mensagem e quando está na aba Agenda. Clique num card para abrir a ficha e arraste para mudar de etapa.
        </div>
        <select
          className="shrink-0 rounded-full border border-border bg-transparent px-3 py-1 text-[12px] font-semibold text-muted"
          value={prio}
          onChange={(e) => setPrio(e.target.value as typeof prio)}
        >
          <option value="todas">Todas as prioridades</option>
          <option value="Alta">Só prioridade alta</option>
          <option value="Média">Só prioridade média</option>
          <option value="Baixa">Só prioridade baixa</option>
        </select>
        <button className="shrink-0 text-[12px] font-semibold text-primary-bright" onClick={() => setMostrarFila((v) => !v)}>
          {mostrarFila
            ? "Esconder fila e cadência"
            : `Mostrar fila e cadência (${(porEtapa.get("aprovado")?.length ?? 0) + (porEtapa.get("cadencia")?.length ?? 0)})`}
        </button>
        <button className="shrink-0 text-[12px] font-semibold text-primary-bright" onClick={() => setMostrarFora((v) => !v)}>
          {mostrarFora ? "Esconder sem WhatsApp" : `Mostrar sem WhatsApp (${porEtapa.get("fora")?.length ?? 0})`}
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {colunas.map((c) => {
          const itens = porEtapa.get(c.key) ?? [];
          const pode = alvos.includes(c.key);
          return (
            <div
              key={c.key}
              onDragOver={(e) => {
                if (!pode) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (sobre !== c.key) setSobre(c.key);
              }}
              onDragLeave={() => sobre === c.key && setSobre(null)}
              onDrop={(e) => {
                e.preventDefault();
                soltar(c.key);
              }}
              className={cn(
                "w-[230px] shrink-0 rounded-lg border-2 border-transparent bg-surface-2 p-2.5 transition-colors",
                arrastando && pode && "border-dashed border-primary-bright/40",
                sobre === c.key && "border-primary-bright bg-primary-tint",
                arrastando && !pode && deArrasto !== c.key && "opacity-50",
              )}
            >
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold">{c.label}</span>
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", itens.length ? "bg-primary-tint text-primary-bright" : "text-muted")}>
                  {itens.length}
                </span>
              </div>
              <div className="mb-2 text-[11px] text-muted">{c.dica}</div>
              <div className="max-h-[560px] min-h-[60px] space-y-2 overflow-y-auto">
                {itens.map((l) => (
                  <CardKanban key={l.place_id} lead={l} etapa={c.key} ctx={ctxDe(l)} onAbrir={() => setAberto(l.place_id)} onArrastar={setArrastando} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {leadAberto && <FichaLead lead={leadAberto} onClose={() => setAberto(null)} />}
    </div>
  );
}
