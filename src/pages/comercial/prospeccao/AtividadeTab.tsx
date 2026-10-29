import { AlertTriangle, Ban, CheckCircle2, FlaskConical, Mail, MessageSquareReply, PhoneOff, RefreshCw, Send, Settings, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { detalheTexto, useOutreachColetas, useOutreachLeads, useOutreachLog } from "@/hooks/useProspeccao";
import { fmtData } from "./shared";

const icones: Record<string, { icon: typeof Send; cls: string; label: string }> = {
  sent: { icon: Send, cls: "text-positive", label: "Enviado" },
  sent_test: { icon: FlaskConical, cls: "text-primary-bright", label: "Teste enviado" },
  dry_run: { icon: FlaskConical, cls: "text-muted", label: "Simulado" },
  error: { icon: AlertTriangle, cls: "text-negative", label: "Erro" },
  reply: { icon: MessageSquareReply, cls: "text-positive", label: "Respondeu" },
  replied: { icon: MessageSquareReply, cls: "text-positive", label: "Respondeu" },
  instance_down: { icon: WifiOff, cls: "text-attention", label: "Instância desconectada" },
  optout: { icon: Ban, cls: "text-negative", label: "Opt-out" },
  sem_whatsapp: { icon: PhoneOff, cls: "text-attention", label: "Sem WhatsApp" },
  config: { icon: Settings, cls: "text-muted", label: "Configuração" },
  sync: { icon: RefreshCw, cls: "text-primary-bright", label: "Importação" },
  ok: { icon: RefreshCw, cls: "text-muted", label: "Sincronização" },
};

export function AtividadeTab() {
  const { data: log = [], isLoading } = useOutreachLog();
  const { data: leads = [] } = useOutreachLeads();
  const { data: coletas = [] } = useOutreachColetas();
  const nome = new Map(leads.map((l) => [l.place_id, l.empresa]));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-5 px-[22px]">
        <div className="text-sm font-semibold">Atividade</div>
        <div className="mb-3 mt-0.5 text-[11.5px] text-muted">Últimos 50 eventos · atualiza sozinho</div>
        {isLoading ? <div className="text-[12.5px] text-muted">Carregando…</div> : log.length === 0 ? (
          <div className="text-[12.5px] text-muted">Nada registrado ainda.</div>
        ) : (
          <ul className="space-y-2.5">
            {log.map((e) => {
              const base = icones[e.event] ?? { icon: CheckCircle2, cls: "text-muted", label: e.event };
              const ic = e.channel === "email" && e.event === "sent" ? { icon: Mail, cls: "text-positive", label: "E-mail enviado" } : base;
              const det = detalheTexto(e.detail);
              const Icon = ic.icon;
              return (
                <li key={e.id} className="flex gap-3">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ic.cls}`} />
                  <div className="min-w-0 flex-1 text-[12.5px]">
                    <div>
                      <b className="font-semibold">{ic.label}</b>
                      {e.place_id && nome.get(e.place_id) && <> · {nome.get(e.place_id)}</>}
                    </div>
                    {det && <div className="truncate text-muted" title={det}>{det}</div>}
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-muted">{fmtData(e.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div>
        <div className="mb-2 text-sm font-semibold">Coletas</div>
        {coletas.length === 0 ? <EmptyState>Nenhuma coleta registrada ainda.</EmptyState> : (
          <TableWrap>
            <thead>
              <tr><Th>Data</Th><Th>Cidades</Th><Th>Nichos</Th><Th>Coletados</Th><Th>Novos</Th><Th>Custo</Th><Th>Mês</Th></tr>
            </thead>
            <tbody>
              {coletas.map((c) => (
                <tr key={c.id}>
                  <Td>{fmtData(c.executada_em)}</Td>
                  <Td wrap>{(c.cidades ?? []).join(", ") || "—"}</Td>
                  <Td wrap>{(c.nichos ?? []).join(", ") || "—"}</Td>
                  <Td>{c.lugares_coletados ?? "—"}</Td>
                  <Td>{c.novos_adicionados ?? "—"}</Td>
                  <Td>US$ {Number(c.custo_usd ?? 0).toFixed(2)}</Td>
                  <Td>US$ {Number(c.acumulado_mes_usd ?? 0).toFixed(2)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
