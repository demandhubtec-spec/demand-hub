import * as React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Segmented } from "@/components/ui/segmented";
import { useAuth } from "@/hooks/useAuth";
import { useCanal } from "@/hooks/useCrm";
import { chamarSdr, useOutreachLeads } from "@/hooks/useProspeccao";
import { supabase } from "@/lib/supabase";
import { NumerosEnvio, StatusOperacao } from "./Prospeccao";
import { AprovacaoTab } from "./prospeccao/AprovacaoTab";
import { AgendaTab } from "./prospeccao/AgendaTab";
import { LeadsTab } from "./prospeccao/LeadsTab";
import { AutomaticoTab } from "./prospeccao/AutomaticoTab";
import { ControlesTab } from "./prospeccao/ControlesTab";
import { AtividadeTab } from "./prospeccao/AtividadeTab";
import { InboundTab } from "./crm/InboundTab";
import { ConversasTab } from "./crm/ConversasTab";
import { CanalTab } from "./crm/CanalTab";
import { PlaybookTab } from "./time/PlaybookTab";
import { PromptGabiTab } from "./time/PromptGabiTab";
import { FunilKanban } from "./time/FunilKanban";
import { ListaDoLeo } from "./time/ListaDoLeo";
import { EtapaRitaDuda } from "./time/EtapaRitaDuda";
import { IndicadoresTab } from "./time/IndicadoresTab";
import { InsightsTab } from "./time/InsightsTab";
import { LigacoesWebhookTab, MetasTab } from "./time/MetasTab";
import { useInsights } from "@/hooks/useComercial";

export const ABAS_TIME = ["central", "aprovacao", "envios", "funil", "indicadores", "insights", "conversas", "contatos", "ana", "playbook", "config"] as const;
export type AbaTime = (typeof ABAS_TIME)[number];

/** Endereços antigos do CRM (?aba=...) caem na aba certa daqui. */
export const ABA_ANTIGA: Record<string, AbaTime> = {
  oportunidades: "funil",
  prospeccao: "aprovacao",
  inbound: "contatos",
  conversas: "conversas",
  ana: "ana",
};

/**
 * Comercial · Time Comercial IA: o time de agentes (Ana coordena; Léo, Rita, Bia, Duda, Rui, Caio, Gabi e Marina)
 * e o CRM no mesmo lugar. A Central mostra o time trabalhando com os números reais; as outras abas são onde
 * você aprova, acompanha o funil, conversa e ajusta o playbook. Só o dono acessa.
 */
