import { Navigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/shared/KpiCard";
import { useAuth } from "@/hooks/useAuth";
import { useCanal, useContatos } from "@/hooks/useCrm";
import { ProspeccaoPainel } from "./Prospeccao";
import { InboundTab } from "./crm/InboundTab";
import { ConversasTab } from "./crm/ConversasTab";
import { OportunidadesTab } from "./crm/OportunidadesTab";
import { CanalTab } from "./crm/CanalTab";

const ABAS = ["oportunidades", "prospeccao", "inbound", "conversas", "ana"] as const;
type Aba = (typeof ABAS)[number];

/**
 * CRM: o funil comercial inteiro num lugar só.
 * Prospecção ativa (a Ana vai atrás) e inbound (o lead chega por anúncio, site ou WhatsApp)
 * desembocam nas mesmas oportunidades, e as conversas da Ana ficam espelhadas aqui.
 */
export default function Crm() {
  const { perfil, isColaborador } = useAuth();
  const [params, setParams] = useSearchParams();
  const { contatos } = useContatos();
  const { data: canal = [] } = useCanal();
  const esperando = canal.filter((m) => m.status === "pendente").length;
  if (isColaborador || (perfil && perfil.papel !== "dono")) return <Navigate to="/" replace />;

  const aba: Aba = (ABAS as readonly string[]).includes(params.get("aba") ?? "") ? (params.get("aba") as Aba) : "oportunidades";
  const irPara = (a: Aba, extra: Record<string, string> = {}) => setParams({ aba: a, ...extra }, { replace: true });

  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).toDateString();
  const conversasHoje = contatos.filter(
    (c) => c.last_inbound_at && new Date(new Date(c.last_inbound_at).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).toDateString() === hoje,
  ).length;
  const inbound = contatos.filter((c) => c.tipo === "inbound").length;
  const abertas =
    contatos.filter((c) => c.tipo === "inbound" && c.funil_etapa && !["ganho", "perdido"].includes(c.funil_etapa)).length +
    contatos.filter((c) => c.prospeccao && ["reuniao", "proposta"].includes(c.prospeccao.status_comercial)).length;

  return (
    <section>
      <div className="mb-4">
        <div className="text-[21px] font-semibold">CRM · Funil comercial</div>
        <div className="mt-1 text-[13px] text-muted">
          Prospecção ativa e leads inbound no mesmo funil, com as conversas da Ana ao vivo.
        </div>
      </div>

      <div className="mb-[22px] grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KpiCard label="Oportunidades abertas" value={String(abertas)} delta="reunião ou proposta" index={0} />
        <KpiCard label="Conversas hoje" value={String(conversasHoje)} delta="contatos que escreveram hoje" accent="positive" index={1} />
        <KpiCard label="Contatos inbound" value={String(inbound)} delta="anúncios, site e WhatsApp" index={2} />
        <KpiCard label="Contatos da prospecção" value={String(contatos.length - inbound)} delta="responderam a abordagem" index={3} />
      </div>

      <Tabs value={aba} onValueChange={(v) => irPara(v as Aba)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
          <TabsTrigger value="prospeccao">Prospecção ativa (IA)</TabsTrigger>
          <TabsTrigger value="inbound">Inbound</TabsTrigger>
          <TabsTrigger value="conversas">Conversas</TabsTrigger>
          <TabsTrigger value="ana">Você e a Ana{esperando ? ` (${esperando})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="oportunidades">
          <OportunidadesTab abrirConversa={(id) => irPara("conversas", { lead: id })} />
        </TabsContent>
        <TabsContent value="prospeccao">
          <ProspeccaoPainel />
        </TabsContent>
        <TabsContent value="inbound">
          <InboundTab abrirConversa={(id) => irPara("conversas", { lead: id })} />
        </TabsContent>
        <TabsContent value="conversas">
          <ConversasTab leadId={params.get("lead")} escolher={(id) => irPara("conversas", { lead: id })} />
        </TabsContent>
        <TabsContent value="ana">
          <CanalTab abrirConversa={(id) => irPara("conversas", { lead: id })} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
