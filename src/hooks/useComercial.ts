import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { chamarSdr } from "@/hooks/useProspeccao";
import type { SecaoPlaybook } from "@/hooks/usePlaybook";

/**
 * Time Comercial IA · listas por origem (Instagram, LinkedIn, Ligações), metas do funil,
 * avisos e Insights da Gabi. O Google continua em outreach_leads e o Inbound em sdr_leads.
 */

export type ListaExtra = "instagram" | "linkedin" | "ligacoes";
export type EtapaLista =
  | "na_lista"
  | "contato"
  | "atendida"
  | "conversa"
  | "qualificacao"
  | "reuniao"
  | "reuniao_realizada"
  | "proposta"
  | "ganho"
  | "perdido";

export interface ListaLead {
  id: string;
  lista: ListaExtra;
  rodada: string | null;
  empresa: string;
  perfil: string | null;
  perfil_url: string | null;
  nicho: string | null;
  cidade: string | null;
  whatsapp: string | null;
  email: string | null;
  nota: "Quente" | "Morno" | "Frio" | null;
  pontos: number | null;
  fonte: string | null;
  comentario: string | null;
  post_url: string | null;
  canal: string | null;
  etapa: EtapaLista;
  etapa_max: number;
  valor: number | null;
  tentativas: number;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
}

export function useListaLeads() {
  return useQuery({
    queryKey: ["comercial", "listas"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<ListaLead[]> => {
      const { data, error } = await supabase.from("comercial_lista_leads").select("*").order("criado_em", { ascending: false }).limit(5000);
      if (error) throw error;
      return (data ?? []) as ListaLead[];
    },
  });
}

export function useAtualizarListaLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ListaLead> }) => {
      const { error } = await supabase.from("comercial_lista_leads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comercial", "listas"] }),
  });
}

export interface LinhaImportada {
  empresa: string;
  perfil?: string;
  perfil_url?: string;
  nicho?: string;
  cidade?: string;
  whatsapp?: string;
  email?: string;
  nota?: string;
  pontos?: string;
  fonte?: string;
  comentario?: string;
  post_url?: string;
  canal?: string;
  observacoes?: string;
  etapa?: string;
}

export interface ResultadoImportacao {
  entraram: number;
  repetidos: { empresa: string; perfil: string | null; ficou_em: string }[];
  sem_interesse: number;
}

/** Importa uma rodada. Repetido fica onde apareceu primeiro e vira aviso. */
export function useImportarRodada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: { lista: ListaExtra; rodada: string; linhas: LinhaImportada[] }): Promise<ResultadoImportacao> => {
      const { data, error } = await supabase.rpc("importar_lista_leads", { p_lista: b.lista, p_rodada: b.rodada, p_leads: b.linhas });
      if (error) throw error;
      return data as ResultadoImportacao;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comercial", "listas"] });
      qc.invalidateQueries({ queryKey: ["comercial", "avisos"] });
    },
  });
}

/** Lê o CSV da planilha (separador vírgula ou ponto e vírgula, com aspas) e casa as colunas pelo nome. */
export function lerCsv(texto: string): LinhaImportada[] {
  const sep = (texto.split("\n")[0].match(/;/g)?.length ?? 0) > (texto.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  const [cab, ...resto] = linhas.filter((l) => l.some((c) => c.trim()));
  if (!cab) return [];
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const MAPA: [keyof LinhaImportada, string[]][] = [
    ["perfil", ["perfil", "@ perfil", "instagram", "usuario"]],
    ["empresa", ["nome empresa", "empresa", "nome"]],
    ["nicho", ["nicho", "segmento"]],
    ["cidade", ["cidade uf", "cidade"]],
    ["whatsapp", ["whatsapp", "telefone", "celular"]],
    ["nota", ["nota"]],
    ["pontos", ["pontos"]],
    ["etapa", ["etapa"]],
    ["fonte", ["fonte", "concorrente"]],
    ["comentario", ["comentario"]],
    ["post_url", ["link do post", "post"]],
    ["email", ["e mail", "email"]],
    ["perfil_url", ["link do perfil", "url do perfil"]],
    ["observacoes", ["observacoes", "obs"]],
    ["canal", ["canal"]],
  ];
  const idx = new Map<keyof LinhaImportada, number>();
  const usados = new Set<number>();
  for (const [chave, nomes] of MAPA) {
    for (const n of nomes) {
      const i = cab.findIndex((c, j) => !usados.has(j) && norm(c) === n);
      if (i >= 0) {
        idx.set(chave, i);
        usados.add(i);
        break;
      }
    }
  }
  return resto
    .map((l) => {
      const o: LinhaImportada = { empresa: "" };
      for (const [k, i] of idx) {
        const v = (l[i] ?? "").trim();
        if (v) (o as unknown as Record<string, string>)[k] = v;
      }
      if (!o.empresa) o.empresa = o.perfil ?? "";
      if (o.etapa && norm(o.etapa) === "sem interesse") o.etapa = "sem_interesse";
      return o;
    })
    .filter((o) => o.empresa);
}

export interface Aviso {
  id: string;
  tipo: string;
  lista: string | null;
  rodada: string | null;
  texto: string;
  detalhes: { empresa?: string; perfil?: string | null; ficou_em?: string }[];
  lido: boolean;
  criado_em: string;
}

export function useAvisos() {
  return useQuery({
    queryKey: ["comercial", "avisos"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Aviso[]> => {
      const { data, error } = await supabase.from("comercial_avisos").select("*").order("criado_em", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as Aviso[];
    },
  });
}

export function useMarcarAvisoLido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comercial_avisos").update({ lido: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comercial", "avisos"] }),
  });
}

