import * as React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Segmented } from "@/components/ui/segmented";
import { useAuth } from "@/hooks/useAuth";
import { useCanal } from "@/hooks/useCrm";
import { useOutreachLeads } from "@/hooks/useProspeccao";
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
import { FunilKanban } from "./time/FunilKanban";

export const ABAS_TIME = ["central", "aprovacao", "envios", "funil", "conversas", "contatos", "ana", "playbook", "config"] as const;
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

  const bruta = params.get("aba") ?? "";
  const aba: AbaTime = (ABAS_TIME as readonly string[]).includes(bruta) ? (bruta as AbaTime) : (ABA_ANTIGA[bruta] ?? "central");
  const irPara = React.useCallback(
    (a: AbaTime, extra: Record<string, string> = {}) => setParams({ aba: a, ...extra }, { replace: true }),
    [setParams],
  );

  // A Central (HTML na mesma origem) lê os números com o login do portal e pede para abrir as abas daqui
  React.useEffect(() => {
    (window as unknown as { __demandSupabase?: typeof supabase }).__demandSupabase = supabase;
    const ouvir = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { tipo?: string; aba?: string; lead?: string } | null;
      if (d?.tipo === "time-comercial:ir" && d.aba && (ABAS_TIME as readonly string[]).includes(d.aba)) {
        irPara(d.aba as AbaTime, d.lead ? { lead: d.lead } : {});
      }
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [irPara]);

  if (isColaborador || (perfil && perfil.papel !== "dono")) return <Navigate to="/" replace />;

  const esperando = canal.filter((m) => m.status === "pendente" || m.status === "aguardando_ok").length;
  const paraRevisar = leads.filter((l) => l.wa_status === "pendente" && l.msg_status === "rascunho").length;
  const abrirConversa = (id: string) => irPara("conversas", { lead: id });

  return (
    <Tabs value={aba} onValueChange={(v) => irPara(v as AbaTime)}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="central">Central do time</TabsTrigger>
        <TabsTrigger value="aprovacao">Aprovação{paraRevisar ? ` (${paraRevisar})` : ""}</TabsTrigger>
        <TabsTrigger value="envios">Envios</TabsTrigger>
        <TabsTrigger value="funil">Funil</TabsTrigger>
        <TabsTrigger value="conversas">Conversas</TabsTrigger>
        <TabsTrigger value="contatos">Contatos</TabsTrigger>
        <TabsTrigger value="ana">Você e a Ana{esperando ? ` (${esperando})` : ""}</TabsTrigger>
        <TabsTrigger value="playbook">Playbook</TabsTrigger>
        <TabsTrigger value="config">Configurações</TabsTrigger>
      </TabsList>

      {aba !== "central" && <StatusOperacao />}

      <TabsContent value="central">
        <iframe
          src="/central-comercial.html"
          title="Central do Time Comercial IA"
          className="block w-full rounded-[14px] border-0"
          style={{ height: "calc(100vh - 140px)", minHeight: 640 }}
        />
      </TabsContent>
      <TabsContent value="aprovacao">
        <AprovacaoTab />
      </TabsContent>
      <TabsContent value="envios">
        <NumerosEnvio />
        <AgendaTab />
      </TabsContent>
      <TabsContent value="funil">
        <FunilKanban abrirConversa={abrirConversa} />
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

/** Configurações: prospecção automática, limites e controles, e o registro do que o robô fez. */
function Configuracoes() {
  const [visao, setVisao] = React.useState<"automatico" | "controles" | "atividade">("automatico");
  return (
    <div>
      <Segmented
        value={visao}
        onChange={setVisao}
        opcoes={[
          { value: "automatico", label: "Automático" },
          { value: "controles", label: "Controles" },
          { value: "atividade", label: "Registro de atividade" },
        ]}
      />
      {visao === "automatico" ? <AutomaticoTab /> : visao === "controles" ? <ControlesTab /> : <AtividadeTab />}
    </div>
  );
}
