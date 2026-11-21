/**
 * Próxima ação de cada card do funil (21/11/2026, Kelvin): ligação, WhatsApp, reunião, visita, proposta...
 * Cada ação tem data e descrição e vira também uma tarefa do comercial (Tarefas), para não esquecer.
 */
import * as React from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { type AcaoCard, NOME_ACAO, TIPOS_ACAO, type TipoAcao, useConcluirAcao, useCriarAcao } from "@/hooks/useComercial";
import { cn } from "@/lib/utils";

const ICONE: Record<TipoAcao, string> = { ligacao: "📞", whatsapp: "💬", reuniao: "📅", visita: "📍", proposta: "📄", email: "✉️", outro: "📌" };

export function quandoAcao(q: string | null): string {
  if (!q) return "sem data";
  const d = new Date(q);
  const dia = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return hora === "00:00" ? dia : `${dia} ${hora}`;
}

export const atrasada = (a: AcaoCard) => !a.feita_em && !!a.quando && Date.parse(a.quando) < Date.now();

/** Texto curto para o card: "📞 Ligação · ter 24/11 09:00". */
export const rotuloAcao = (a: AcaoCard) => `${ICONE[a.tipo]} ${NOME_ACAO[a.tipo]} · ${quandoAcao(a.quando)}`;

/** A próxima ação pendente de cada card (a de data mais cedo). */
export function proximaPorCard(acoes: AcaoCard[]): Map<string, AcaoCard> {
  const m = new Map<string, AcaoCard>();
  for (const a of acoes) {
    if (a.feita_em) continue;
    const atual = m.get(a.card);
    if (!atual || (a.quando ?? "9") < (atual.quando ?? "9")) m.set(a.card, a);
  }
  return m;
}

/** Seção do prontuário: a próxima ação, marcar como feita e criar a seguinte. */
export function ProximaAcaoSecao({ card, empresa, acoes }: { card: string; empresa: string; acoes: AcaoCard[] }) {
  const { showToast } = useToast();
  const criar = useCriarAcao();
  const concluir = useConcluirAcao();
  const doCard = acoes.filter((a) => a.card === card);
  const pendentes = doCard.filter((a) => !a.feita_em).sort((a, b) => (a.quando ?? "9").localeCompare(b.quando ?? "9"));
  const feitas = doCard.filter((a) => a.feita_em).sort((a, b) => (b.feita_em ?? "").localeCompare(a.feita_em ?? ""));
  const [aberto, setAberto] = React.useState(pendentes.length === 0);
  const [tipo, setTipo] = React.useState<TipoAcao>("ligacao");
  const [quando, setQuando] = React.useState("");
  const [descricao, setDescricao] = React.useState("");

  function salvar() {
    criar.mutate(
      { card, empresa, tipo, quando: quando ? new Date(quando).toISOString() : null, descricao: descricao.trim() },
      {
        onSuccess: () => {
          setDescricao("");
          setQuando("");
          setAberto(false);
          showToast("Próxima ação criada (e a tarefa também).");
        },
        onError: (e) => showToast(`Não salvou a ação: ${(e as Error).message}`),
      },
    );
  }

  return (
    <section className="rounded-[10px] border border-primary/30 bg-primary-tint/30 p-3.5">
      <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-muted">
        Próxima ação
        {!aberto && (
          <button className="ml-auto inline-flex items-center gap-1 text-primary hover:underline" onClick={() => setAberto(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova ação
          </button>
        )}
      </div>
      {pendentes.length === 0 && !aberto && <div className="text-[13px] text-muted">Nenhuma ação marcada. Todo lead precisa de um próximo passo.</div>}
      <ul className="space-y-2">
        {pendentes.map((a) => (
          <li key={a.id} className="flex items-start gap-2 rounded-[8px] bg-white px-3 py-2 text-[14px]">
            <div className="flex-1">
              <div className={cn("font-medium", atrasada(a) && "text-negative")}>
                {rotuloAcao(a)}
                {atrasada(a) && " · atrasada"}
              </div>
              {a.descricao && <div className="mt-0.5 text-[13px] leading-snug text-muted">{a.descricao}</div>}
            </div>
            <button
              title="Marcar como feita"
              disabled={concluir.isPending}
              onClick={() =>
                concluir.mutate(a, {
                  onSuccess: () => {
                    setAberto(true);
                    showToast("Feita! Qual é o próximo passo com esse lead?");
                  },
                })
              }
              className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-border px-2 text-[12px] hover:border-positive hover:text-positive"
            >
              <Check className="h-3.5 w-3.5" /> Feita
            </button>
          </li>
        ))}
      </ul>
      {aberto && (
        <div className="mt-2 space-y-2 rounded-[8px] bg-white p-2.5">
          <div className="flex flex-wrap gap-2">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAcao)} className="h-8 rounded-[6px] border border-border bg-white px-2 text-[13px]">
              {TIPOS_ACAO.map((t) => (
                <option key={t.k} value={t.k}>
                  {ICONE[t.k]} {t.nome}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
              className="h-8 rounded-[6px] border border-border bg-white px-2 text-[13px]"
            />
          </div>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={2}
            placeholder="O que fazer (ex.: ligar para a Dra. Juliana e fechar a reunião de terça)"
            className="w-full resize-y rounded-[6px] border border-border p-2 text-[13px] outline-none focus:border-primary"
          />
          <div className="flex justify-end gap-2">
            {pendentes.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
            )}
            <Button size="sm" onClick={salvar} disabled={criar.isPending}>
              {criar.isPending ? "Salvando…" : "Salvar ação"}
            </Button>
          </div>
        </div>
      )}
      {feitas.length > 0 && (
        <details className="mt-2 text-[12px] text-muted">
          <summary className="cursor-pointer">Ações feitas ({feitas.length})</summary>
          <ul className="mt-1 space-y-1">
            {feitas.map((a) => (
              <li key={a.id}>
                ✓ {rotuloAcao(a)}
                {a.descricao ? `: ${a.descricao}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Painel do topo do funil: todas as próximas ações pendentes, por data (atrasadas em vermelho). */
export function PainelAcoes({ acoes, abrir }: { acoes: AcaoCard[]; abrir: (card: string) => void }) {
  const pendentes = acoes.filter((a) => !a.feita_em).sort((a, b) => (a.quando ?? "9").localeCompare(b.quando ?? "9"));
  if (!pendentes.length) return <div className="text-[13px] text-muted">Nenhuma ação pendente. Abra um card e crie a próxima ação.</div>;
  return (
    <ul className="divide-y divide-border">
      {pendentes.map((a) => (
        <li key={a.id}>
          <button onClick={() => abrir(a.card)} className="flex w-full items-start gap-3 px-1 py-2 text-left hover:bg-surface-2/60">
            <span className={cn("w-[150px] shrink-0 text-[13px] font-medium", atrasada(a) ? "text-negative" : "text-ink")}>
              {ICONE[a.tipo]} {quandoAcao(a.quando)}
            </span>
            <span className="flex-1 text-[13px]">
              <b>{a.empresa ?? "Lead"}</b> · {NOME_ACAO[a.tipo]}
              {a.descricao && <span className="text-muted"> · {a.descricao}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
