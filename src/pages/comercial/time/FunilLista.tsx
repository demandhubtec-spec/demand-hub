import * as React from "react";
import { CopyX, ExternalLink, Send, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { useContatos } from "@/hooks/useCrm";
import {
  type EtapaLista,
  type ListaExtra,
  type ListaLead,
  lerCsv,
  useAtualizarListaLead,
  useAvisos,
  useImportarRodada,
  useListaLeads,
  useMarcarAvisoLido,
} from "@/hooks/useComercial";
import { cn } from "@/lib/utils";
import { chamarSdr, type OutreachLead, useOutreachLeads, useUpdateLead } from "@/hooks/useProspeccao";
import { useQueryClient } from "@tanstack/react-query";
import { type CardItem, Quadro } from "./FunilKanban";
import { type Coluna, etapaListaDoTime, etapaOutboundDaLista, passoDoTime, patchOutbound, placeIdInstagram } from "./funis";

const fim8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);
const NOME: Record<ListaExtra, string> = { instagram: "Instagram", linkedin: "LinkedIn", ligacoes: "Ligações" };

/** Kanban das listas Instagram, LinkedIn e Ligações. Mover o card só muda a etapa; nada é enviado para o lead. */
export function FunilLista({
  lista,
  colunas,
  abrirConversa,
}: {
  lista: ListaExtra;
  colunas: readonly Coluna<EtapaLista>[];
  abrirConversa: (id: string) => void;
}) {
  const { data: todos = [], isLoading } = useListaLeads();
  const { contatos } = useContatos();
  const atualizar = useAtualizarListaLead();
  const { showToast } = useToast();
  const [rodada, setRodada] = React.useState("");
  const [segmento, setSegmento] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [aberto, setAberto] = React.useState<ListaLead | null>(null);
  const [importar, setImportar] = React.useState(false);

  const daLista = todos.filter((l) => l.lista === lista);
  const rodadas = [...new Set(daLista.map((l) => l.rodada ?? "Sem rodada"))];
  const segmentos = [...new Set(daLista.map((l) => l.nicho).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const visiveis = daLista.filter(
    (l) => (!rodada || (l.rodada ?? "Sem rodada") === rodada) && (!segmento || l.nicho === segmento) && (!nota || l.nota === nota),
  );
  const porId = new Map(visiveis.map((l) => [l.id, l]));
  // Instagram: quem já foi para o time (Rita, Duda, Bia, Gabi) segue a etapa da prospecção ativa
  const { data: prospeccao = [] } = useOutreachLeads();
  const doTimePorPlace = React.useMemo(() => new Map(prospeccao.filter((p) => p.origem === "instagram").map((p) => [p.place_id, p])), [prospeccao]);
  const noTime = (l: ListaLead): OutreachLead | null => {
    if (lista !== "instagram") return null;
    const pid = placeIdInstagram(l.perfil_url, l.perfil);
    return pid ? doTimePorPlace.get(pid) ?? null : null;
  };
  const etapaDe = (l: ListaLead) => {
    const t = noTime(l);
    return t ? etapaListaDoTime(t) : l.etapa;
  };
  const updateLead = useUpdateLead();
  const qc = useQueryClient();
  const [mandando, setMandando] = React.useState(false);
  const prontosParaOTime = lista === "instagram" ? visiveis.filter((l) => l.etapa === "na_lista" && !noTime(l) && (l.whatsapp ?? "").replace(/\D/g, "").length >= 10) : [];
  const semWhatsNaLista = lista === "instagram" ? visiveis.filter((l) => l.etapa === "na_lista" && !noTime(l) && (l.whatsapp ?? "").replace(/\D/g, "").length < 10).length : 0;
  async function mandarParaOTime() {
    if (!prontosParaOTime.length) return;
    if (!window.confirm(`Mandar ${prontosParaOTime.length} empresa(s) para o time? A Rita faz o raio-x, a Duda o PDF e o site, a Bia as mensagens, e nada sai sem a sua aprovação.`)) return;
    setMandando(true);
    try {
      const r = await chamarSdr<{ enviados: number; sem_whatsapp: number; ja_estavam: number }>("/api/prospeccao/instagram", { ids: prontosParaOTime.map((l) => l.id) });
      qc.invalidateQueries({ queryKey: ["outreach"] });
      showToast(`${r.enviados} empresa(s) foram para a Rita.${r.ja_estavam ? ` ${r.ja_estavam} já estavam na prospecção.` : ""}${r.sem_whatsapp ? ` ${r.sem_whatsapp} sem WhatsApp ficaram de fora.` : ""}`);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    } finally {
      setMandando(false);
    }
  }
  const conversaPorFone = React.useMemo(() => new Map(contatos.map((c) => [fim8(c.phone), c.id])), [contatos]);
  const parado = (l: ListaLead) =>
    l.etapa === "contato" && Date.now() - new Date(l.atualizado_em).getTime() > 3 * 86400_000
      ? `sem resposta há ${Math.floor((Date.now() - new Date(l.atualizado_em).getTime()) / 86400_000)} dias`
      : null;
  const itens: CardItem[] = visiveis.map((l) => ({
    id: l.id,
    titulo: l.empresa,
    sub: [l.nicho, lista === "ligacoes" ? l.cidade : l.rodada?.split(" · ")[0]].filter(Boolean).join(" · "),
    quando: l.atualizado_em,
    conversa: fim8(l.whatsapp) ? conversaPorFone.get(fim8(l.whatsapp)) ?? null : null,
    nota: l.nota,
    etiqueta:
      lista === "ligacoes"
        ? l.tentativas
          ? `${l.tentativas} tentativa${l.tentativas > 1 ? "s" : ""}`
          : null
        : noTime(l)
          ? passoDoTime(noTime(l)!) ?? "Gabi"
          : l.canal,
    valor: l.etapa === "ganho" ? l.valor : null,
    aviso: parado(l),
  }));

  function mover(id: string, para: EtapaLista) {
    const l = porId.get(id);
    if (!l) return;
    const nome = colunas.find((c) => c.key === para)?.label;
    const t = noTime(l);
    if (t) {
      const destino = etapaOutboundDaLista(para);
      const patch = destino ? patchOutbound(t, destino) : null;
      if (!patch) return showToast("Essa etapa é marcada sozinha quando a Gabi manda a mensagem.");
      return updateLead.mutate(
        { placeId: t.place_id, patch, descricao: `Funil Instagram: ${l.empresa} → ${nome}` },
        { onSuccess: () => showToast(`${l.empresa} → ${nome}`), onError: (e) => showToast(`Erro: ${(e as Error).message}`) },
      );
    }
    atualizar.mutate(
      { id, patch: { etapa: para } },
      { onSuccess: () => showToast(`${l.empresa} → ${nome}`), onError: (e) => showToast(`Erro: ${(e as Error).message}`) },
    );
  }

  const chip = (ativo: boolean) =>
    cn("rounded-[8px] border px-3 py-1.5 text-[13px]", ativo ? "border-primary-bright bg-primary-tint text-ink" : "border-border bg-surface text-muted hover:text-ink");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {lista !== "ligacoes" && rodadas.length > 0 && (
          <>
            <span className="mr-1 text-[12px] text-muted">Rodada</span>
            <button className={chip(!rodada)} onClick={() => setRodada("")}>
              Todas
            </button>
            {rodadas.map((r) => (
              <button key={r} className={chip(rodada === r)} onClick={() => setRodada(r)}>
                {r} <b className="ml-1 font-medium text-muted">{daLista.filter((l) => (l.rodada ?? "Sem rodada") === r).length}</b>
              </button>
            ))}
          </>
        )}
        {segmentos.length > 0 && (
          <select value={segmento} onChange={(e) => setSegmento(e.target.value)} className="ml-2 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[13px]">
            <option value="">Todos os segmentos</option>
            {segmentos.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
        {lista !== "ligacoes" && (
          <select value={nota} onChange={(e) => setNota(e.target.value)} className="rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[13px]">
            <option value="">Todas as notas</option>
            <option>Quente</option>
            <option>Morno</option>
            <option>Frio</option>
          </select>
        )}
        {lista === "instagram" && (
          <Button size="sm" variant="ghost" className="ml-auto" disabled={mandando || !prontosParaOTime.length} onClick={mandarParaOTime} title={semWhatsNaLista ? `${semWhatsNaLista} sem WhatsApp ficam na lista (só Direct)` : undefined}>
            <Send /> {mandando ? "Mandando…" : `Mandar para o time (${prontosParaOTime.length})`}
          </Button>
        )}
        {lista !== "ligacoes" && (
          <Button size="sm" className={lista === "instagram" ? "" : "ml-auto"} onClick={() => setImportar(true)}>
            <Upload /> Nova rodada
          </Button>
        )}
      </div>

      <AvisosRepetidos lista={lista} />

      {isLoading ? (
        <div className="text-[13px] text-muted">Carregando o funil…</div>
      ) : !daLista.length ? (
        <EmptyState>
          {lista === "ligacoes"
            ? "Nenhuma ligação ainda. Quando a empresa parceira começar a mandar os dados pelo webhook (Configurações > Ligações · webhook), os contatos aparecem aqui."
            : lista === "linkedin"
              ? "Lista do LinkedIn em breve. Quando tiver a primeira coleta, importe em \"Nova rodada\"."
              : "Nenhum lead nesta lista ainda. Importe a planilha em \"Nova rodada\"."}
        </EmptyState>
      ) : (
        <Quadro
          colunas={colunas}
          itens={itens}
          etapa={(id) => {
            const l = porId.get(id);
            return l ? etapaDe(l) : null;
          }}
          mover={mover}
          abrir={(id) => setAberto(porId.get(id) ?? null)}
          abrirConversa={abrirConversa}
        />
      )}
      {aberto && <FichaListaLead lead={aberto} onClose={() => setAberto(null)} />}
      {importar && <ImportarRodada lista={lista} onClose={() => setImportar(false)} />}
    </div>
  );
}

function AvisosRepetidos({ lista }: { lista: ListaExtra }) {
  const { data: avisos = [] } = useAvisos();
  const lido = useMarcarAvisoLido();
  const [ver, setVer] = React.useState<string | null>(null);
  const meus = avisos.filter((a) => a.lista === lista && !a.lido);
  if (!meus.length) return null;
  return (
    <div className="mb-3 space-y-2">
      {meus.slice(0, 3).map((a) => (
        <div key={a.id} className="rounded-[12px] border border-attention/35 bg-attention-tint px-4 py-2.5 text-[13px] text-[#ffd9a8]">
          <div className="flex flex-wrap items-center gap-3">
            <CopyX className="h-4 w-4 text-attention" />
            <span className="flex-1">{a.texto}</span>
            {a.detalhes.length > 0 && (
              <button className="text-attention hover:underline" onClick={() => setVer(ver === a.id ? null : a.id)}>
                {ver === a.id ? "Esconder" : "Ver quais"}
              </button>
            )}
            <button className="text-muted hover:text-ink" onClick={() => lido.mutate(a.id)}>
              Ok, entendi
            </button>
          </div>
          {ver === a.id && (
            <ul className="mt-2 space-y-0.5 pl-7 text-[13px] text-ink/85">
              {a.detalhes.map((d, i) => (
                <li key={i}>
                  {d.empresa ?? d.perfil} · ficou em <b>{d.ficou_em}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ImportarRodada({ lista, onClose }: { lista: ListaExtra; onClose: () => void }) {
  const importar = useImportarRodada();
  const { showToast } = useToast();
  const mes = new Date().toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(". de ", "/").replace(" de ", "/").replace(".", "");
  const [rodada, setRodada] = React.useState(`Concorrente · ${mes}`);
  const [linhas, setLinhas] = React.useState<ReturnType<typeof lerCsv>>([]);
  const [arquivo, setArquivo] = React.useState("");
  const semInteresse = linhas.filter((l) => l.etapa === "sem_interesse").length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogTitle>Nova rodada · {NOME[lista]}</DialogTitle>
        <DialogDescription>
          Exporte a aba Leads da planilha em CSV e escolha o arquivo. Lead repetido fica na lista onde apareceu primeiro e você recebe o aviso. Ninguém
          recebe mensagem sozinho: o primeiro contato continua passando pela sua aprovação.
        </DialogDescription>
        <label className="mt-3 block text-[13px] text-muted">
          Nome da rodada (o concorrente e o mês)
          <input
            value={rodada}
            onChange={(e) => setRodada(e.target.value)}
            className="mt-1 w-full rounded-[8px] border border-border bg-surface px-3 py-2 text-[14px] text-ink"
          />
        </label>
        <label className="mt-3 block text-[13px] text-muted">
          Arquivo CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full text-[13px] text-ink"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setArquivo(f.name);
              setLinhas(lerCsv(await f.text()));
            }}
          />
        </label>
        {arquivo && (
          <div className="mt-3 rounded-[8px] border border-border bg-surface-2 px-3 py-2 text-[13px]">
            {linhas.length} leads no arquivo{semInteresse ? `, ${semInteresse} marcados como sem interesse (ficam de fora)` : ""}.
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!linhas.length || !rodada.trim() || importar.isPending}
            onClick={() =>
              importar.mutate(
                { lista, rodada: rodada.trim(), linhas },
                {
                  onSuccess: (r) => {
                    showToast(
                      `${r.entraram} leads entraram` + (r.repetidos.length ? ` · ${r.repetidos.length} repetidos descartados` : "") + (r.sem_interesse ? ` · ${r.sem_interesse} sem interesse fora` : ""),
                    );
                    onClose();
                  },
                  onError: (e) => showToast(`Erro: ${(e as Error).message}`),
                },
              )
            }
          >
            {importar.isPending ? "Importando…" : "Importar rodada"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FichaListaLead({ lead, onClose }: { lead: ListaLead; onClose: () => void }) {
  const atualizar = useAtualizarListaLead();
  const { showToast } = useToast();
  const [obs, setObs] = React.useState(lead.observacoes ?? "");
  const [valor, setValor] = React.useState(lead.valor != null ? String(lead.valor) : "");
  const wa = (lead.whatsapp ?? "").replace(/\D/g, "");
  const linhas: [string, React.ReactNode][] = [
    ["Segmento", lead.nicho],
    ["Cidade", lead.cidade],
    ["Rodada", lead.rodada],
    ["Nota", lead.nota ? `${lead.nota}${lead.pontos != null ? ` (${lead.pontos} pontos)` : ""}` : null],
    ["De onde veio", lead.fonte],
    ["Comentário", lead.comentario],
    ["E-mail", lead.email],
    ["Tentativas de ligação", lead.lista === "ligacoes" ? lead.tentativas : null],
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="left-auto right-0 top-0 h-full max-h-none w-full max-w-[520px] translate-x-0 translate-y-0 overflow-y-auto rounded-none">
        <DialogTitle>{lead.empresa}</DialogTitle>
        <DialogDescription>{NOME[lead.lista]} · Lista</DialogDescription>
        <div className="mt-3 flex flex-wrap gap-2">
          {lead.perfil_url && (
            <a href={lead.perfil_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[13px] hover:border-primary-bright">
              <ExternalLink className="h-3.5 w-3.5" /> Perfil {lead.perfil ?? ""}
            </a>
          )}
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[13px] hover:border-primary-bright">
              <ExternalLink className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
          {lead.post_url && (
            <a href={lead.post_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[13px] hover:border-primary-bright">
              <ExternalLink className="h-3.5 w-3.5" /> Post onde comentou
            </a>
          )}
        </div>
        <dl className="mt-4 space-y-2 text-[14px]">
          {linhas
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => (
              <div key={k} className="grid grid-cols-[150px_1fr] gap-3">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        <label className="mt-5 block text-[13px] text-muted">
          Observações
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={4} className="mt-1 w-full rounded-[8px] border border-border bg-surface p-2.5 text-[14px] text-ink" />
        </label>
        <label className="mt-3 block text-[13px] text-muted">
          Valor da venda (R$)
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="mt-1 w-40 rounded-[8px] border border-border bg-surface px-3 py-2 text-[14px] text-ink" />
        </label>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={atualizar.isPending}
            onClick={() => {
              const v = valor.trim() ? Number(valor.replace(/\./g, "").replace(",", ".")) : null;
              atualizar.mutate(
                { id: lead.id, patch: { observacoes: obs.trim() || null, valor: v != null && Number.isFinite(v) ? v : null } },
                { onSuccess: () => (showToast("Salvo"), onClose()), onError: (e) => showToast(`Erro: ${(e as Error).message}`) },
              );
            }}
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
