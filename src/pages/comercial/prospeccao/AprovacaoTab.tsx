import * as React from "react";
import { Check, Pencil, RefreshCw, SkipForward, Sparkles, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/toast";
import { type OutreachLead, useGerarMensagens, useOutreachLeads, useUpdateLead } from "@/hooks/useProspeccao";
import { cn } from "@/lib/utils";

type Filtro = "rascunho" | "aprovada" | "rejeitada";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("pt-BR"));

function Chip({ ok, children }: { ok?: boolean | null; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-[2px] text-[11px] font-semibold",
        ok === true && "border-positive/40 bg-positive-tint text-positive",
        ok === false && "border-attention/40 bg-attention-tint text-attention",
        (ok === null || ok === undefined) && "border-border text-muted",
      )}
    >
      {children}
    </span>
  );
}

function posicaoTexto(l: OutreachLead) {
  const p = l.diagnostico?.posicao;
  if (!p) return null;
  if (p.tipo === "busca") return `${p.posicao}º no Maps para "${p.termo}"`;
  return `${p.posicao}º de ${p.total} em avaliações (${l.cidade})`;
}

function CardLead({ lead }: { lead: OutreachLead }) {
  const update = useUpdateLead();
  const gerar = useGerarMensagens();
  const { showToast } = useToast();
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState(lead.msg_rascunho ?? "");
  React.useEffect(() => setTexto(lead.msg_rascunho ?? ""), [lead.msg_rascunho]);

  const d = lead.diagnostico;
  const pos = posicaoTexto(lead);

  async function mudar(patch: Partial<OutreachLead>, msg: string) {
    try {
      await update.mutateAsync({ placeId: lead.place_id, patch, descricao: `${msg}: ${lead.empresa}` });
      showToast(msg);
      setEditando(false);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  async function refazer() {
    try {
      const r = await gerar.mutateAsync([lead.place_id]);
      showToast(r.erros.length ? `Falhou: ${r.erros[0]}` : "Nova mensagem gerada");
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">{lead.empresa}</div>
          <div className="text-[12px] text-muted">
            {[lead.nicho, lead.cidade, lead.decisor && `Decisor: ${lead.decisor}`, lead.prioridade && `Prioridade ${lead.prioridade}`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pos && <Chip ok={(lead.diagnostico?.posicao?.posicao ?? 99) <= 3}>{pos}</Chip>}
          <Chip>{fmt(lead.avaliacoes)} avaliações</Chip>
          {lead.nota !== null && <Chip ok={lead.nota >= 4.7}>nota {String(lead.nota).replace(".", ",")}</Chip>}
          <Chip ok={!!lead.site}>{lead.site ? "tem site" : "sem site"}</Chip>
          <Chip ok={!!lead.instagram}>{lead.instagram ? "tem Instagram" : "sem Instagram"}</Chip>
          {lead.fotos !== null && <Chip ok={lead.fotos >= 20}>{lead.fotos} fotos</Chip>}
        </div>
      </div>

      {d && (d.pontos_fortes.length > 0 || d.oportunidades.length > 0) && (
        <div className="mt-3 grid gap-2 text-[12.5px] sm:grid-cols-2">
          {d.pontos_fortes.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-positive">Pontos fortes</div>
              <ul className="list-disc space-y-0.5 pl-4">{d.pontos_fortes.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {d.oportunidades.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-attention">Oportunidades</div>
              <ul className="list-disc space-y-0.5 pl-4">{d.oportunidades.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Mensagem da Ana</div>
        {editando ? (
          <>
            <Textarea rows={7} value={texto} onChange={(e) => setTexto(e.target.value)} />
            <div className="mt-1 text-[11.5px] text-muted">Linha em branco = novo balão. {texto.length} caracteres.</div>
          </>
        ) : (
          <div className="space-y-1.5">
            {(lead.msg_rascunho ?? "").split(/\n\s*\n/).filter((b) => b.trim()).map((b, i) => (
              <div key={i} className="w-fit max-w-[95%] whitespace-pre-wrap rounded-lg bg-[#DCF8C6] p-3 text-[13.5px] text-[#111]">
                {b.trim()}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {editando ? (
          <>
            <Button size="sm" onClick={() => mudar({ msg_rascunho: texto.trim(), msg_status: "aprovada", msg_aprovada_em: new Date().toISOString() }, "Mensagem editada e aprovada")} disabled={!texto.trim() || update.isPending}>
              <Check /> Salvar e aprovar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => mudar({ msg_rascunho: texto.trim() }, "Edição salva")} disabled={!texto.trim()}>
              Só salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setTexto(lead.msg_rascunho ?? ""); setEditando(false); }}>Cancelar</Button>
          </>
        ) : lead.msg_status === "rascunho" ? (
          <>
            <Button size="sm" onClick={() => mudar({ msg_status: "aprovada", msg_aprovada_em: new Date().toISOString() }, "Mensagem aprovada")} disabled={update.isPending}>
              <Check /> Aprovar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(true)}><Pencil /> Editar</Button>
            <Button size="sm" variant="ghost" onClick={refazer} disabled={gerar.isPending}><RefreshCw /> {gerar.isPending ? "Gerando…" : "Gerar de novo"}</Button>
            <Button size="sm" variant="ghost" onClick={() => mudar({ msg_status: "rejeitada" }, "Lead pulado")}><SkipForward /> Pular</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => mudar({ msg_status: "rascunho", msg_aprovada_em: null }, "Voltou para revisão")}>
              <Undo2 /> Voltar para revisão
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(true)}><Pencil /> Editar</Button>
          </>
        )}
      </div>
    </Card>
  );
}

export function AprovacaoTab() {
  const { data: leads = [], isLoading } = useOutreachLeads();
  const gerar = useGerarMensagens();
  const { showToast } = useToast();
  const [filtro, setFiltro] = React.useState<Filtro>("rascunho");
  const [progresso, setProgresso] = React.useState<string | null>(null);

  const naFila = leads.filter((l) => l.wa_status === "pendente");
  const semMsg = naFila.filter((l) => l.msg_status === "sem" || l.msg_status === "gerando").length;
  const cont = (s: Filtro) => naFila.filter((l) => l.msg_status === s).length;
  const lista = naFila.filter((l) => l.msg_status === filtro);

  async function gerarTodas() {
    let total = 0;
    try {
      for (let rodada = 0; rodada < 15; rodada++) {
        setProgresso(`Gerando… ${total} prontas`);
        const r = await gerar.mutateAsync(undefined);
        total += r.gerados;
        if (r.erros.length) showToast(`Alguns falharam: ${r.erros[0]}`);
        if (r.restantes === 0 || r.gerados === 0) break;
      }
      showToast(`${total} mensagens geradas para revisão`);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    } finally {
      setProgresso(null);
    }
  }

  return (
    <div>
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-[13px]">
          <div className="font-semibold">A Ana escreve uma mensagem para cada empresa, a partir do perfil dela no Google.</div>
          <div className="mt-0.5 text-muted">
            Você revisa e aprova aqui. O robô só envia as aprovadas.{" "}
            {semMsg > 0 ? <b className="text-ink">{semMsg} leads da fila ainda sem mensagem.</b> : "Todos os leads da fila já têm mensagem."}
          </div>
        </div>
        <Button onClick={gerarTodas} disabled={gerar.isPending || semMsg === 0}>
          <Sparkles /> {progresso ?? `Gerar mensagens (${semMsg})`}
        </Button>
      </Card>

      <div className="mb-3 flex gap-2">
        {(
          [
            ["rascunho", "Para revisar"],
            ["aprovada", "Aprovadas"],
            ["rejeitada", "Puladas"],
          ] as [Filtro, string][]
        ).map(([k, lb]) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12.5px] font-semibold",
              filtro === k ? "border-primary bg-primary-tint text-primary-bright" : "border-border text-muted",
            )}
          >
            {lb} ({cont(k)})
          </button>
        ))}
      </div>

      {isLoading ? (
        <EmptyState>Carregando…</EmptyState>
      ) : lista.length === 0 ? (
        <EmptyState>
          {filtro === "rascunho" ? "Nenhuma mensagem para revisar. Clique em “Gerar mensagens”." : "Nada aqui ainda."}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {lista.map((l) => <CardLead key={l.place_id} lead={l} />)}
        </div>
      )}
    </div>
  );
}