/* ───────────── Metas ───────────── */

export type CanalFunil = "google" | "instagram" | "linkedin" | "ligacoes" | "inbound";
export type FaseConversa = "abordagem" | "conexao" | "qualificacao" | "agendamento";

export interface Metas {
  vendas_mes: number;
  reunioes_semana: number;
  faltas_max: number;
  topo_venda: number;
  etapas: Record<CanalFunil, Partial<Record<EtapaLista, number>>>;
  fases: Record<FaseConversa, number>;
}

const BASE_LISTA = { contato: 100, conversa: 35, qualificacao: 45, reuniao: 50, reuniao_realizada: 75, proposta: 60, ganho: 40 };
export const METAS_PADRAO: Metas = {
  vendas_mes: 8,
  reunioes_semana: 12,
  faltas_max: 25,
  topo_venda: 1,
  etapas: {
    google: { ...BASE_LISTA },
    instagram: { ...BASE_LISTA },
    linkedin: { ...BASE_LISTA },
    ligacoes: { contato: 100, atendida: 40, conversa: 60, qualificacao: 40, reuniao: 50, reuniao_realizada: 75, proposta: 60, ganho: 40 },
    inbound: { conversa: 80, qualificacao: 50, reuniao: 50, reuniao_realizada: 75, proposta: 60, ganho: 40 },
  },
  fases: { abordagem: 35, conexao: 70, qualificacao: 45, agendamento: 50 },
};

export function useMetas() {
  return useQuery({
    queryKey: ["comercial", "metas"],
    queryFn: async (): Promise<Metas> => {
      const { data, error } = await supabase.from("comercial_metas").select("dados").eq("id", "principal").maybeSingle();
      if (error) throw error;
      const d = (data?.dados ?? {}) as Partial<Metas>;
      return {
        ...METAS_PADRAO,
        ...d,
        etapas: { ...METAS_PADRAO.etapas, ...(d.etapas ?? {}) },
        fases: { ...METAS_PADRAO.fases, ...(d.fases ?? {}) },
      };
    },
  });
}

export function useSalvarMetas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: Metas) => {
      const { error } = await supabase.from("comercial_metas").upsert({ id: "principal", dados: m, atualizado_em: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comercial", "metas"] }),
  });
}

/* ───────────── Insights da Gabi ───────────── */

export interface Analise {
  id: string;
  conversas: number;
  fases: Partial<Record<FaseConversa, { valor: number | null; base: number }>>;
  criado_em: string;
}

export interface Insight {
  id: string;
  fase: FaseConversa;
  gravidade: "gargalo" | "atencao";
  canais: string[];
  agente: "gabi" | "marina";
  titulo: string;
  causa: string;
  trecho: { de: "lead" | "ia" | "nota"; texto: string }[];
  remover: string | null;
  incluir: string[];
  esperado: string | null;
  conversas: number;
  status: "pendente" | "aplicado" | "recusado";
  versao_id: string | null;
  metrica_antes: number | null;
  metrica_depois: number | null;
  criado_em: string;
  decidido_em: string | null;
}

export interface VersaoManual {
  id: string;
  agente: string;
  motivo: string | null;
  criado_em: string;
  secoes: SecaoPlaybook[];
}

