import { CheckCircle2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { detalheTexto, type OutreachLead, useOutreachLog } from "@/hooks/useProspeccao";
import { CardLead } from "./AprovacaoTab";
import { EnvioAvulso } from "./EnvioAvulso";
import { icones } from "./AtividadeTab";
import { ETAPAS, etapaDoLead, resumoCadencia } from "./cadencia";
import { fmtData, fmtTelefone, linkExterno } from "./shared";

/** Ficha do lead: abre ao clicar no card do Kanban. Mostra a análise da Ana, a sequência e o histórico. */
export function FichaLead({ lead, onClose }: { lead: OutreachLead; onClose: () => void }) {
  const { data: log = [] } = useOutreachLog(lead.place_id);
  const etapa = ETAPAS.find((e) => e.key === etapaDoLead(lead));
  const resumo = resumoCadencia(lead);
  const links = [
    lead.whatsapp && { label: fmtTelefone(lead.whatsapp), href: `https://wa.me/${lead.whatsapp}` },
    lead.email && { label: lead.email, href: `mailto:${lead.email}` },
    lead.site && { label: "Site", href: linkExterno(lead.site) },
    lead.instagram && { label: "Instagram", href: linkExterno(lead.instagram) },
  ].filter(Boolean) as { label: string; href: string | null }[];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="left-auto right-0 top-0 h-full max-h-none w-full max-w-[640px] translate-x-0 translate-y-0 overflow-y-auto rounded-none">
        <DialogTitle>{lead.empresa}</DialogTitle>
        <DialogDescription>
          {[etapa?.label, resumo || null, lead.decisor && `Decisor: ${lead.decisor}`].filter(Boolean).join(" · ")}
        </DialogDescription>

        {links.length > 0 && (
          <div className="-mt-2 mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            {links.map((l) => (
              <a key={l.label} href={l.href ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-bright hover:underline">
                {l.label} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        )}

        {lead.reply_text && (
          <div className="mb-4 rounded-md border border-positive/40 bg-positive-tint p-3 text-[13px]">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-positive">
              Resposta{lead.respondeu_no_toque ? ` (toque ${lead.respondeu_no_toque})` : ""}
            </div>
            <div className="whitespace-pre-wrap">{lead.reply_text}</div>
            {lead.wa_status === "respondeu" && (
              <a href="/comercial/sdr" className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-primary-bright hover:underline">
                Ver a conversa da Ana no SDR IA <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        <EnvioAvulso lead={lead} />

        <CardLead lead={lead} abertoInicial />

        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Histórico</div>
          {log.length === 0 && <div className="text-[12.5px] text-muted">Nada registrado ainda.</div>}
          <ul className="space-y-2">
            {log.map((e) => {
              const ic = icones[e.event] ?? { icon: CheckCircle2, cls: "text-muted", label: e.event };
              const Icon = ic.icon;
              return (
                <li key={e.id} className="flex gap-2.5 text-[12.5px]">
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${ic.cls}`} />
                  <span className="w-[82px] shrink-0 font-mono text-[11px] text-muted">{fmtData(e.created_at)}</span>
                  <span className="min-w-0">
                    <b className="font-semibold">{e.channel === "email" && e.event === "sent" ? "E-mail enviado" : ic.label}</b>{" "}
                    <span className="text-muted">{detalheTexto(e.detail)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
