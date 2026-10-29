import * as React from "react";
import { Pause, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { type OutreachLead, useOutreachLeads, useOutreachLog, useUpdateLead } from "@/hooks/useProspeccao";
import { cn } from "@/lib/utils";
import { CADENCIA_PADRAO, ETAPAS, type Etapa, etapaDoLead, funil, patchParaEtapa, respostasPorToque, resumoCadencia } from "./cadencia";

const MOVER: Etapa[] = ["respondeu", "reuniao", "proposta", "ganho", "retomar", "descartado"];

function CardKanban({ lead, etapa }: { lead: OutreachLead; etapa: Etapa }) {
  const update = useUpdateLead();
  const { showToast } = useToast();

  async function salvar(patch: Partial<OutreachLead>, msg: string) {
    try {
      await update.mutateAsync({ placeId: lead.place_id, patch, descricao: `${msg}: ${lead.empresa}` });
      showToast(msg);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  const resumo = resumoCadencia(lead);
  return (
    <div className="rounded-md border border-border bg-surface p-2.5 text-[12.5px]">
      <div className="font-semibold leading-tight">{lead.empresa}</div>
      <div className="mt-0.5 text-[11.5px] text-muted">{[lead.nicho, lead.cidade].filter(Boolean).join(" · ")}</div>
      {resumo && <div className="mt-1.5 text-[11.5px] text-primary-bright">{resumo}</div>}
      {etapa === "retomar" && lead.retomar_em && (
        <div className="mt-1.5 text-[11.5px] text-muted">Volta para aprovação em {new Date(`${lead.retomar_em}T12:00:00`).toLocaleDateString("pt-BR")}</div>
      )}
      {etapa === "respondeu" && lead.respondeu_no_toque && (
        <div className="mt-1.5 text-[11.5px] text-positive">Respondeu no toque {lead.respondeu_no_toque}</div>
      )}
      {lead.reply_text && etapa === "respondeu" && <div className="mt-1 line-clamp-2 text-[11.5px] italic text-muted">"{lead.reply_text}"</div>}

      <div className="mt-2 flex items-center gap-1.5">
        {etapa !== "aprovar" && etapa !== "aprovado" && etapa !== "fora" && (
          <Select
            value=""
            onValueChange={(v) => {
              const patch = patchParaEtapa(lead, v as Etapa);
              if (patch) salvar(patch, `Movido para ${ETAPAS.find((e) => e.key === v)?.label}`);
            }}
          >
            <SelectTrigger className="h-7 px-2 py-0 text-[11.5px]">
              <SelectValue placeholder="Mover para..." />
            </SelectTrigger>
            <SelectContent>
              {MOVER.filter((m) => m !== etapa).map((m) => (
                <SelectItem key={m} value={m}>
                  {ETAPAS.find((e) => e.key === m)?.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {lead.cadencia === "ativa" && (
          <Button size="sm" variant="ghost" className="h-7 px-2" title="Pausar a cadência" onClick={() => salvar({ cadencia: "pausada" }, "Cadência pausada")}>
            <Pause />
          </Button>
        )}
        {lead.cadencia === "pausada" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            title="Retomar a cadência"
            onClick={() =>
              salvar(
                {
                  cadencia: "ativa",
                  proximo_toque_em: new Date(Math.max(Date.now(), new Date(lead.proximo_toque_em ?? 0).getTime())).toISOString(),
                },
                "Cadência retomada",
              )
            }
          >
            <Play />
          </Button>
        )}
      </div>
    </div>
  );
}

export function FunilTab() {
  const { data: leads = [] } = useOutreachLeads();
  const { data: log = [] } = useOutreachLog();
  const [mostrarFora, setMostrarFora] = React.useState(false);

  const porEtapa = new Map<Etapa, OutreachLead[]>();
  for (const l of leads) {
    const e = etapaDoLead(l);
    porEtapa.set(e, [...(porEtapa.get(e) ?? []), l]);
  }
  for (const [, arr] of porEtapa) arr.sort((a, b) => (a.proximo_toque_em ?? "9").localeCompare(b.proximo_toque_em ?? "9"));

  const f = funil(leads);
  const porToque = respostasPorToque(leads, CADENCIA_PADRAO);
  const maxToque = Math.max(1, ...porToque.map((t) => t.n));
  const inicioHoje = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T00:00:00-03:00").getTime();
  const hoje = log.filter((e) => new Date(e.created_at).getTime() >= inicioHoje);
  const contar = (ch: string, ev: string) => hoje.filter((e) => e.channel === ch && e.event === ev).length;
  const colunas = ETAPAS.filter((e) => e.key !== "fora" || mostrarFora);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Funil da prospecção</div>
          <div className="mb-3 mt-0.5 text-[11.5px] text-muted">Cada etapa conta quem chegou nela. A porcentagem é em relação à etapa anterior.</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {f.map((x, i) => (
              <div key={x.key}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-muted">{x.label}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {i > 0 && f[i - 1].n > 0 ? `${Math.round((x.n / f[i - 1].n) * 100)}%` : ""}
                  </span>
                </div>
                <div className="font-display text-[22px] font-bold">{x.n}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(x.n / Math.max(1, f[0].n)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-[12px] text-muted">
            Hoje: {contar("whatsapp", "sent")} abordagens no WhatsApp · {contar("whatsapp", "followup")} follow-ups no WhatsApp ·{" "}
            {contar("email", "sent")} e-mails
          </div>
        </Card>

        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Em qual toque responderam</div>
          <div className="mb-3 mt-0.5 text-[11.5px] text-muted">Mostra qual mensagem da cadência está funcionando.</div>
          <div className="space-y-1.5">
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

      <div className="flex items-center justify-between">
        <div className="text-[12px] text-muted">
          O robô move os cards sozinho (envio, resposta, fim da cadência). Use "Mover para" quando marcar reunião, mandar proposta ou fechar.
        </div>
        <button className="shrink-0 text-[12px] font-semibold text-primary-bright" onClick={() => setMostrarFora((v) => !v)}>
          {mostrarFora ? "Esconder sem WhatsApp" : `Mostrar sem WhatsApp (${porEtapa.get("fora")?.length ?? 0})`}
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {colunas.map((c) => {
          const itens = porEtapa.get(c.key) ?? [];
          return (
            <div key={c.key} className="w-[230px] shrink-0 rounded-lg bg-surface-2 p-2.5">
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold">{c.label}</span>
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", itens.length ? "bg-primary-tint text-primary-bright" : "text-muted")}>
                  {itens.length}
                </span>
              </div>
              <div className="mb-2 text-[11px] text-muted">{c.dica}</div>
              <div className="max-h-[560px] space-y-2 overflow-y-auto">
                {itens.map((l) => (
                  <CardKanban key={l.place_id} lead={l} etapa={c.key} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