export function useInsights() {
  return useQuery({
    queryKey: ["comercial", "insights"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [a, i, v] = await Promise.all([
        supabase.from("comercial_analises").select("*").order("criado_em", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("comercial_insights").select("*").order("criado_em", { ascending: false }).limit(60),
        supabase.from("agentes_manuais_versoes").select("*").order("criado_em", { ascending: false }).limit(10),
      ]);
      if (a.error) throw a.error;
      if (i.error) throw i.error;
      if (v.error) throw v.error;
      return { analise: (a.data ?? null) as Analise | null, insights: (i.data ?? []) as Insight[], versoes: (v.data ?? []) as VersaoManual[] };
    },
  });
}

export function useAnalisarAgora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => chamarSdr<{ ok: boolean; conversas: number; insights: number }>("/api/cron/insights", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comercial", "insights"] }),
  });
}

export const SECAO_CORRECOES = "Correções aprovadas";

/**
 * Aplica a correção no manual do agente (o que a IA do WhatsApp lê):
 * tira a frase que causa o problema (se estiver no manual) e acrescenta as instruções novas
 * na seção "Correções aprovadas". Função pura, testável.
 */
export function aplicarCorrecao(secoes: SecaoPlaybook[], remover: string | null, incluir: string[]): SecaoPlaybook[] {
  const tira = (remover ?? "").trim().toLowerCase();
  const novas = secoes.map((s) =>
    tira
      ? {
          ...s,
          texto: s.texto
            .split("\n")
            .filter((l) => l.trim().toLowerCase().replace(/^[-•*]\s*/, "") !== tira.replace(/^[-•*]\s*/, ""))
            .join("\n"),
        }
      : s,
  );
  const i = novas.findIndex((s) => s.titulo === SECAO_CORRECOES);
  const linhas = incluir.map((l) => l.trim()).filter(Boolean);
  if (i >= 0) {
    const atuais = novas[i].texto.split("\n").filter(Boolean);
    novas[i] = { ...novas[i], texto: [...atuais, ...linhas.filter((l) => !atuais.includes(l))].join("\n") };
  } else novas.push({ titulo: SECAO_CORRECOES, texto: linhas.join("\n") });
  return novas;
}

export function useDecidirInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: { insight: Insight; aprovar: boolean; incluir?: string[]; metricaAntes?: number | null }) => {
      const agora = new Date().toISOString();
      if (!b.aprovar) {
        const { error } = await supabase.from("comercial_insights").update({ status: "recusado", decidido_em: agora }).eq("id", b.insight.id);
        if (error) throw error;
        return;
      }
      const { data: m, error: e1 } = await supabase.from("agentes_manuais").select("secoes").eq("id", b.insight.agente).maybeSingle();
      if (e1) throw e1;
      if (!m) throw new Error(`manual da ${b.insight.agente} não encontrado`);
      const antes = (m.secoes ?? []) as SecaoPlaybook[];
      const { data: v, error: e2 } = await supabase
        .from("agentes_manuais_versoes")
        .insert({ agente: b.insight.agente, secoes: antes, motivo: `Antes da correção: ${b.insight.titulo}`.slice(0, 300) })
        .select("id")
        .single();
      if (e2) throw e2;
      const { data: u } = await supabase.auth.getUser();
      const depois = aplicarCorrecao(antes, b.insight.remover, b.incluir ?? b.insight.incluir);
      const { error: e3 } = await supabase
        .from("agentes_manuais")
        .update({ secoes: depois, atualizado_em: agora, atualizado_por: u.user?.id ?? null })
        .eq("id", b.insight.agente);
      if (e3) throw e3;
      const { error: e4 } = await supabase
        .from("comercial_insights")
        .update({
          status: "aplicado",
          decidido_em: agora,
          versao_id: (v as { id: string }).id,
          incluir: b.incluir ?? b.insight.incluir,
          metrica_antes: b.metricaAntes ?? null,
        })
        .eq("id", b.insight.id);
      if (e4) throw e4;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comercial", "insights"] });
      qc.invalidateQueries({ queryKey: ["comercial", "manuais"] });
    },
  });
}

/** Volta o manual do agente para uma versão salva (guarda a atual antes, para poder desfazer). */
export function useVoltarVersao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: VersaoManual) => {
      const { data: m, error: e1 } = await supabase.from("agentes_manuais").select("secoes").eq("id", v.agente).maybeSingle();
      if (e1) throw e1;
      await supabase.from("agentes_manuais_versoes").insert({ agente: v.agente, secoes: m?.secoes ?? [], motivo: "Antes de voltar uma versão" });
      const { error } = await supabase.from("agentes_manuais").update({ secoes: v.secoes, atualizado_em: new Date().toISOString() }).eq("id", v.agente);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comercial", "insights"] });
      qc.invalidateQueries({ queryKey: ["comercial", "manuais"] });
    },
  });
}
