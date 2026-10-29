import * as React from "react";
import { AtSign, Check, Copy, ExternalLink, Globe, RefreshCw, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { type OutreachLead, linkPrevia, useGerarExtra, useMarcarDirect } from "@/hooks/useProspeccao";
import { semSiteProprio } from "./cadencia";

const dataBR = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function urlInstagram(ig: string) {
  const s = ig.trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://www.instagram.com/${s.replace(/^@/, "")}/`;
}

/** Canais extras do lead: Direct do Instagram (copia e cola) e a prévia de site grátis. */
export function ExtrasLead({ lead }: { lead: OutreachLead }) {
  const gerar = useGerarExtra();
  const marcar = useMarcarDirect();
  const { showToast } = useToast();
  const [gerando, setGerando] = React.useState<"direct" | "site" | null>(null);

  const temIg = !!lead.instagram?.trim();
  const mostraSite = semSiteProprio(lead.site) || !!lead.site_preview;
  if (!temIg && !mostraSite) return null;

  async function pedir(tipo: "direct" | "site") {
    setGerando(tipo);
    try {
      await gerar.mutateAsync({ placeId: lead.place_id, tipo });
      showToast(tipo === "direct" ? "Direct escrito" : "Prévia de site pronta");
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    } finally {
      setGerando(null);
    }
  }

  async function copiar(texto: string, msg: string) {
    try {
      await navigator.clipboard.writeText(texto);
      showToast(msg);
    } catch {
      showToast("Não consegui copiar. Selecione o texto e copie na mão.");
    }
  }

  const link = lead.site_preview?.token ? linkPrevia(lead.site_preview.token) : null;

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {temIg && (
        <div className="rounded-xl border border-border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <AtSign className="h-3.5 w-3.5" /> Direct do Instagram · envio manual
            <span className={lead.dm_instagram_enviado_em ? "ml-auto normal-case text-positive" : "ml-auto normal-case"}>
              {lead.dm_instagram_enviado_em ? `Enviado ${dataBR(lead.dm_instagram_enviado_em)}` : "Não enviado"}
            </span>
          </div>
          {lead.dm_instagram ? (
            <>
              <div className="whitespace-pre-wrap rounded-lg bg-surface-2 p-2.5 text-[13px] leading-relaxed">{lead.dm_instagram}</div>
              <div className="mt-2 text-[11.5px] text-muted">Copie, abra o perfil, toque em Mensagem e cole. Depois marque como enviado.</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => copiar(lead.dm_instagram ?? "", "Texto copiado")}>
                  <Copy /> Copiar texto
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.open(urlInstagram(lead.instagram ?? ""), "_blank", "noopener")}>
                  <ExternalLink /> Abrir perfil
                </Button>
                {lead.dm_instagram_enviado_em ? (
                  <Button size="sm" variant="ghost" onClick={() => marcar.mutate({ lead, enviado: false })}>
                    <Undo2 /> Desfazer
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => marcar.mutate({ lead, enviado: true })} disabled={marcar.isPending}>
                    <Check /> Marcar como enviado
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => pedir("direct")} disabled={gerando !== null}>
                  <RefreshCw /> {gerando === "direct" ? "Escrevendo..." : "Escrever de novo"}
                </Button>
              </div>
            </>
          ) : (
            <Button size="sm" onClick={() => pedir("direct")} disabled={gerando !== null}>
              <Sparkles /> {gerando === "direct" ? "Escrevendo..." : "Escrever Direct"}
            </Button>
          )}
        </div>
      )}

      {mostraSite && (
        <div className="rounded-xl border border-border p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Globe className="h-3.5 w-3.5" /> Prévia de site grátis
          </div>
          {link ? (
            <>
              <div className="text-[13px] font-semibold">{lead.site_preview?.titulo}</div>
              <div className="mt-0.5 text-[12px] text-muted">
                3 seções de como ficaria o site. A Ana manda o link quando a pessoa se interessar; você também pode mandar.
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => window.open(link, "_blank", "noopener")}>
                  <ExternalLink /> Abrir prévia
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copiar(link, "Link copiado")}>
                  <Copy /> Copiar link
                </Button>
                <Button size="sm" variant="ghost" onClick={() => pedir("site")} disabled={gerando !== null}>
                  <RefreshCw /> {gerando === "site" ? "Montando..." : "Refazer"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 text-[12px] text-muted">A empresa não tem site próprio. Monte um rascunho de 3 seções para usar como presente.</div>
              <Button size="sm" onClick={() => pedir("site")} disabled={gerando !== null}>
                <Sparkles /> {gerando === "site" ? "Montando..." : "Montar prévia"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