export default function TimeComercial() {
  const { perfil, isColaborador } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data: canal = [] } = useCanal();
  const { data: leads = [] } = useOutreachLeads();
  const { data: ins } = useInsights();
  const insightsPendentes = (ins?.insights ?? []).filter((i) => i.status === "pendente").length;

  const bruta = params.get("aba") ?? "";
  const aba: AbaTime = (ABAS_TIME as readonly string[]).includes(bruta) ? (bruta as AbaTime) : (ABA_ANTIGA[bruta] ?? "central");
  const [alturaCentral, setAlturaCentral] = React.useState<number | null>(null);
  const irPara = React.useCallback(
    (a: AbaTime, extra: Record<string, string> = {}) => setParams({ aba: a, ...extra }, { replace: true }),
    [setParams],
  );

  // A Central (HTML na mesma origem) lê os números com o login do portal e pede para abrir as abas daqui
  React.useEffect(() => {
    const w = window as unknown as { __demandSupabase?: typeof supabase; __demandChamarSdr?: typeof chamarSdr };
    w.__demandSupabase = supabase;
    // A conversa com os agentes (texto ou áudio) vai para o servidor da Ana
    w.__demandChamarSdr = chamarSdr;
    const ouvir = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { tipo?: string; aba?: string; lead?: string; h?: number } | null;
      if (d?.tipo === "time-comercial:altura" && typeof d.h === "number") setAlturaCentral(Math.max(640, d.h));
      if (d?.tipo === "time-comercial:ir" && d.aba && (ABAS_TIME as readonly string[]).includes(d.aba)) {
        irPara(d.aba as AbaTime, d.lead ? { lead: d.lead } : {});
      }
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [irPara]);

  if (isColaborador || (perfil && perfil.papel !== "dono")) return <Navigate to="/" replace />;

  const esperando = canal.filter((m) => m.status === "pendente" || m.status === "aguardando_ok").length;
  const paraRevisar =
    leads.filter((l) => l.wa_status === "pendente" && l.msg_status === "rascunho").length +
    leads.filter((l) => l.wa_status === "pendente" && l.leo_status === "pendente" && ["sem", "gerando"].includes(l.msg_status)).length +
    leads.filter((l) => l.wa_status === "pendente" && (l.rita_status === "pendente" || l.duda_status === "pendente")).length;
  const abrirConversa = (id: string) => irPara("conversas", { lead: id });

  return (
    <Tabs value={aba} onValueChange={(v) => irPara(v as AbaTime)}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="central">Central do time</TabsTrigger>
        <TabsTrigger value="aprovacao">Aprovação{paraRevisar ? ` (${paraRevisar})` : ""}</TabsTrigger>
        <TabsTrigger value="envios">Envios</TabsTrigger>
        <TabsTrigger value="funil">Funil</TabsTrigger>
        <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
        <TabsTrigger value="insights">Insights{insightsPendentes ? ` (${insightsPendentes})` : ""}</TabsTrigger>
        <TabsTrigger value="conversas">Conversas</TabsTrigger>
        <TabsTrigger value="contatos">Contatos</TabsTrigger>
        <TabsTrigger value="ana">Você e a Gabi{esperando ? ` (${esperando})` : ""}</TabsTrigger>
        <TabsTrigger value="playbook">Playbook</TabsTrigger>
        <TabsTrigger value="config">Configurações</TabsTrigger>
      </TabsList>

      {["aprovacao", "envios", "config"].includes(aba) && <StatusOperacao />}

      <TabsContent value="central">
        <iframe
          src="/central-comercial.html"
          title="Central do Time Comercial IA"
          className="block w-full rounded-[14px] border-0"
          scrolling="no"
          allow="microphone"
          style={{ height: alturaCentral ?? "calc(100vh - 140px)", minHeight: 640 }}
        />
      </TabsContent>
      <TabsContent value="aprovacao">
        <Aprovacoes />
      </TabsContent>
      <TabsContent value="envios">
        <NumerosEnvio />
        <AgendaTab />
      </TabsContent>
      <TabsContent value="funil">
        <FunilKanban abrirConversa={abrirConversa} />
      </TabsContent>
      <TabsContent value="indicadores">
        <IndicadoresTab irPara={(a) => irPara(a)} />
      </TabsContent>
      <TabsContent value="insights">
        <InsightsTab />
      </TabsContent>
      <TabsContent value="conversas">
        <ConversasTab leadId={params.get("lead")} escolher={abrirConversa} />
      </TabsContent>
      <TabsContent value="contatos">
        <Contatos abrirConversa={abrirConversa} />
      </TabsContent>
      <TabsContent value="ana">
        <CanalTab abrirConversa={abrirConversa} />
      </TabsContent>
      <TabsContent value="playbook">
        <PlaybookTab />
      </TabsContent>
      <TabsContent value="config">
        <Configuracoes />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Aprovações por etapa do time: primeiro a lista do Léo, depois o raio-x e as mensagens (Rita, Bia e Rui).
 * Nada segue para a próxima etapa sem o seu ok.
 */
function Aprovacoes() {
  const { data: leads = [] } = useOutreachLeads();
  const naFila = leads.filter((l) => l.wa_status === "pendente");
  const leo = naFila.filter((l) => l.leo_status === "pendente" && ["sem", "gerando"].includes(l.msg_status)).length;
  const rita = naFila.filter((l) => l.rita_status === "pendente").length;
  const duda = naFila.filter((l) => l.duda_status === "pendente").length;
  const msgs = naFila.filter((l) => l.msg_status === "rascunho").length;
  const primeira = leo ? "leo" : rita ? "rita" : duda ? "duda" : msgs ? "mensagens" : "leo";
  const [visao, setVisao] = React.useState<"leo" | "rita" | "duda" | "mensagens">(primeira);
  const n = (x: number) => (x ? ` (${x})` : "");
  return (
    <div>
      <Segmented
        value={visao}
        onChange={setVisao}
        opcoes={[
          { value: "leo", label: `1. Lista · Léo${n(leo)}` },
          { value: "rita", label: `2. Diagnóstico · Rita${n(rita)}` },
          { value: "duda", label: `3. Relatório e site · Duda${n(duda)}` },
          { value: "mensagens", label: `4. Mensagens e cadência · Bia, Rui e Caio${n(msgs)}` },
        ]}
      />
      {visao === "leo" ? <ListaDoLeo /> : visao === "rita" ? <EtapaRitaDuda etapa="rita" /> : visao === "duda" ? <EtapaRitaDuda etapa="duda" /> : <AprovacaoTab />}
    </div>
  );
}

/** Contatos: a lista do Léo (prospecção) e quem chegou sozinho (inbound). */
function Contatos({ abrirConversa }: { abrirConversa: (id: string) => void }) {
  const [visao, setVisao] = React.useState<"lista" | "inbound">("lista");
  return (
    <div>
      <Segmented
        value={visao}
        onChange={setVisao}
        opcoes={[
          { value: "lista", label: "Lista da prospecção" },
          { value: "inbound", label: "Inbound" },
        ]}
      />
      {visao === "lista" ? <LeadsTab /> : <InboundTab abrirConversa={abrirConversa} />}
    </div>
  );
}

/** Configurações: Prompt System da Gabi, prospecção automática, limites e controles, metas do funil, webhook das ligações e o registro do que o robô fez. */
function Configuracoes() {
  const [params, setParams] = useSearchParams();
  type Visao = "prompt" | "automatico" | "controles" | "metas" | "ligacoes" | "atividade";
  const visoes: Visao[] = ["prompt", "automatico", "controles", "metas", "ligacoes", "atividade"];
  const v = params.get("config") as Visao | null;
  const visao: Visao = v && visoes.includes(v) ? v : "prompt";
  const setVisao = (n: Visao) => setParams({ aba: "config", config: n }, { replace: true });
  return (
    <div>
      <Segmented
        value={visao}
        onChange={setVisao}
        opcoes={[
          { value: "prompt", label: "Prompt System da Gabi" },
          { value: "automatico", label: "Automático" },
          { value: "controles", label: "Controles" },
          { value: "metas", label: "Metas do funil" },
          { value: "ligacoes", label: "Ligações · webhook" },
          { value: "atividade", label: "Registro de atividade" },
        ]}
      />
      {visao === "prompt" ? (
        <PromptGabiTab />
      ) : visao === "automatico" ? (
        <AutomaticoTab />
      ) : visao === "controles" ? (
        <ControlesTab />
      ) : visao === "metas" ? (
        <MetasTab />
      ) : visao === "ligacoes" ? (
        <LigacoesWebhookTab />
      ) : (
        <AtividadeTab />
      )}
    </div>
  );
}
