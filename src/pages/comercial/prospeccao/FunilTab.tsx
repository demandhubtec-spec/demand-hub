import * as React from "react";
import { GripVertical, Pause, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { type OutreachLead, useOutreachLeads, useOutreachLog, useUpdateLead } from "@/hooks/useProspeccao";
import { cn } from "@/lib/utils";
import { CADENCIA_PADRAO, ETAPAS, type Etapa, etapaDoLead, funil, patchParaEtapa, pontuacao, respostasPorToque, resumoCadencia } from "./cadencia";
import { FichaLead } from "./FichaLead";

const label = (e: Etapa) => ETAPAS.find((x) => x.key === e)?.label ?? e;

/** Para onde um card pode ser arrastado, saindo de cada coluna. */
function destinosPermitidos(l: OutreachLead, de: Etapa): Etapa[] {
  if (de === "fora") return [];
  if (de === "aprovar") return l.sequencia?.length ? ["aprovado", "descartado"] : ["descartado"];
  if (de === "aprovado") return ["aprovar", "descartado"];
  return (["respondeu", "reuniao", "proposta", "ganho", "retomar", "descartado"] as Etapa[]).filter((x) => x !== de);
}

function patchArraste(l: OutreachLead, de: Etapa, para: Etapa): Partial<OutreachLead> | null {
  if (de === "aprovar" && para === "aprovado") return { msg_status: "aprovada", msg_aprovada_em: new Date().toISOString() };
  if (de === "aprovado" && para === "aprovar") return { msg_status: "rascunho", msg_aprovada_em: null };
  if ((de === "aprovar" || de === "aprovado") && para === "descartado") return { msg_status: "rejeitada", status_comercial: "descartado" };
  return patchParaEtapa(l, para);
}

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

function CardKanban({ lead, etapa, onAbrir, onArrastar }: { lead: OutreachLead; etapa: Etapa; onAbrir: () => void; onArrastar: (l: OutreachLead | null) => void }) {
  const update = useUpdateLead();
  const { showToast } = useToast();
  const resumo = resumoCadencia(lead);
  const podeArrastar = destinosPermitidos(lead, etapa).length > 0;

  async function salvar(e: React.MouseEvent, patch: Partial<OutreachLead>, msg: string) {
    e.stopPropagation();
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
      {etapa === "respondeu" && lead.respondeu_no_toque && (
        <div className="mt-1.5 text-[11.5px] text-positive">Respondeu no toque {lead.respondeu_no_toque}</div>
      )}
      {lead.reply_text && etapa === "respondeu" && <div className="mt-1 line-clamp-2 text-[11.5px] italic text-muted">"{lead.reply_text}"</div>}
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
  const update = useUpdateLead();
  const { showToast } = useToast();
  const [mostrarFora, setMostrarFora] = React.useState(false);
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [arrastando, setArrastando] = React.useState<OutreachLead | null>(null);
  const [sobre, setSobre] = React.useState<Etapa | null>(null);

  const porEtapa = new Map<Etapa, OutreachLead[]>();
  for (const l of leads) {
    const e = etapaDoLead(l);
    porEtapa.set(e, [...(porEtapa.get(e) ?? []), l]);
  }
  for (const [, arr] of porEtapa)
    arr.sort((a, b) => (a.proximo_toque_em ?? "9").localeCompare(b.proximo_toque_em ?? "9") || pontuacao(b).nota - pontuacao(a).nota);

  const porToque = respostasPorToque(leads, CADENCIA_PADRAO);
  const maxToque = Math.max(1, ...porToque.map((t) => t.n));
  const inicioHoje = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T00:00:00-03:00").getTime();
  const hoje = log.filter((e) => new Date(e.created_at).getTime() >= inicioHoje);
  const contar = (ch: string, ev: string) => hoje.filter((e) => e.channel === ch && e.event === ev).length;
  const colunas = ETAPAS.filter((e) => e.key !== "fora" || mostrarFora);
  const deArrasto = arrastando ? etapaDoLead(arrastando) : null;
  const alvos = arrastando && deArrasto ? destinosPermitidos(arrastando, deArrasto) : [];
  const leadAberto = aberto ? leads.find((l) => l.place_id === aberto) : null;

  async function soltar(para: Etapa) {
    const l = arrastando;
    setArrastando(null);
    setSobre(null);
    if (!l || !deArrasto || !alvos.includes(para)) return;
    const patch = patchArraste(l, deArrasto, para);
    if (!patch) return;
    try {
      await update.mutateAsync({ placeId: l.place_id, patch, descricao: `Movido para ${label(para)}: ${l.empresa}` });
      showToast(`${l.empresa} foi para ${label(para)}`);
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
          Clique num card para abrir a ficha (análise, mensagens e histórico). Arraste para mudar de etapa. O robô também move sozinho quando envia ou quando a pessoa responde.
        </div>
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
                  <CardKanban key={l.place_id} lead={l} etapa={c.key} onAbrir={() => setAberto(l.place_id)} onArrastar={setArrastando} />
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
