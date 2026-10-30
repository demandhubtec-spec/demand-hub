import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/toast";
import { ETAPAS_OPORTUNIDADE, ORIGEM_TEXTO, useContatos, useEtapaInbound, type EtapaOportunidade } from "@/hooks/useCrm";
import { type OutreachLead, useOutreachLeads, useUpdateLead } from "@/hooks/useProspeccao";
import { etapaDoLead, patchParaEtapa } from "../prospeccao/cadencia";
import { fmtData } from "../prospeccao/shared";

interface Item {
  chave: string;
  tipo: "prospeccao" | "inbound";
  nome: string;
  sub: string;
  etapa: EtapaOportunidade;
  quando: string | null;
  conversaId: string | null;
  lead?: OutreachLead;
  sdrId?: string;
}

/** Etapa de oportunidade de um lead da prospecção (quem ainda não respondeu fica fora do funil). */
function etapaProspeccao(l: OutreachLead): EtapaOportunidade | null {
  if (l.status_comercial === "perdido") return "perdido";
  const e = etapaDoLead(l);
  if (e === "respondeu") return "conversando";
  if (e === "reuniao" || e === "proposta" || e === "ganho") return e;
  return null;
}

/** Funil único: quem respondeu à prospecção e os inbound que você colocou no funil. */
export function OportunidadesTab({ abrirConversa }: { abrirConversa: (id: string) => void }) {
  const { data: leads = [] } = useOutreachLeads();
  const { contatos, isError } = useContatos();
  const updateLead = useUpdateLead();
  const etapaInbound = useEtapaInbound();
  const { showToast } = useToast();

  const sdrPorFone = new Map(contatos.map((c) => [c.phone.replace(/\D/g, "").slice(-8), c.id]));
  const itens: Item[] = [];
  for (const l of leads) {
    const etapa = etapaProspeccao(l);
    if (!etapa) continue;
    itens.push({
      chave: `p-${l.place_id}`,
      tipo: "prospeccao",
      nome: l.empresa,
      sub: [l.nicho, l.cidade].filter(Boolean).join(" · "),
      etapa,
      quando: l.ultimo_toque_em ?? l.wa_sent_at,
      conversaId: l.whatsapp ? sdrPorFone.get(l.whatsapp.replace(/\D/g, "").slice(-8)) ?? null : null,
      lead: l,
    });
  }
  for (const c of contatos) {
    if (c.tipo !== "inbound" || !c.funil_etapa) continue;
    itens.push({
      chave: `i-${c.id}`,
      tipo: "inbound",
      nome: c.nomeExibicao,
      sub: ORIGEM_TEXTO[c.origem ?? ""] ?? c.origem ?? "",
      etapa: c.funil_etapa,
      quando: c.ultimaAtividade,
      conversaId: c.id,
      sdrId: c.id,
    });
  }

  function mover(it: Item, para: EtapaOportunidade) {
    const erro = (e: unknown) => showToast(`Erro: ${(e as Error).message}`);
    if (it.tipo === "inbound" && it.sdrId) return etapaInbound.mutate({ id: it.sdrId, etapa: para }, { onError: erro });
    if (!it.lead) return;
    const patch = para === "perdido" ? { status_comercial: "perdido" as const } : patchParaEtapa(it.lead, para === "conversando" ? "respondeu" : para);
    if (patch) updateLead.mutate({ placeId: it.lead.place_id, patch, descricao: `CRM: ${it.nome} movido para ${para}` }, { onError: erro });
  }

  return (
    <div>
      {isError && <div className="mb-3 text-[12.5px] text-attention">Os leads inbound aparecem aqui depois que o SQL do CRM unificado rodar no Supabase.</div>}
      <div className="grid grid-cols-1 items-start gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {ETAPAS_OPORTUNIDADE.map((col) => {
          const cards = itens.filter((i) => i.etapa === col.key);
          return (
            <div key={col.key}>
              <div className="mb-3 flex items-center justify-between px-0.5">
                <span className="text-[12.5px] font-semibold">{col.label}</span>
                <span className="rounded-full bg-surface-2 px-[9px] py-0.5 font-mono text-[11px] text-muted">{cards.length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {cards.length === 0 && <EmptyState>Ninguém aqui</EmptyState>}
                {cards.map((it) => (
                  <Card key={it.chave} className="p-3">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span
                        className={`rounded-[5px] px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide ${
                          it.tipo === "prospeccao" ? "bg-primary/15 text-primary-bright" : "bg-positive-tint text-positive"
                        }`}
                      >
                        {it.tipo === "prospeccao" ? "Ativa" : "Inbound"}
                      </span>
                      {it.quando && <span className="font-mono text-[10.5px] text-muted">{fmtData(it.quando, false)}</span>}
                    </div>
                    <div className="text-[13px] font-semibold leading-snug">{it.nome}</div>
                    {it.sub && <div className="text-[11px] text-muted">{it.sub}</div>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <select
                        className="min-w-0 flex-1 rounded-[6px] border border-border bg-surface-2 px-1.5 py-1 text-[11.5px]"
                        value={it.etapa}
                        onChange={(e) => mover(it, e.target.value as EtapaOportunidade)}
                      >
                        {ETAPAS_OPORTUNIDADE.map((x) => (
                          <option key={x.key} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                      {it.conversaId && (
                        <button onClick={() => abrirConversa(it.conversaId!)} aria-label="Abrir conversa" className="text-primary-bright">
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
