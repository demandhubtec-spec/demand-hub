import * as React from "react";
import { Check, Mail, MessageCircle, Pencil, RefreshCw, Send, SkipForward, Sparkles, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/toast";
import { type OutreachLead, type Toque, enviarEmailTeste, useGerarMensagens, useOutreachLeads, useUpdateLead } from "@/hooks/useProspeccao";
import { type FiltroPrioridade, canalLabel, pontuacao, quandoTexto } from "./cadencia";
import { ExtrasLead } from "./ExtrasLead";
import { cn } from "@/lib/utils";

type Filtro = "rascunho" | "aprovada" | "rejeitada";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "-" : n.toLocaleString("pt-BR"));

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

/** Balões de WhatsApp (linha em branco = novo balão). */
function Baloes({ texto }: { texto: string }) {
  return (
    <div className="space-y-1.5">
      {texto.split(/\n\s*\n/).filter((b) => b.trim()).map((b, i) => (
        <div key={i} className="w-fit max-w-[95%] whitespace-pre-wrap rounded-lg bg-[#DCF8C6] p-3 text-[13.5px] text-[#111]">
          {b.trim()}
        </div>
      ))}
    </div>
  );
}

function EmailPreview({ assunto, texto }: { assunto?: string; texto: string }) {
  return (
    <div className="max-w-[95%] rounded-lg border border-border bg-surface-2 p-3 text-[13px]">
      <div className="mb-1.5 text-[12px]"><span className="text-muted">Assunto:</span> <b>{assunto}</b></div>
      <div className="whitespace-pre-wrap">{texto}</div>
      <div className="mt-2 whitespace-pre-wrap text-muted">{"Ana\nDemandIA"}</div>
    </div>
  );
}

function sequenciaDo(lead: OutreachLead): Toque[] {
  if (lead.sequencia?.length) return lead.sequencia;
  if (lead.msg_rascunho) return [{ n: 0, dia: 0, periodo: "manha", canal: "whatsapp", texto: lead.msg_rascunho }];
  return [];
}

