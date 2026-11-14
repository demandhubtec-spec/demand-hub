import * as React from "react";
import { ArrowDown, ArrowUp, Eye, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { type SecaoPlaybook, usePromptGabi, useSalvarPromptGabi } from "@/hooks/usePlaybook";
import { chamarSdr } from "@/hooks/useProspeccao";
import { fmtData } from "../prospeccao/shared";

interface Padrao {
  secoes: SecaoPlaybook[];
  variaveis: Record<string, string>;
}

const iguais = (a: SecaoPlaybook[], b: SecaoPlaybook[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Prompt System da Gabi: o texto que guia tudo o que ela faz no WhatsApp (abordagem, conversa,
 * objeções, agendamento e follow-ups). Editou e salvou, ela segue a nova versão em até 1 minuto.
 */
export function PromptGabiTab() {
  const { showToast } = useToast();
  const { data, isLoading, isError } = usePromptGabi();
  const salvar = useSalvarPromptGabi();
  const [padrao, setPadrao] = React.useState<Padrao | null>(null);
  const [erroPadrao, setErroPadrao] = React.useState<string | null>(null);
  const [rascunho, setRascunho] = React.useState<SecaoPlaybook[] | null>(null);
  const [previa, setPrevia] = React.useState<{ prompt: string; empresa: string | null } | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = React.useState(false);

  React.useEffect(() => {
    chamarSdr<Padrao>("/api/prospeccao/prompt-gabi", { acao: "padrao" })
      .then(setPadrao)
      .catch((e: Error) => setErroPadrao(e.message));
  }, []);

  const salvas = data?.secoes ?? [];
  const usandoPadrao = !salvas.length;
  const base = usandoPadrao ? (padrao?.secoes ?? []) : salvas;
  const secoes = rascunho ?? base;
  const mudou = rascunho !== null && !iguais(rascunho, base);

  const variaveis = React.useMemo(() => padrao?.variaveis ?? {}, [padrao]);
  const desconhecidas = React.useMemo(() => {
    const achadas = new Set<string>();
    for (const s of secoes) for (const m of s.texto.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) if (!(m[1] in variaveis)) achadas.add(m[1]);
    return [...achadas];
  }, [secoes, variaveis]);

  const editar = (fn: (s: SecaoPlaybook[]) => SecaoPlaybook[]) => setRascunho(fn([...(rascunho ?? base)]));
  const mudar = (i: number, campo: keyof SecaoPlaybook, v: string) => editar((r) => r.map((s, j) => (j === i ? { ...s, [campo]: v } : s)));
  const mover = (i: number, d: -1 | 1) =>
    editar((r) => {
      const j = i + d;
      if (j < 0 || j >= r.length) return r;
      [r[i], r[j]] = [r[j], r[i]];
      return r;
    });

  async function gravar() {
    if (!secoes.some((s) => s.texto.trim())) return showToast("O prompt não pode ficar vazio.");
    if (desconhecidas.length) return showToast(`Variável desconhecida: {{${desconhecidas[0]}}}. Confira a lista ao lado.`);
    try {
      await salvar.mutateAsync(secoes);
      setRascunho(null);
      showToast("Salvo. A Gabi já segue esta versão em até 1 minuto.");
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  function restaurar() {
    if (!padrao) return;
    if (!window.confirm("Trocar o texto atual pelo padrão do sistema? Você ainda precisa clicar em Salvar para valer.")) return;
    setRascunho(padrao.secoes.map((s) => ({ ...s })));
  }

  async function verPrevia() {
    setCarregandoPrevia(true);
    try {
      setPrevia(await chamarSdr<{ prompt: string; empresa: string | null }>("/api/prospeccao/prompt-gabi", { acao: "previa", secoes }));
    } catch (e) {
      showToast(`Erro na prévia: ${(e as Error).message}`);
    } finally {
      setCarregandoPrevia(false);
    }
  }

  if (isLoading || (!padrao && !erroPadrao && usandoPadrao)) return <div className="text-[13px] text-muted">Carregando o Prompt System da Gabi…</div>;
  if (isError) return <EmptyState>Não consegui abrir o Prompt System. Tente recarregar a página.</EmptyState>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold">Prompt System da Gabi</div>
          <div className="mt-0.5 max-w-[760px] text-[13px] text-muted">
            Tudo o que a Gabi faz no WhatsApp da prospecção: objetivo, jeito de falar, apresentação, diagnóstico, agendamento, objeções,
            follow-ups e o que ela nunca pode fazer. Ajustou e salvou, ela segue a nova versão em até 1 minuto.
          </div>
          <div className="mt-1.5 text-[12px] text-muted">
            {usandoPadrao ? "Hoje ela segue o texto padrão do sistema." : `Versão personalizada · última edição ${data?.atualizado_em ? fmtData(data.atualizado_em) : ""}.`}
            {mudou && <span className="ml-1.5 font-semibold text-attention">Alterações não salvas.</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={verPrevia} disabled={carregandoPrevia}>
            <Eye /> {carregandoPrevia ? "Montando…" : "Pré-visualizar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={restaurar} disabled={!padrao}>
            <RotateCcw /> Restaurar padrão
          </Button>
          {mudou && (
            <Button variant="ghost" size="sm" onClick={() => setRascunho(null)} disabled={salvar.isPending}>
              Descartar
            </Button>
          )}
          <Button size="sm" onClick={gravar} disabled={salvar.isPending || (!mudou && !usandoPadrao)}>
            <Save /> {salvar.isPending ? "Salvando…" : usandoPadrao && !mudou ? "Salvar como meu" : "Salvar"}
          </Button>
        </div>
      </div>

      {erroPadrao && usandoPadrao && <EmptyState>Não consegui buscar o texto padrão ({erroPadrao}). Tente recarregar a página.</EmptyState>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3.5">
          {secoes.map((s, i) => (
            <Card key={i} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-[12px] font-semibold text-muted">{i + 1}</span>
                <Input value={s.titulo} onChange={(e) => mudar(i, "titulo", e.target.value)} placeholder="Título da seção" className="font-semibold" />
                <Button variant="icon" size="icon" title="Subir" onClick={() => mover(i, -1)} disabled={i === 0}>
                  <ArrowUp />
                </Button>
                <Button variant="icon" size="icon" title="Descer" onClick={() => mover(i, 1)} disabled={i === secoes.length - 1}>
                  <ArrowDown />
                </Button>
                <Button
                  variant="icon"
                  size="icon"
                  title="Apagar seção"
                  onClick={() => window.confirm(`Apagar a seção "${s.titulo || "sem título"}"?`) && editar((r) => r.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
              <Textarea
                value={s.texto}
                onChange={(e) => mudar(i, "texto", e.target.value)}
                rows={Math.min(22, Math.max(5, s.texto.split("\n").length + 1))}
                className="font-mono text-[13px] leading-relaxed"
                placeholder="Escreva as regras desta parte, uma por linha."
              />
            </Card>
          ))}
          <Button variant="ghost" size="sm" onClick={() => editar((r) => [...r, { titulo: "", texto: "" }])}>
            <Plus /> Nova seção
          </Button>
        </div>

        <div className="space-y-3.5 lg:sticky lg:top-4">
          <Card className="p-4">
            <div className="eyebrow mb-2 text-[12px] text-primary-bright">Variáveis</div>
            <div className="mb-2 text-[12px] text-muted">Use no texto e o sistema troca pelos dados de cada empresa.</div>
            <ul className="space-y-1.5">
              {Object.entries(variaveis).map(([k, d]) => (
                <li key={k} className="text-[12px] leading-snug">
                  <button
                    type="button"
                    className="font-mono font-semibold text-primary-bright hover:underline"
                    title="Copiar"
                    onClick={() => {
                      void navigator.clipboard?.writeText(`{{${k}}}`);
                      showToast(`{{${k}}} copiada.`);
                    }}
                  >{`{{${k}}}`}</button>
                  <span className="text-muted"> · {d}</span>
                </li>
              ))}
            </ul>
            {desconhecidas.length > 0 && (
              <div className="mt-3 rounded-[8px] border border-attention/40 bg-attention-tint p-2 text-[12px]">
                Variável que o sistema não conhece: {desconhecidas.map((d) => `{{${d}}}`).join(", ")}. Corrija antes de salvar.
              </div>
            )}
          </Card>
          <Card className="p-4 text-[12px] leading-relaxed text-muted">
            <div className="eyebrow mb-2 text-[12px] text-primary-bright">Como funciona</div>
            <p>A Gabi lê as seções nesta ordem, com o título de cada uma. Os dados da empresa, o diagnóstico e o histórico da conversa entram automaticamente depois do texto.</p>
            <p className="mt-2">A seção cujo título fala de follow-up guia as 7 mensagens de retomada. Mantenha a lista numerada de 1 a 7.</p>
            <p className="mt-2">A abertura ("Oi, bom dia! 😊 / Tudo bem?") e a cutucada de 1 hora são fixas no disparo.</p>
          </Card>
        </div>
      </div>

      {previa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPrevia(null)}>
          <Card className="flex max-h-[85vh] w-full max-w-[860px] flex-col p-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">Como a Gabi vai ler</div>
                <div className="text-[12px] text-muted">{previa.empresa ? `Exemplo com os dados de ${previa.empresa}.` : "Exemplo sem lead."} Inclui as alterações ainda não salvas.</div>
              </div>
              <Button variant="icon" size="icon" title="Fechar" onClick={() => setPrevia(null)}>
                <X />
              </Button>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed">{previa.prompt}</pre>
          </Card>
        </div>
      )}
    </div>
  );
}
