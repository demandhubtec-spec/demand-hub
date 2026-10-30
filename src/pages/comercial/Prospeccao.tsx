import * as React from "react";
import { Navigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/KpiCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import {
  useInstanceStatus,
  useOutreachConfig,
  useOutreachLeads,
  useOutreachOrcamento,
  useOutreachResumo,
} from "@/hooks/useProspeccao";
import { cn } from "@/lib/utils";
import { janelaTexto } from "./prospeccao/shared";
import { LeadsTab } from "./prospeccao/LeadsTab";
import { TemplatesTab } from "./prospeccao/TemplatesTab";
import { ControlesTab } from "./prospeccao/ControlesTab";
import { AtividadeTab } from "./prospeccao/AtividadeTab";
import { AprovacaoTab } from "./prospeccao/AprovacaoTab";
import { FunilTab } from "./prospeccao/FunilTab";
import { AutomaticoTab } from "./prospeccao/AutomaticoTab";

function StatePill({ ok, children, strong = false }: { ok: boolean | null; children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold",
        ok === null && "border-border text-muted",
        ok === true && "border-positive/40 bg-positive-tint text-positive",
        ok === false && "border-attention/40 bg-attention-tint text-attention",
        strong && "ring-1 ring-current",
      )}
    >
      <span className={cn("h-[7px] w-[7px] rounded-full bg-current", ok === null && "opacity-40")} />
      {children}
    </span>
  );
}

function useCountdown(iso: string | null | undefined) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return "-";
  const diff = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  if (diff === 0) return "agora";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Prospeccao() {
  const { perfil, isColaborador } = useAuth();
  const { data: cfg } = useOutreachConfig();
  const { data: resumo } = useOutreachResumo();
  const { data: leads = [] } = useOutreachLeads();
  const { data: orc } = useOutreachOrcamento();
  const { data: inst, isError: instErro } = useInstanceStatus();
  const proximo = useCountdown(cfg?.next_wa_at);

  if (isColaborador || (perfil && perfil.papel !== "dono")) return <Navigate to="/" replace />;

  const r = resumo;
  const taxa = r && r.wa_enviados > 0 ? Math.round((r.responderam / r.wa_enviados) * 100) : 0;

  const fila = leads.filter((l) => l.wa_status === "pendente");
  const aprovadas = fila.filter((l) => l.msg_status === "aprovada").length;
  const paraRevisar = fila.filter((l) => l.msg_status === "rascunho").length;
  const emCadencia = leads.filter((l) => l.cadencia === "ativa").length;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[21px] font-semibold">Prospecção ativa</div>
          <div className="mt-1 text-[13px] text-muted">
            Abordagem e follow-up automáticos por WhatsApp e e-mail para leads coletados no Google Maps.
          </div>
        </div>
      </div>

      <div className="mb-[22px] flex flex-wrap gap-2">
        <StatePill ok={cfg ? cfg.wa_enabled : null}>{cfg?.wa_enabled ? "WhatsApp ativo" : "WhatsApp pausado"}</StatePill>
        <StatePill ok={cfg ? !cfg.dry_run : null} strong>
          {cfg?.dry_run ? "Modo teste" : "Envio real"}
        </StatePill>
        <StatePill ok={instErro ? false : inst ? inst.connected : null}>
          {instErro ? "Instância: sem resposta" : inst?.connected ? "Instância conectada" : inst ? "Instância desconectada" : "Instância…"}
        </StatePill>
        <StatePill ok={null}>{cfg ? janelaTexto(cfg.send_days, cfg.send_start_hour, cfg.send_end_hour) : "Janela…"}</StatePill>
        <StatePill ok={null}>Próximo envio: {proximo}</StatePill>
        {cfg?.test_number && <StatePill ok={false}>Número de teste ativo</StatePill>}
        {cfg?.exigir_aprovacao !== false && (
          <StatePill ok={aprovadas > 0}>
            {aprovadas} aprovados · {paraRevisar} para revisar
          </StatePill>
        )}
      </div>

      <div className="mb-[22px] grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KpiCard label="Em cadência" value={String(emCadencia)} delta={`${aprovadas} aprovados na fila`} index={0} />
        <KpiCard
          label="Enviados hoje"
          value={`${r?.wa_hoje ?? 0} / ${cfg?.wa_daily_cap ?? "-"}`}
          index={1}
        />
        <KpiCard label="Total enviados" value={String(r?.wa_enviados ?? "-")} index={2} />
        <KpiCard
          label="Responderam"
          value={String(r?.responderam ?? "-")}
          delta={`${taxa}% de resposta`}
          accent="positive"
          index={3}
        />
        <KpiCard label="Opt-out" value={String(r?.optout ?? "-")} accent="attention" index={4} />
        <KpiCard label="Erros / sem WhatsApp" value={String(r?.wa_erros ?? "-")} accent="attention" index={5} />
        <KpiCard label="E-mails enviados" value={String(r?.emails_enviados ?? "-")} index={6} />
        <KpiCard
          label="Gasto Apify no mês"
          value={`US$ ${Number(orc?.gasto_usd ?? 0).toFixed(2)}`}
          delta={`teto US$ ${orc?.teto_usd ?? 4}`}
          deltaClass={Number(orc?.gasto_usd ?? 0) >= Number(orc?.teto_usd ?? 4) ? "warn" : "up"}
          index={7}
        />
      </div>


      <Tabs defaultValue="aprovacao">
        <TabsList>
          <TabsTrigger value="aprovacao">Aprovação{paraRevisar ? ` (${paraRevisar})` : ""}</TabsTrigger>
          <TabsTrigger value="funil">Funil</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="templates">Mensagens</TabsTrigger>
          <TabsTrigger value="automatico">Automático</TabsTrigger>
          <TabsTrigger value="controles">Controles</TabsTrigger>
          <TabsTrigger value="atividade">Atividade</TabsTrigger>
        </TabsList>
        <TabsContent value="aprovacao">
          <AprovacaoTab />
        </TabsContent>
        <TabsContent value="funil">
          <FunilTab />
        </TabsContent>
        <TabsContent value="leads">
          <LeadsTab />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="automatico">
          <AutomaticoTab />
        </TabsContent>
        <TabsContent value="controles">
          <ControlesTab />
        </TabsContent>
        <TabsContent value="atividade">
          <AtividadeTab />
        </TabsContent>
      </Tabs>
    </section>
  );
}
