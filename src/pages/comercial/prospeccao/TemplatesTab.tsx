import * as React from "react";
import { Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  type OutreachTemplate,
  useDeleteTemplate,
  useOutreachConfig,
  useOutreachLeads,
  useOutreachTemplates,
  useSaveTemplate,
  useSendTest,
} from "@/hooks/useProspeccao";
import { render, VARIAVEIS } from "@/lib/outreach-render";
import { cn } from "@/lib/utils";

const RODAPE_EMAIL = "Se não quiser mais receber, é só responder 'sair'.";

type Draft = { id?: OutreachTemplate["id"]; channel: "whatsapp" | "email"; name: string; subject: string; body: string; active: boolean };

export function TemplatesTab() {
  const { data: templates = [], isLoading } = useOutreachTemplates();
  const { data: leads = [] } = useOutreachLeads();
  const { data: cfg } = useOutreachConfig();
  const salvar = useSaveTemplate();
  const excluir = useDeleteTemplate();
  const enviarTeste = useSendTest();
  const { showToast } = useToast();

  const [canal, setCanal] = React.useState<"whatsapp" | "email">("whatsapp");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [leadId, setLeadId] = React.useState<string>("");
  const [seed, setSeed] = React.useState(1);
  const [numeroTeste, setNumeroTeste] = React.useState("");

  React.useEffect(() => {
    if (cfg?.test_number && !numeroTeste) setNumeroTeste(cfg.test_number);
  }, [cfg?.test_number, numeroTeste]);

  const lista = templates.filter((t) => t.channel === canal);
  const lead = leads.find((l) => l.place_id === leadId) ?? leads.find((l) => l.decisor) ?? leads[0];

  // Sorteio reproduzível: o mesmo "seed" gera a mesma variação até clicar em "Gerar outra variação".
  const rnd = React.useMemo(() => {
    let s = seed * 9301 + 49297;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  }, [seed]);

  const previewBody = draft && lead ? render(draft.body, lead, rnd) : "";
  const previewSubject = draft && lead && draft.channel === "email" ? render(draft.subject, lead, rnd) : "";

  function novo() {
    setDraft({ channel: canal, name: "", subject: "", body: "", active: true });
  }

  async function onSalvar() {
    if (!draft || !draft.body.trim()) return;
    try {
      await salvar.mutateAsync({
        ...(draft.id !== undefined ? { id: draft.id } : {}),
        channel: draft.channel,
        name: draft.name || null,
        subject: draft.channel === "email" ? draft.subject : null,
        body: draft.body,
        active: draft.active,
      });
      showToast("Mensagem salva");
      setDraft(null);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  async function toggle(t: OutreachTemplate, active: boolean) {
    try {
      await salvar.mutateAsync({ id: t.id, channel: t.channel, body: t.body, active });
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  async function onExcluir(t: OutreachTemplate) {
    try {
      await excluir.mutateAsync(t.id);
      if (draft?.id === t.id) setDraft(null);
      showToast("Mensagem excluída");
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  async function onTeste() {
    const n = numeroTeste.replace(/\D/g, "");
    if (!n) return showToast("Digite o seu número para o teste");
    try {
      const r = await enviarTeste.mutateAsync({ number: n.length <= 11 ? `55${n}` : n, text: previewBody });
      showToast(r.ok ? "Teste enviado para o seu WhatsApp" : `Falhou: ${r.error ?? "erro desconhecido"}`);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div>
        <div className="mb-3 flex items-center gap-2">
          {(["whatsapp", "email"] as const).map((c) => (
            <button
              key={c}
              onClick={() => { setCanal(c); setDraft(null); }}
              className={cn(
                "rounded-full border px-3 py-1 text-[12.5px] font-semibold",
                canal === c ? "border-primary bg-primary-tint text-primary-bright" : "border-border text-muted",
              )}
            >
              {c === "whatsapp" ? "WhatsApp" : "E-mail"}
            </button>
          ))}
          <Button size="sm" className="ml-auto" onClick={novo}><Plus /> Nova mensagem</Button>
        </div>
        <div className="mb-2 text-[11.5px] text-muted">O motor sorteia uma das mensagens ligadas a cada envio.</div>
        {isLoading ? <EmptyState>Carregando…</EmptyState> : lista.length === 0 ? (
          <EmptyState>Nenhuma mensagem de {canal === "whatsapp" ? "WhatsApp" : "e-mail"} ainda.</EmptyState>
        ) : (
          <div className="space-y-2">
            {lista.map((t) => (
              <Card
                key={t.id}
                className={cn("cursor-pointer p-3.5", draft?.id === t.id && "border-primary")}
                onClick={() => setDraft({ id: t.id, channel: t.channel, name: t.name ?? "", subject: t.subject ?? "", body: t.body, active: t.active })}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">{t.name || `Mensagem #${t.id}`}</div>
                    <div className="mt-0.5 line-clamp-2 text-[12px] text-muted">{t.channel === "email" && t.subject ? `${t.subject} · ` : ""}{t.body}</div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Switch checked={t.active} onCheckedChange={(v) => toggle(t, v)} />
                    <Button variant="icon" size="icon" title="Excluir" onClick={() => onExcluir(t)}><Trash2 /></Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        {!draft ? (
          <EmptyState>Escolha uma mensagem à esquerda ou crie uma nova.</EmptyState>
        ) : (
          <Card className="p-5">
            <div className="grid gap-3">
              <div>
                <Label>Nome interno</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex: Abordagem curta" />
              </div>
              {draft.channel === "email" && (
                <div>
                  <Label>Assunto</Label>
                  <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                </div>
              )}
              <div>
                <Label>Texto</Label>
                <Textarea rows={8} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <div className="mt-1.5 text-[11.5px] text-muted">
                  Variações: escreva <code className="font-mono">{"{oi|olá|e aí}"}</code> e o motor sorteia uma. Clique numa variável para inserir:
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {VARIAVEIS.map((v) => (
                    <button
                      key={v.tag}
                      type="button"
                      title={v.desc}
                      onClick={() => setDraft({ ...draft, body: `${draft.body}${v.tag}` })}
                      className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] hover:border-primary-bright"
                    >
                      {v.tag}
                    </button>
                  ))}
                </div>
                {draft.channel === "email" && (
                  <div className="mt-2 text-[11.5px] text-muted">O rodapé de opt-out é colocado automaticamente: “{RODAPE_EMAIL}”</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
                <span className="text-[12.5px]">Ligada (entra no sorteio)</span>
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setDraft(null)}>Cancelar</Button>
                <Button size="sm" onClick={onSalvar} disabled={salvar.isPending}>Salvar</Button>
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold">Prévia</div>
                <Select value={lead?.place_id ?? ""} onValueChange={setLeadId}>
                  <SelectTrigger className="h-8 w-[220px] py-1 text-[12px]"><SelectValue placeholder="Escolha um lead" /></SelectTrigger>
                  <SelectContent>
                    {leads.slice(0, 200).map((l) => <SelectItem key={l.place_id} value={l.place_id}>{l.empresa}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => setSeed((s) => s + 1)}><RefreshCw /> Gerar outra variação</Button>
              </div>
              {!lead ? <div className="text-[12.5px] text-muted">Importe um lead para ver a prévia.</div> : (
                <div className={cn("whitespace-pre-wrap rounded-lg p-3.5 text-[13.5px]", draft.channel === "whatsapp" ? "bg-[#DCF8C6] text-[#111]" : "bg-surface-2")}>
                  {draft.channel === "email" && <div className="mb-2 font-semibold">{previewSubject}</div>}
                  {previewBody || <span className="opacity-60">Escreva o texto para ver a prévia.</span>}
                  {draft.channel === "email" && previewBody && <div className="mt-3 text-[12px] opacity-70">{RODAPE_EMAIL}</div>}
                </div>
              )}
              {draft.channel === "whatsapp" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input className="h-9 max-w-[200px] py-1.5" placeholder="Seu WhatsApp com DDD" value={numeroTeste} onChange={(e) => setNumeroTeste(e.target.value)} />
                  <Button variant="ghost" size="sm" onClick={onTeste} disabled={!previewBody || enviarTeste.isPending}>
                    <Send /> {enviarTeste.isPending ? "Enviando…" : "Enviar teste para meu número"}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