export function CardLead({ lead, abertoInicial = true }: { lead: OutreachLead; abertoInicial?: boolean }) {
  const update = useUpdateLead();
  const gerar = useGerarMensagens();
  const { showToast } = useToast();
  const [editando, setEditando] = React.useState(false);
  const [aberto, setAberto] = React.useState(abertoInicial);
  const seqOriginal = sequenciaDo(lead);
  const [seq, setSeq] = React.useState<Toque[]>(seqOriginal);
  React.useEffect(() => setSeq(sequenciaDo(lead)), [lead.sequencia, lead.msg_rascunho]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = lead.diagnostico;
  const pos = posicaoTexto(lead);
  const prio = pontuacao(lead);
  const visiveis = aberto || editando ? seq : seq.slice(0, 1);

  async function mudar(patch: Partial<OutreachLead>, msg: string) {
    try {
      await update.mutateAsync({ placeId: lead.place_id, patch, descricao: `${msg}: ${lead.empresa}` });
      showToast(msg);
      setEditando(false);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  function salvarPatch(): Partial<OutreachLead> {
    const limpo = seq.map((t) => ({ ...t, texto: t.texto.trim(), assunto: t.assunto?.trim() }));
    return { sequencia: limpo, msg_rascunho: limpo[0]?.texto ?? null };
  }

  async function refazer() {
    try {
      const r = await gerar.mutateAsync([lead.place_id]);
      showToast(r.erros.length ? `Falhou: ${r.erros[0]}` : "Nova sequência escrita");
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  const [testando, setTestando] = React.useState<number | null>(null);
  async function testarEmail(i: number) {
    setTestando(i);
    try {
      const t = seq[i];
      const r = await enviarEmailTeste(lead.place_id, i, editando ? { assunto: t.assunto, texto: t.texto } : undefined);
      showToast(`E-mail de teste enviado para ${r.para}. Confira a caixa de entrada.`);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    } finally {
      setTestando(null);
    }
  }

  const vazio = !seq.length || seq.some((t) => !t.texto.trim());
  const aprovar = { msg_status: "aprovada", msg_aprovada_em: new Date().toISOString() } as Partial<OutreachLead>;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{lead.empresa}</span>
            <span
              className={cn(
                "rounded-full px-2 py-[2px] text-[11px] font-semibold",
                prio.nivel === "Alta" ? "bg-positive-tint text-positive" : prio.nivel === "Média" ? "bg-primary-tint text-primary-bright" : "bg-surface-2 text-muted",
              )}
              title={prio.motivos.join(" · ")}
            >
              Prioridade {prio.nivel.toLowerCase()} · {prio.nota}
            </span>
          </div>
          {prio.motivos.length > 0 && <div className="text-[11.5px] text-muted">Por quê: {prio.motivos.join(", ")}</div>}
          <div className="text-[12px] text-muted">
            {[lead.nicho, lead.cidade, lead.decisor && `Decisor: ${lead.decisor}`, lead.email ? "tem e-mail" : "sem e-mail", (lead.tentativa ?? 1) > 1 && `${lead.tentativa}ª tentativa`]
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

      <div className="mt-3 space-y-3">
        {visiveis.map((t, i) => (
          <div key={i}>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.canal === "email" ? <Mail className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
              Toque {i + 1} · {canalLabel(t.canal)} · {quandoTexto(t)}
              {t.canal === "email" && !lead.email && <span className="normal-case text-attention">(sem e-mail, será pulado)</span>}
              {t.canal === "email" && (
                <button
                  className="ml-auto inline-flex items-center gap-1 normal-case text-primary-bright hover:underline disabled:opacity-50"
                  onClick={() => testarEmail(i)}
                  disabled={testando !== null || !t.texto.trim()}
                >
                  <Send className="h-3 w-3" /> {testando === i ? "Enviando..." : "Enviar teste para meu e-mail"}
                </button>
              )}
            </div>
            {editando ? (
              <div className="space-y-1.5">
                {t.canal === "email" && (
                  <Input
                    className="h-9 py-1.5"
                    value={t.assunto ?? ""}
                    placeholder="Assunto"
                    onChange={(e) => setSeq((s) => s.map((x, j) => (j === i ? { ...x, assunto: e.target.value } : x)))}
                  />
                )}
                <Textarea
                  rows={t.canal === "email" ? 7 : 5}
                  value={t.texto}
                  onChange={(e) => setSeq((s) => s.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))}
                />
                <div className="text-[11.5px] text-muted">
                  {t.canal === "whatsapp" ? "Linha em branco = novo balão. " : "A assinatura da Ana entra sozinha. "}
                  {t.texto.length} caracteres.
                  {/[—–]/.test(t.texto) && <span className="text-attention"> Tem travessão: troque por vírgula ou ponto.</span>}
                </div>
              </div>
            ) : t.canal === "email" ? (
              <EmailPreview assunto={t.assunto} texto={t.texto} />
            ) : (
              <Baloes texto={t.texto} />
            )}
          </div>
        ))}
        {!editando && seq.length > 1 && (
          <button className="text-[12.5px] font-semibold text-primary-bright" onClick={() => setAberto((a) => !a)}>
            {aberto ? "Mostrar só a primeira mensagem" : `Ver a sequência inteira (${seq.length} toques)`}
          </button>
        )}
        {seq.length === 1 && !editando && (
          <div className="text-[12px] text-attention">Esta mensagem é da versão antiga, sem os follow-ups. Clique em "Gerar de novo" para a Ana escrever a sequência inteira.</div>
        )}
      </div>

      {seq.length > 0 && <ExtrasLead lead={lead} />}

      <div className="mt-3 flex flex-wrap gap-2">
        {!seq.length ? (
          <>
            <div className="w-full text-[12.5px] text-muted">A Ana ainda não escreveu a sequência desta empresa.</div>
            <Button size="sm" onClick={refazer} disabled={gerar.isPending}>
              <Sparkles /> {gerar.isPending ? "Escrevendo..." : "Gerar sequência"}
            </Button>
          </>
        ) : editando ? (
          <>
            <Button size="sm" onClick={() => mudar({ ...salvarPatch(), ...aprovar }, "Sequência editada e aprovada")} disabled={vazio || update.isPending}>
              <Check /> Salvar e aprovar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => mudar(salvarPatch(), "Edição salva")} disabled={vazio}>
              Só salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setSeq(sequenciaDo(lead)); setEditando(false); }}>Cancelar</Button>
          </>
        ) : lead.msg_status === "rascunho" ? (
          <>
            <Button size="sm" onClick={() => mudar(aprovar, "Sequência aprovada")} disabled={update.isPending}>
              <Check /> Aprovar sequência
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(true)}><Pencil /> Editar</Button>
            <Button size="sm" variant="ghost" onClick={refazer} disabled={gerar.isPending}><RefreshCw /> {gerar.isPending ? "Gerando..." : "Gerar de novo"}</Button>
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
  const [prio, setPrio] = React.useState<FiltroPrioridade>("todas");
  const [ordem, setOrdem] = React.useState<"maior" | "menor">("maior");

  const naFila = leads.filter((l) => l.wa_status === "pendente");
  const semMsg = naFila.filter((l) => l.msg_status === "sem" || l.msg_status === "gerando").length;
  const cont = (s: Filtro) => naFila.filter((l) => l.msg_status === s).length;
  // As empresas com mais oportunidade aparecem primeiro
  const doFiltro = naFila.filter((l) => l.msg_status === filtro);
  const contPrio = (n: FiltroPrioridade) => (n === "todas" ? doFiltro.length : doFiltro.filter((l) => pontuacao(l).nivel === n).length);
  const lista = doFiltro
    .filter((l) => prio === "todas" || pontuacao(l).nivel === prio)
    .sort((a, b) => (ordem === "maior" ? 1 : -1) * (pontuacao(b).nota - pontuacao(a).nota));

  const emCadencia = leads.filter((l) => l.cadencia === "ativa" && l.wa_status === "enviado").length;
  const [reescrevendo, setReescrevendo] = React.useState<string | null>(null);
  async function reescreverFollowups() {
    const desde = new Date().toISOString();
    let total = 0;
    try {
      for (let rodada = 0; rodada < 15; rodada++) {
        setReescrevendo(`Reescrevendo... ${total} prontas`);
        const r = await gerar.mutateAsync({ modo: "followups", desde });
        total += r.gerados;
        if (r.erros.length) showToast(`Alguns falharam: ${r.erros[0]}`);
        if (r.restantes === 0 || r.gerados === 0) break;
      }
      showToast(`Follow-ups reescritos em ${total} empresas (o que já foi enviado não mudou)`);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    } finally {
      setReescrevendo(null);
    }
  }

  async function gerarTodas() {
    let total = 0;
    try {
      for (let rodada = 0; rodada < 15; rodada++) {
        setProgresso(`Gerando... ${total} prontas`);
        const r = await gerar.mutateAsync(undefined);
        total += r.gerados;
        if (r.erros.length) showToast(`Alguns falharam: ${r.erros[0]}`);
        if (r.restantes === 0 || r.gerados === 0) break;
      }
      showToast(`${total} sequências escritas para revisão`);
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
          <div className="font-semibold">A Ana escreve a sequência de cada empresa (6 toques em 10 dias, WhatsApp e e-mail), a partir do perfil dela no Google.</div>
          <div className="mt-0.5 text-muted">
            Você aprova a sequência uma vez e o robô segue sozinho. Se a pessoa responder, a cadência para e a Ana assume.{" "}
            {semMsg > 0 ? <b className="text-ink">{semMsg} leads da fila ainda sem sequência.</b> : "Todos os leads da fila já têm sequência."}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {emCadencia > 0 && (
            <Button
              variant="outline"
              onClick={reescreverFollowups}
              disabled={gerar.isPending}
              title="Reescreve no formato atual só as mensagens que ainda não saíram, de quem já está em cadência"
            >
              <RefreshCw /> {reescrevendo ?? `Reescrever follow-ups (${emCadencia})`}
            </Button>
          )}
          <Button onClick={gerarTodas} disabled={gerar.isPending || semMsg === 0}>
            <Sparkles /> {progresso ?? `Gerar sequências (${semMsg})`}
          </Button>
        </div>
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

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold text-muted">Prioridade:</span>
        {(["todas", "Alta", "Média", "Baixa"] as FiltroPrioridade[]).map((n) => (
          <button
            key={n}
            onClick={() => setPrio(n)}
            className={cn(
              "rounded-full border px-3 py-1 font-semibold",
              prio === n
                ? n === "Alta"
                  ? "border-positive bg-positive-tint text-positive"
                  : n === "Baixa"
                    ? "border-border bg-surface-2 text-ink"
                    : "border-primary bg-primary-tint text-primary-bright"
                : "border-border text-muted",
            )}
          >
            {n === "todas" ? "Todas" : n} ({contPrio(n)})
          </button>
        ))}
        <select
          className="ml-auto rounded-full border border-border bg-transparent px-3 py-1 font-semibold text-muted"
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as "maior" | "menor")}
        >
          <option value="maior">Maior prioridade primeiro</option>
          <option value="menor">Menor prioridade primeiro</option>
        </select>
      </div>

      {isLoading ? (
        <EmptyState>Carregando...</EmptyState>
      ) : lista.length === 0 ? (
        <EmptyState>
          {prio !== "todas" && doFiltro.length > 0
            ? `Nenhuma empresa de prioridade ${prio.toLowerCase()} aqui.`
            : filtro === "rascunho"
              ? "Nada para revisar. Clique em Gerar sequências."
              : "Nada aqui ainda."}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {lista.map((l) => <CardLead key={l.place_id} lead={l} />)}
        </div>
      )}
    </div>
  );
}
