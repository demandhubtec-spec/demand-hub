import * as React from "react";
import { Check, ExternalLink, FileText, ImageUp, Instagram, PencilLine, RotateCcw, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { type AreaDiagnosticoLead, linkPrevia, linkRelatorio, type OutreachLead, useOutreachLeads } from "@/hooks/useProspeccao";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { semSiteProprio } from "@/pages/comercial/prospeccao/cadencia";
import { type Coluna, esperandoLogo, fmtDuracao, montarQuadro, POR_RODADA, MINUTOS_POR_RODADA, ROTULO } from "./quadro-etapas";

type Etapa = "rita" | "duda";
type Visao = Coluna;

const TEXTO: Record<Etapa, { intro: string; vazio: string; proxima: string }> = {
  rita: {
    intro: "A Rita audita o Google Meu Negócio, o site e o Instagram de cada empresa aprovada e escreve nota, pontos fortes, pontos críticos e o que o dono ganha melhorando. Abra o relatório, confira e aprove.",
    vazio: "Nenhum diagnóstico esperando você. Eles chegam depois que você aprova empresas na lista do Léo.",
    proxima: "Aprovado. A Duda monta o relatório final e o site de demonstração.",
  },
  duda: {
    intro: "A Duda deixa o relatório pronto com a marca da DemandIA e a logo do cliente (o cliente recebe em PDF) e monta o site com a logo e as cores dele: site novo para quem não tem, versão melhorada para quem já tem. Se a logo vier errada, suba a certa. Confira e aprove.",
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
  const quadro = React.useMemo(() => montarQuadro(leads, etapa), [leads, etapa]);
  const lista = quadro.cols[visao];
  const emProducao = visao === "fila" || visao === "fazendo";

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

  /** Aprovar a lista inteira de uma vez (13/11, Kelvin: aprovar dezenas por dia sem clicar uma a uma). */
  const [aprovandoTodos, setAprovandoTodos] = React.useState(false);
  async function aprovarTodos(itens: OutreachLead[]) {
    setAprovandoTodos(true);
    const ids = itens.map((l) => l.place_id);
    const { error } = await supabase.from("outreach_leads").update({ [campo]: "aprovado", [etapa === "rita" ? "rita_nota" : "duda_nota"]: null }).in("place_id", ids).eq(campo, "pendente");
    setAprovandoTodos(false);
    if (error) return showToast(`Erro: ${error.message}`);
    await supabase.from("outreach_log").insert({
      channel: "portal",
      event: "config",
      detail: { msg: `${etapa === "rita" ? "Diagnósticos da Rita" : "Relatórios e sites da Duda"} aprovados em lote: ${ids.length}`, place_ids: ids },
    });
    qc.invalidateQueries({ queryKey: ["outreach"] });
    showToast(`${ids.length} aprovados. ${TEXTO[etapa].proxima}`);
  }

  /** Descartar a empresa (sai do fluxo e vai para Descartadas na lista do Léo) ou trazer de volta. */
  async function descartar(l: OutreachLead, volta = false) {
    const { error } = await supabase
      .from("outreach_leads")
      .update({ leo_status: volta ? "aprovado" : "descartado", leo_decidido_em: new Date().toISOString() })
      .eq("place_id", l.place_id);
    if (error) return showToast(`Erro: ${error.message}`);
    const quem = etapa === "rita" ? "diagnóstico da Rita" : "relatório e site da Duda";
    await supabase.from("outreach_log").insert({
      channel: "portal",
      event: "config",
      place_id: l.place_id,
      detail: { msg: volta ? `Empresa voltou para o fluxo (${quem})` : `Empresa descartada no ${quem}` },
    });
    qc.invalidateQueries({ queryKey: ["outreach"] });
    showToast(volta ? "Empresa de volta para aprovação." : "Empresa descartada. Ela não segue para as mensagens.");
  }

  /** Logo nova enviada pelo Kelvin: vai para o storage e a Duda refaz o site e o PDF com ela. */
  async function trocarLogo(l: OutreachLead, arquivo: File) {
    if (!arquivo.type.startsWith("image/")) return showToast("Envie uma imagem (PNG, JPG, SVG ou WEBP).");
    const ext = (arquivo.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const caminho = `comercial/logos/${l.place_id.replace(/[^A-Za-z0-9_-]/g, "")}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("estudio").upload(caminho, arquivo, { contentType: arquivo.type, upsert: true });
    if (up.error) return showToast(`Erro ao subir a logo: ${up.error.message}`);
    const url = supabase.storage.from("estudio").getPublicUrl(caminho).data.publicUrl;
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
      <QuadroEtapa etapa={etapa} quadro={quadro} visao={visao} onVisao={setVisao} />
      {visao === "pendente" && lista.length > 1 && (
        <div className="mb-3 flex justify-end">
          <Button
            size="sm"
            disabled={aprovandoTodos}
            onClick={() => {
              if (window.confirm(`Aprovar ${lista.length} ${etapa === "rita" ? "diagnósticos da Rita" : "relatórios e sites da Duda"} de uma vez?`)) void aprovarTodos(lista);
            }}
          >
            <Check /> {aprovandoTodos ? "Aprovando…" : `Aprovar todos (${lista.length})`}
          </Button>
        </div>
      )}
      {isLoading ? (
        <div className="text-[13px] text-muted">Carregando…</div>
      ) : !lista.length ? (
        <EmptyState>{visao === "pendente" ? TEXTO[etapa].vazio : visao === "fila" || visao === "fazendo" ? `Nada na fila da ${etapa === "rita" ? "Rita" : "Duda"} agora.` : "Nada aqui."}</EmptyState>
      ) : emProducao ? (
        <FilaDeProducao etapa={etapa} lista={lista} visao={visao} />
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
                      className={cn("h-10 w-10 shrink-0 rounded-[8px] object-contain p-0.5", l.marca.logo_fundo === "escuro" ? "bg-[#111]" : "bg-white")}
                    />
                  ) : (
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-surface-2 text-[13px] font-semibold">{l.empresa.slice(0, 1)}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      {l.empresa}
                      {l.origem === "instagram" && <Instagram className="h-3.5 w-3.5 shrink-0 text-primary-bright" aria-label="Veio da lista do Instagram" />}
                    </div>
                    <div className="text-[12px] text-muted">{[l.nicho, l.cidade].filter(Boolean).join(" · ")}</div>
                    {etapa === "duda" && l.marca?.logo_checado && !l.marca?.logo && <div className="text-[12px] text-attention">Não achei a logo. Suba a logo para o site sair com as cores do cliente.</div>}
                    {etapa === "duda" && l.marca?.cores?.primaria && (
                      <div className="mt-1 flex items-center gap-1 text-[12px] text-muted">
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
                      <div className="text-[12px] text-muted">nota geral</div>
                    </div>
                  )}
                </div>
                {d && (
                  <>
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
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
                    <a href={linkRelatorio(l.relatorio_token)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-primary-bright hover:underline">
                      Abrir relatório <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {etapa === "duda" &&
                    (l.marca?.pdf ? (
                      <a href={l.marca.pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-primary-bright hover:underline">
                        <FileText className="h-3 w-3" /> PDF para o cliente
                      </a>
                    ) : (
                      <span className="text-[12px] text-muted">PDF sendo gerado</span>
                    ))}
                  {etapa === "duda" && (visao === "pendente" || visao === "ajuste") && (
                    <label className="inline-flex cursor-pointer items-center gap-1 text-[13px] text-muted hover:text-ink">
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
                  {etapa === "duda" && !l.site_preview?.token && <span className="text-[12px] text-muted">Site sendo montado</span>}
                  {etapa === "duda" && l.site_preview?.token && (
                    <a href={linkPrevia(l.site_preview.token)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-primary-bright hover:underline">
                      {(l.site_preview as { tipo?: string }).tipo === "melhoria" ? "Abrir versão melhorada do site" : "Abrir site novo (demonstração)"} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {etapa === "duda" && <SiteAtual l={l} />}
                  {visao === "descartado" && (
                    <div className="ml-auto">
                      <Button size="sm" variant="ghost" onClick={() => descartar(l, true)}>
                        <RotateCcw /> Trazer de volta
                      </Button>
                    </div>
                  )}
                  {(visao === "pendente" || visao === "ajuste") && (
                    <div className="ml-auto flex gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => descartar(l)}>
                        <X /> Descartar
                      </Button>
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

/** Site atual do cliente, ao lado do site novo, para comparar os dois. */
function SiteAtual({ l }: { l: OutreachLead }) {
  const atual = ((l.site_preview as { site_atual?: string | null } | null)?.site_atual ?? l.site ?? "").trim();
  if (!atual) return <span className="text-[12px] text-muted">Cliente sem site hoje</span>;
  const href = /^https?:\/\//i.test(atual) ? atual : `https://${atual}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-primary-bright hover:underline">
      {semSiteProprio(atual) ? "Página atual do cliente (sem site próprio)" : "Site atual do cliente"} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

const COLUNAS: Coluna[] = ["fila", "fazendo", "ajuste", "pendente", "aprovado", "descartado"];
const COR: Record<Coluna, string> = {
  fila: "border-l-muted",
  fazendo: "border-l-primary-bright",
  ajuste: "border-l-attention",
  pendente: "border-l-primary-bright",
  aprovado: "border-l-positive",
  descartado: "border-l-negative",
};
const DICA: Record<Coluna, string> = {
  fila: "esperando a vez",
  fazendo: `${POR_RODADA} a cada ${MINUTOS_POR_RODADA} min`,
  ajuste: "refazendo o que você pediu",
  pendente: "esperando você",
  aprovado: "seguiram adiante",
  descartado: "saíram do fluxo",
};

/** Quadro da etapa: o que chegou, o que está sendo feito, o que espera você e o que já saiu. Clique para ver a lista. */
function QuadroEtapa({ etapa, quadro, visao, onVisao }: { etapa: "rita" | "duda"; quadro: ReturnType<typeof montarQuadro>; visao: Coluna; onVisao: (v: Coluna) => void }) {
  const quem = etapa === "rita" ? "Rita" : "Duda";
  const pct = quadro.chegou ? Math.round((quadro.entregues / quadro.chegou) * 100) : 0;
  return (
    <div className="mb-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
        <span>
          Chegaram para a {quem}: <b>{quadro.chegou}</b>
        </span>
        <span>
          Entregues: <b>{quadro.entregues}</b> ({pct}%)
        </span>
        <span>
          Feitos hoje: <b>{quadro.hoje}</b>
        </span>
        <span className="text-muted">Para zerar a fila: {fmtDuracao(quadro.horasParaZerar)} de trabalho</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary-bright transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {COLUNAS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onVisao(c)}
            className={cn(
              "rounded-[12px] border border-border border-l-4 bg-surface p-2.5 text-left transition hover:bg-surface-2",
              COR[c],
              visao === c && "ring-2 ring-primary-bright",
            )}
          >
            <div className="text-[12px] text-muted">{ROTULO[etapa][c]}</div>
            <div className="brand-num text-[20px] leading-tight">{quadro.cols[c].length}</div>
            <div className="text-[12px] text-muted">
              {c === "fila" && etapa === "duda" && quadro.esperandoLogo ? `${quadro.esperandoLogo} esperando a logo` : DICA[c]}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Lista simples do que está na fila ou sendo feito agora (sem ações: ainda está com a IA). */
function FilaDeProducao({ etapa, lista, visao }: { etapa: "rita" | "duda"; lista: OutreachLead[]; visao: Coluna }) {
  const [todos, setTodos] = React.useState(false);
  const mostra = todos ? lista : lista.slice(0, 60);
  return (
    <Card className="p-0">
      <div className="border-b border-border px-4 py-2.5 text-[13px] text-muted">
        {visao === "fazendo"
          ? `A ${etapa === "rita" ? "Rita" : "Duda"} está fazendo estas agora. Ficam prontas na próxima rodada (até ${MINUTOS_POR_RODADA} minutos).`
          : `Na ordem em que a ${etapa === "rita" ? "Rita" : "Duda"} vai pegar.`}
      </div>
      <ol className="divide-y divide-border">
        {mostra.map((l, i) => (
          <li key={l.place_id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
            <span className="w-6 shrink-0 text-right text-[12px] text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{l.empresa}</span>
            <span className="hidden truncate text-[12px] text-muted sm:block">{[l.nicho, l.cidade].filter(Boolean).join(" · ")}</span>
            {etapa === "duda" && esperandoLogo(l) && <span className="shrink-0 text-[12px] text-attention">esperando a logo</span>}
          </li>
        ))}
      </ol>
      {lista.length > mostra.length && (
        <div className="border-t border-border px-4 py-2 text-center">
          <Button size="sm" variant="ghost" onClick={() => setTodos(true)}>
            Ver todas ({lista.length})
          </Button>
        </div>
      )}
    </Card>
  );
}
