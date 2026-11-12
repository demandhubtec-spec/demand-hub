import * as React from "react";
import { Check, ExternalLink, FileText, ImageUp, Instagram, PencilLine } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { type AreaDiagnosticoLead, linkPrevia, linkRelatorio, type OutreachLead, useOutreachLeads } from "@/hooks/useProspeccao";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Etapa = "rita" | "duda";
type Visao = "pendente" | "ajuste" | "aprovado";

const TEXTO: Record<Etapa, { intro: string; vazio: string; proxima: string }> = {
  rita: {
    intro: "A Rita audita o Google Meu Negócio, o site e o Instagram de cada empresa aprovada e escreve nota, pontos fortes, pontos críticos e o que o dono ganha melhorando. Abra o relatório, confira e aprove.",
    vazio: "Nenhum diagnóstico esperando você. Eles chegam depois que você aprova empresas na lista do Léo.",
    proxima: "Aprovado. A Duda monta o relatório final e o site de demonstração.",
  },
  duda: {
    intro: "A Duda deixa o relatório pronto com a marca da DemandIA e a logo do cliente (o cliente recebe em PDF) e, para quem não tem site, monta o site de demonstração com a logo e as cores dele. Se a logo vier errada, suba a certa. Confira e aprove.",
    vazio: "Nada esperando você. Chega aqui depois que você aprova o diagnóstico da Rita.",
    proxima: "Aprovado. A Bia escreve as mensagens com o link do relatório e o Rui revisa.",
  },
};

const corNota = (n: number) => (n >= 70 ? "text-positive" : n >= 50 ? "text-attention" : "text-negative");

function Nota({ rotulo, a }: { rotulo: string; a: AreaDiagnosticoLead | null | undefined }) {
  return (
    <span className="whitespace-nowrap">
      {rotulo} <b className={a ? corNota(a.nota) : "text-muted"}>{a ? a.nota : "-"}</b>
    </span>
  );
}

