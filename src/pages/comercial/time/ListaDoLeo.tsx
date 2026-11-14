import * as React from "react";
import { Check, Download, ExternalLink, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { chamarSdr, type OutreachLead, useOutreachLeads } from "@/hooks/useProspeccao";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { FichaLead } from "../prospeccao/FichaLead";
import { fmtTelefone, linkExterno } from "../prospeccao/shared";

type Visao = "pendente" | "pesquisando" | "aprovado" | "descartado";

const FONTE_SITE: Record<string, string> = { google: "Google", whatsapp: "recado do WhatsApp", instagram: "bio do Instagram" };
const fmtCnpj = (d: string) => d.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

/** Colunas da planilha (Excel): as mesmas da planilha do Google. */
const COLUNAS: [string, (l: OutreachLead) => string | number | null | undefined][] = [
  ["Situação na lista", (l) => ({ pendente: "Aguardando sua aprovação", aprovado: "Aprovada", descartado: "Descartada" } as Record<string, string>)[l.leo_status ?? ""] ?? "Léo ainda pesquisando"],
  ["Empresa", (l) => l.empresa],
  ["Nicho", (l) => l.nicho],
  ["Cidade", (l) => l.cidade],
  ["Nota no Google", (l) => (l.nota != null ? String(l.nota).replace(".", ",") : "")],
  ["Avaliações", (l) => l.avaliacoes],
  ["WhatsApp", (l) => l.whatsapp],
  ["E-mail", (l) => l.email],
  ["Site", (l) => l.site],
  ["Site achado em", (l) => FONTE_SITE[l.site_fonte ?? ""] ?? (l.site ? "Google" : "Não tem")],
  ["Instagram", (l) => l.instagram],
  ["LinkedIn da empresa", (l) => l.linkedin_empresa],
  ["CNPJ", (l) => (l.cnpj ? fmtCnpj(l.cnpj) : "")],
  ["Razão social", (l) => l.razao_social],
  ["Situação na Receita", (l) => l.cnpj_situacao],
  ["Atividade", (l) => l.cnae],
  ["Dono", (l) => l.decisor],
  ["Sócios", (l) => (l.socios ?? []).map((s) => s.nome).join(", ")],
  ["LinkedIn do dono (confira)", (l) => l.linkedin_decisor],
  ["Instagram do dono (confira)", (l) => l.dono_instagram],
  ["Telefone na Receita", (l) => l.cnpj_telefone],
  ["E-mail na Receita", (l) => l.cnpj_email],
];

function baixarExcel(lista: OutreachLead[]) {
  // CSV com ponto e vírgula e BOM: abre direto no Excel em português, com acentos
  const cel = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = [COLUNAS.map(([t]) => cel(t)).join(";"), ...lista.map((l) => COLUNAS.map(([, f]) => cel(f(l))).join(";"))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `lista-do-leo-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const visaoDo = (l: OutreachLead): Visao =>
  l.leo_status === "aprovado" ? "aprovado" : l.leo_status === "descartado" ? "descartado" : l.leo_status === "pendente" ? "pendente" : "pesquisando";

/**
 * Lista do Léo: tudo que ele achou de cada empresa, para o Kelvin analisar uma por uma.
 * Só quem for aprovado segue para a Rita (raio-x) e a Bia (mensagens).
 */
export function ListaDoLeo() {
  const { data: leads = [], isLoading } = useOutreachLeads();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [visao, setVisao] = React.useState<Visao>("pendente");
  const [busca, setBusca] = React.useState("");
  // Filtro por nicho (pedido do Kelvin, 11/11): aprovar nicho por nicho, na ordem de prioridade dele
  const [nicho, setNicho] = React.useState("");
  const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
  const [aberto, setAberto] = React.useState<OutreachLead | null>(null);
  const [abrindoSheets, setAbrindoSheets] = React.useState(false);

  // Só quem ainda vai ser abordado e já passou (ou está passando) pelo Léo
  const daLista = leads.filter((l) => l.wa_status === "pendente" && (l.enriquecimento || l.leo_status) && ["sem", "gerando"].includes(l.msg_status));
  const cont = (v: Visao) => daLista.filter((l) => visaoDo(l) === v).length;
  const nichoDe = (l: OutreachLead) => (l.nicho ?? "").trim() || "Sem nicho";
  const daVisao = daLista.filter((l) => visaoDo(l) === visao);
  const nichos = [...daVisao.reduce((m, l) => m.set(nichoDe(l), (m.get(nichoDe(l)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const lista = daVisao
    .filter((l) => !nicho || nichoDe(l) === nicho)
    .filter((l) => !busca.trim() || `${l.empresa} ${l.nicho ?? ""} ${l.cidade ?? ""} ${l.decisor ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase()));

  async function decidir(ids: string[], status: "aprovado" | "descartado" | null) {
    if (!ids.length) return;
    const { error } = await supabase
      .from("outreach_leads")
      .update({ leo_status: status ?? "pendente", leo_decidido_em: status ? new Date().toISOString() : null })
      .in("place_id", ids);
    if (error) return showToast(`Erro: ${error.message}`);
    await supabase.from("outreach_log").insert({
      channel: "portal",
      event: "config",
      detail: { msg: `Lista do Léo: ${ids.length} ${status === "aprovado" ? "aprovada(s), seguem para o diagnóstico da Rita" : status === "descartado" ? "descartada(s)" : "de volta para análise"}` },
    });
    setMarcados(new Set());
    qc.invalidateQueries({ queryKey: ["outreach"] });
    showToast(status === "aprovado" ? `${ids.length} aprovada(s). A Rita começa o diagnóstico.` : status === "descartado" ? `${ids.length} descartada(s)` : "De volta para análise");
  }

  async function abrirSheets() {
    setAbrindoSheets(true);
    try {
      const r = await chamarSdr<{ url?: string; conectar?: string }>("/api/prospeccao/planilha", {});
      if (r.conectar) {
        window.open(r.conectar, "_blank");
        showToast("Autorize o Google na aba que abriu e clique de novo em Abrir no Google Sheets.");
      } else if (r.url) window.open(r.url, "_blank");
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    } finally {
      setAbrindoSheets(false);
    }
  }

  const todosMarcados = lista.length > 0 && lista.every((l) => marcados.has(l.place_id));
  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <div className="mb-3 text-[13px] text-muted">
        O Léo confere site (Google, WhatsApp e Instagram), CNPJ, sócios e o dono de cada empresa. Só entra na lista quem tem WhatsApp conferido (ele procura
        no Google, no site, na Receita e no Instagram) e nunca falou com a gente. Analise e aprove: só o que você aprovar segue para o diagnóstico da Rita.
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          className="mb-0"
          value={visao}
          onChange={(v) => {
            setVisao(v);
            setNicho("");
            setMarcados(new Set());
          }}
          opcoes={[
            { value: "pendente", label: `Para aprovar (${cont("pendente")})` },
            { value: "pesquisando", label: `Léo pesquisando (${cont("pesquisando")})` },
            { value: "aprovado", label: `Aprovadas (${cont("aprovado")})` },
            { value: "descartado", label: `Descartadas (${cont("descartado")})` },
          ]}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={abrirSheets} disabled={abrindoSheets}>
            <FileSpreadsheet /> {abrindoSheets ? "Abrindo…" : "Abrir no Google Sheets"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => baixarExcel(daLista)}>
            <Download /> Baixar planilha (Excel)
          </Button>
        </div>
      </div>

      {nichos.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[13px] text-muted">Nichos:</span>
          {[["", daVisao.length] as [string, number], ...nichos].map(([n, q]) => (
            <button
              key={n || "todos"}
              type="button"
              onClick={() => {
                setNicho(n);
                setMarcados(new Set());
              }}
              className={`rounded-full border px-3 py-1 text-[13px] ${nicho === n ? "border-primary bg-primary/15 text-ink" : "border-border text-muted hover:text-ink"}`}
            >
              {n || "Todos"} ({q})
            </button>
          ))}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa, nicho, cidade ou dono" className="max-w-[320px]" />
        {marcados.size > 0 && (
          <>
            <span className="text-[13px] text-muted">{marcados.size} marcada(s)</span>
            {visao !== "aprovado" && (
              <Button size="sm" onClick={() => decidir([...marcados], "aprovado")}>
                <Check /> Aprovar
              </Button>
            )}
            {visao !== "descartado" && (
              <Button variant="ghost" size="sm" onClick={() => decidir([...marcados], "descartado")}>
                <X /> Descartar
              </Button>
            )}
            {(visao === "aprovado" || visao === "descartado") && (
              <Button variant="ghost" size="sm" onClick={() => decidir([...marcados], null)}>
                Voltar para análise
              </Button>
            )}
          </>
        )}
      </div>

      {isLoading ? (
        <div className="text-[13px] text-muted">Carregando a lista…</div>
      ) : !lista.length ? (
        <EmptyState>
          {visao === "pendente" ? "Nada esperando sua aprovação. Quando o Léo terminar uma empresa, ela aparece aqui." : "Nenhuma empresa aqui."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-border">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead className="bg-surface-2/60 text-left text-[12px] text-muted">
              <tr>
                <th className="w-8 p-2.5">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={() => setMarcados(todosMarcados ? new Set() : new Set(lista.map((l) => l.place_id)))}
                  />
                </th>
                <th className="p-2.5">Empresa</th>
                <th className="p-2.5">Site</th>
                <th className="p-2.5">Instagram</th>
                <th className="p-2.5">CNPJ e Receita</th>
                <th className="p-2.5">Dono</th>
                <th className="p-2.5">Contatos</th>
                <th className="p-2.5" />
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.place_id} className={cn("border-t border-border align-top", marcados.has(l.place_id) && "bg-primary-tint/30")}>
                  <td className="p-2.5">
                    <input type="checkbox" checked={marcados.has(l.place_id)} onChange={() => alternar(l.place_id)} />
                  </td>
                  <td className="p-2.5">
                    <button className="text-left font-semibold hover:text-primary-bright" onClick={() => setAberto(l)}>
                      {l.empresa}
                    </button>
                    <div className="text-muted">
                      {[l.nicho, l.cidade].filter(Boolean).join(" · ")}
                      {l.nota != null && ` · ${String(l.nota).replace(".", ",")}★ (${l.avaliacoes ?? 0})`}
                    </div>
                  </td>
                  <td className="p-2.5">
                    {l.site ? (
                      <>
                        <a href={linkExterno(l.site) ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-bright hover:underline">
                          abrir <ExternalLink className="h-3 w-3" />
                        </a>
                        <div className="text-muted">{FONTE_SITE[l.site_fonte ?? ""] ?? "Google"}</div>
                      </>
                    ) : (
                      <span className="text-attention">não tem</span>
                    )}
                  </td>
                  <td className="p-2.5">
                    {l.instagram ? (
                      <a href={linkExterno(l.instagram) ?? undefined} target="_blank" rel="noreferrer" className="text-primary-bright hover:underline">
                        @{(l.instagram.match(/instagram\.com\/([^/?]+)/i)?.[1] ?? "perfil").toLowerCase()}
                      </a>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="p-2.5">
                    {l.cnpj ? (
                      <>
                        <div>{fmtCnpj(l.cnpj)}</div>
                        <div className="text-muted">{[l.cnpj_situacao?.toLowerCase(), l.razao_social].filter(Boolean).join(" · ")}</div>
                      </>
                    ) : (
                      <span className="text-muted">não encontrado</span>
                    )}
                  </td>
                  <td className="p-2.5">
                    {l.decisor ? <div className="font-semibold">{l.decisor}</div> : <span className="text-muted">-</span>}
                    {(l.socios?.length ?? 0) > 1 && <div className="text-muted">{l.socios!.length} sócios</div>}
                    <div className="flex gap-2">
                      {l.linkedin_decisor && (
                        <a href={l.linkedin_decisor} target="_blank" rel="noreferrer" className="text-primary-bright hover:underline">
                          LinkedIn
                        </a>
                      )}
                      {l.dono_instagram && (
                        <a href={l.dono_instagram} target="_blank" rel="noreferrer" className="text-primary-bright hover:underline">
                          Instagram
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="p-2.5">
                    {l.whatsapp && <div>{fmtTelefone(l.whatsapp)}</div>}
                    {l.email && <div className="text-muted">{l.email}</div>}
                    {l.cnpj_email && l.cnpj_email !== l.email && <div className="text-muted">{l.cnpj_email} (Receita)</div>}
                  </td>
                  <td className="p-2.5">
                    <div className="flex gap-1.5">
                      {visao !== "aprovado" && (
                        <Button size="sm" variant="ghost" title="Aprovar" onClick={() => decidir([l.place_id], "aprovado")}>
                          <Check />
                        </Button>
                      )}
                      {visao !== "descartado" && (
                        <Button size="sm" variant="ghost" title="Descartar" onClick={() => decidir([l.place_id], "descartado")}>
                          <X />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aberto && <FichaLead lead={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}
