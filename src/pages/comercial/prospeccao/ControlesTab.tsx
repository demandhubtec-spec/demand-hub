import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { type OutreachConfig, useOutreachConfig, useOutreachResumo, useUpdateConfig } from "@/hooks/useProspeccao";
import { cn } from "@/lib/utils";
import { DIAS } from "./shared";

function Linha({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-b-0">
      <div>
        <div className="text-[13.5px] font-semibold">{title}</div>
        <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>
      </div>
      {children}
    </div>
  );
}

export function ControlesTab() {
  const { data: cfg, isLoading, error } = useOutreachConfig();
  const { data: resumo } = useOutreachResumo();
  const update = useUpdateConfig();
  const { showToast } = useToast();
  const [confirmarReal, setConfirmarReal] = React.useState(false);
  const [form, setForm] = React.useState<Partial<OutreachConfig> & { optout_txt?: string }>({});

  React.useEffect(() => {
    if (cfg) setForm({ ...cfg, optout_txt: (cfg.optout_words ?? []).join(", ") });
  }, [cfg]);

  if (error) return <EmptyState>Não foi possível carregar a configuração: {(error as Error).message}</EmptyState>;
  if (isLoading || !cfg) return <EmptyState>Carregando…</EmptyState>;

  async function salvar(patch: Partial<OutreachConfig>, descricao: string) {
    try {
      await update.mutateAsync({ patch, descricao });
      showToast(descricao);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  function num(k: keyof OutreachConfig) {
    return (
      <Input
        type="number"
        min={0}
        className="h-9 w-[90px] py-1.5"
        value={(form[k] as number | undefined) ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value === "" ? undefined : Number(e.target.value) }))}
      />
    );
  }

  async function salvarParametros() {
    const f = form;
    const minWa = Number(f.wa_min_interval_sec), maxWa = Number(f.wa_max_interval_sec);
    const minEm = Number(f.email_min_interval_sec), maxEm = Number(f.email_max_interval_sec);
    if (minWa > maxWa || minEm > maxEm) return showToast("O intervalo mínimo não pode ser maior que o máximo");
    if (Number(f.send_start_hour) > Number(f.send_end_hour)) return showToast("O horário de início precisa ser antes do fim");
    await salvar(
      {
        wa_daily_cap: Number(f.wa_daily_cap),
        wa_min_interval_sec: minWa,
        wa_max_interval_sec: maxWa,
        email_daily_cap: Number(f.email_daily_cap),
        email_min_interval_sec: minEm,
        email_max_interval_sec: maxEm,
        send_days: [...(f.send_days ?? [])].sort(),
        send_start_hour: Number(f.send_start_hour),
        send_end_hour: Number(f.send_end_hour),
        optout_words: (f.optout_txt ?? "").split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean),
      },
      "Parâmetros de envio atualizados",
    );
  }

  const fila = resumo?.wa_na_fila ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-5 px-[22px]">
        <div className="text-sm font-semibold">Liga e desliga</div>
        <div className="mb-2 mt-0.5 text-[11.5px] text-muted">Cada mudança fica registrada na aba Atividade.</div>

        <Linha title="WhatsApp" sub={cfg.wa_enabled ? "O motor está disparando dentro da janela" : "Pausado: nada sai pelo WhatsApp"}>
          <Switch checked={cfg.wa_enabled} onCheckedChange={(v) => salvar({ wa_enabled: v }, v ? "WhatsApp retomado" : "WhatsApp pausado")} />
        </Linha>

        <Linha
          title={cfg.dry_run ? "Modo teste (ligado)" : "Envio real (ligado)"}
          sub={cfg.dry_run ? "Só simula e registra no log. Nenhuma mensagem sai." : "As mensagens estão saindo de verdade para os leads."}
        >
          {cfg.dry_run ? (
            <Button size="sm" onClick={() => setConfirmarReal(true)}>Ligar envio real</Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => salvar({ dry_run: true }, "Voltou para o modo teste")}>Voltar ao modo teste</Button>
          )}
        </Linha>

        <Linha title="E-mails" sub={cfg.email_enabled ? "Disparando pelo Gmail dentro da janela" : "Desligado"}>
          <Switch checked={cfg.email_enabled} onCheckedChange={(v) => salvar({ email_enabled: v }, v ? "E-mails ativados" : "E-mails desligados")} />
        </Linha>

        <div className="pt-3.5">
          <Label>Número de teste</Label>
          <div className="mt-1 text-[11.5px] text-muted">
            Se preenchido, todo envio vai para esse número e o lead não muda de status.
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              className="h-9 py-1.5"
              placeholder="5519999999999"
              value={form.test_number ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, test_number: e.target.value }))}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const n = (form.test_number ?? "").replace(/\D/g, "");
                salvar({ test_number: n || null }, n ? `Número de teste: ${n}` : "Número de teste removido");
              }}
            >
              Salvar
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5 px-[22px]">
        <div className="text-sm font-semibold">Ritmo e janela de envio</div>
        <div className="mb-3 mt-0.5 text-[11.5px] text-muted">Horário de São Paulo. Intervalos em segundos, sorteados entre o mínimo e o máximo.</div>

        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-2 text-[12.5px]">
          <span />
          <span className="text-[11px] font-semibold uppercase text-muted">Teto/dia</span>
          <span className="text-[11px] font-semibold uppercase text-muted">Mín. (s)</span>
          <span className="text-[11px] font-semibold uppercase text-muted">Máx. (s)</span>
          <span className="font-semibold">WhatsApp</span>
          {num("wa_daily_cap")}{num("wa_min_interval_sec")}{num("wa_max_interval_sec")}
          <span className="font-semibold">E-mail</span>
          {num("email_daily_cap")}{num("email_min_interval_sec")}{num("email_max_interval_sec")}
        </div>

        <div className="mt-4">
          <Label>Dias de envio</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DIAS.map((d, i) => {
              const on = (form.send_days ?? []).includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, send_days: on ? (f.send_days ?? []).filter((x) => x !== i) : [...(f.send_days ?? []), i] }))
                  }
                  className={cn("rounded-md border px-2.5 py-1 text-[12px] font-semibold", on ? "border-primary bg-primary-tint text-primary-bright" : "border-border text-muted")}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[12.5px]">
          <span>Das</span>{num("send_start_hour")}<span>h até</span>{num("send_end_hour")}<span>h59</span>
        </div>

        <div className="mt-4">
          <Label>Palavras de opt-out</Label>
          <Textarea
            rows={2}
            className="mt-1"
            value={form.optout_txt ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, optout_txt: e.target.value }))}
          />
          <div className="mt-1 text-[11.5px] text-muted">Separe por vírgula. Quem responder com uma delas nunca mais recebe nada.</div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={salvarParametros} disabled={update.isPending}>Salvar parâmetros</Button>
        </div>
      </Card>

      <Dialog open={confirmarReal} onOpenChange={setConfirmarReal}>
        <DialogContent>
          <DialogTitle>Ligar envio real?</DialogTitle>
          <DialogDescription>
            A partir de agora as mensagens saem de verdade para os leads.
          </DialogDescription>
          <div className="rounded-md bg-surface-2 p-3 text-[13px]">
            <b>{fila}</b> leads na fila, até <b>{cfg.wa_daily_cap}</b> por dia
            {fila > 0 && cfg.wa_daily_cap > 0 && <> (cerca de {Math.ceil(fila / cfg.wa_daily_cap)} dias úteis)</>}.
            {cfg.test_number && (
              <div className="mt-2 text-attention">Atenção: o número de teste está preenchido, então tudo ainda vai para {cfg.test_number}.</div>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmarReal(false)}>Cancelar</Button>
            <Button
              onClick={async () => {
                await salvar({ dry_run: false }, "Envio real ligado");
                setConfirmarReal(false);
              }}
            >
              Sim, ligar envio real
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