/** Aprovação da Rita (diagnósticos) ou da Duda (relatório e site): aprovar ou pedir ajuste com um recado. */
export function EtapaRitaDuda({ etapa }: { etapa: Etapa }) {
  const { data: leads = [], isLoading } = useOutreachLeads();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [visao, setVisao] = React.useState<Visao>("pendente");
  const [ajustando, setAjustando] = React.useState<string | null>(null);
  const [nota, setNota] = React.useState("");

  const campo = etapa === "rita" ? "rita_status" : "duda_status";
  const daEtapa = leads.filter((l) => l.wa_status === "pendente" && l[campo]);
  const cont = (v: Visao) => daEtapa.filter((l) => l[campo] === v).length;
  const lista = daEtapa.filter((l) => l[campo] === visao);

  async function decidir(l: OutreachLead, status: "aprovado" | "ajuste", recado?: string) {
    const patch: Record<string, unknown> = { [campo]: status, [etapa === "rita" ? "rita_nota" : "duda_nota"]: recado ?? null };
    const { error } = await supabase.from("outreach_leads").update(patch).eq("place_id", l.place_id);
    if (error) return showToast(`Erro: ${error.message}`);
    await supabase.from("outreach_log").insert({
      channel: "portal",
      event: "config",
      place_id: l.place_id,
      detail: { msg: `${etapa === "rita" ? "Diagnóstico da Rita" : "Relatório e site da Duda"} ${status === "aprovado" ? "aprovado" : `com ajuste pedido: ${recado}`}` },
    });
    setAjustando(null);
    setNota("");
    qc.invalidateQueries({ queryKey: ["outreach"] });
    showToast(status === "aprovado" ? TEXTO[etapa].proxima : "Ajuste pedido. Volta para você na próxima rodada (até 10 minutos).");
  }

  /** Logo nova enviada pelo Kelvin: vai para o storage e a Duda refaz o site e o PDF com ela. */
  async function trocarLogo(l: OutreachLead, arquivo: File) {
    if (!arquivo.type.startsWith("image/")) return showToast("Envie uma imagem (PNG, JPG, SVG ou WEBP).");
    const ext = (arquivo.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const caminho = `logos/${l.place_id.replace(/[^A-Za-z0-9_-]/g, "")}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("materiais").upload(caminho, arquivo, { contentType: arquivo.type, upsert: true });
    if (up.error) return showToast(`Erro ao subir a logo: ${up.error.message}`);
    const url = supabase.storage.from("materiais").getPublicUrl(caminho).data.publicUrl;
    const { error } = await supabase
      .from("outreach_leads")
      .update({
        marca: { ...(l.marca ?? {}), logo: url, logo_manual: true, logo_checado: null, cores: null, logo_fundo: null, logo_pedido_em: new Date().toISOString() },
        duda_status: "ajuste",
        duda_nota: "Logo nova enviada pelo Kelvin: use esta logo e as cores dela no site.",
      })
      .eq("place_id", l.place_id);
    if (error) return showToast(`Erro: ${error.message}`);
    qc.invalidateQueries({ queryKey: ["outreach"] });
    showToast("Logo trocada. O robô mede as cores dela e a Duda refaz o site e o PDF (até 30 minutos).");
  }

  return (
    <div>
      <div className="mb-3 text-[13px] text-muted">{TEXTO[etapa].intro}</div>
      <Segmented
        value={visao}
        onChange={setVisao}
        opcoes={[
          { value: "pendente", label: `Para aprovar (${cont("pendente")})` },
          { value: "ajuste", label: `Em ajuste (${cont("ajuste")})` },
          { value: "aprovado", label: `Aprovados (${cont("aprovado")})` },
        ]}
      />
      {isLoading ? (
        <div className="text-[13px] text-muted">Carregando…</div>
      ) : !lista.length ? (
        <EmptyState>{visao === "pendente" ? TEXTO[etapa].vazio : "Nada aqui."}</EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {lista.map((l) => {
            const d = l.diagnosticos;
            const semSite = !d?.site;
            return (
              <Card key={l.place_id} className="p-4">
                <div className="flex items-start gap-3">
                  {l.marca?.logo ? (
                    <img
                      src={l.marca.logo}
                      alt=""
                      referrerPolicy="no-referrer"
                      className={cn("h-10 w-10 shrink-0 rounded-[10px] object-contain p-0.5", l.marca.logo_fundo === "escuro" ? "bg-[#111]" : "bg-white")}
                    />
                  ) : (
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-[13px] font-semibold">{l.empresa.slice(0, 1)}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      {l.empresa}
                      {l.origem === "instagram" && <Instagram className="h-3.5 w-3.5 shrink-0 text-primary-bright" aria-label="Veio da lista do Instagram" />}
                    </div>
                    <div className="text-[12px] text-muted">{[l.nicho, l.cidade].filter(Boolean).join(" · ")}</div>
                    {etapa === "duda" && l.marca?.logo_checado && !l.marca?.logo && <div className="text-[12px] text-attention">Não achei a logo. Suba a logo para o site sair com as cores do cliente.</div>}
                    {etapa === "duda" && l.marca?.cores?.primaria && (
                      <div className="mt-1 flex items-center gap-1 text-[11.5px] text-muted">
                        {[l.marca.cores.primaria, l.marca.cores.secundaria].filter(Boolean).map((c) => (
                          <span key={c} className="inline-block h-3 w-3 rounded-full border border-border" style={{ background: c! }} />
                        ))}
                        cores da logo{l.marca.logo_fonte ? ` · logo do ${l.marca.logo_fonte}` : ""}
                      </div>
                    )}
                  </div>
                  {d && (
                    <div className="text-right">
                      <div className={cn("brand-num text-[24px] leading-none", corNota(d.geral?.nota ?? 0))}>{d.geral?.nota ?? "-"}</div>
                      <div className="text-[10.5px] uppercase tracking-wide text-muted">nota geral</div>
                    </div>
                  )}
                </div>
                {d && (
                  <>
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                      <Nota rotulo="Google" a={d.google} />
                      {semSite ? <span className="text-attention">Sem site</span> : <Nota rotulo="Site" a={d.site} />}
                      <Nota rotulo="Instagram" a={d.instagram} />
                      {d.cliente_oculto && <Nota rotulo="Atendimento" a={d.cliente_oculto} />}
                    </div>
                    {d.geral?.frase && <div className="mt-2 text-[13px]">{d.geral.frase}</div>}
                  </>
                )}
                {(l.rita_nota || l.duda_nota) && visao === "ajuste" && (
                  <div className="mt-2 rounded-md bg-attention-tint p-2 text-[12px] text-attention">Seu pedido: {etapa === "rita" ? l.rita_nota : l.duda_nota}</div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {l.relatorio_token && (
                    <a href={linkRelatorio(l.relatorio_token)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-primary-bright hover:underline">
                      Abrir relatório <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {etapa === "duda" &&
                    (l.marca?.pdf ? (
                      <a href={l.marca.pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-primary-bright hover:underline">
                        <FileText className="h-3 w-3" /> PDF para o cliente
                      </a>
                    ) : (
                      <span className="text-[12px] text-muted">PDF sendo gerado</span>
                    ))}
                  {etapa === "duda" && visao !== "aprovado" && (
                    <label className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] text-muted hover:text-ink">
                      <ImageUp className="h-3 w-3" /> {l.marca?.logo ? "Trocar logo" : "Subir logo"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void trocarLogo(l, f);
                        }}
                      />
                    </label>
                  )}
                  {etapa === "duda" && semSite && l.site_preview?.token && (
                    <a href={linkPrevia(l.site_preview.token)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-primary-bright hover:underline">
                      Abrir site de demonstração <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {visao !== "aprovado" && (
                    <div className="ml-auto flex gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setAjustando(ajustando === l.place_id ? null : l.place_id)}>
                        <PencilLine /> Pedir ajuste
                      </Button>
                      <Button size="sm" onClick={() => decidir(l, "aprovado")}>
                        <Check /> Aprovar
                      </Button>
                    </div>
                  )}
                </div>
                {ajustando === l.place_id && (
                  <div className="mt-2.5">
                    <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder={`O que a ${etapa === "rita" ? "Rita" : "Duda"} precisa mudar? Seja específico.`} />
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" disabled={!nota.trim()} onClick={() => decidir(l, "ajuste", nota.trim())}>
                        Enviar ajuste
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
