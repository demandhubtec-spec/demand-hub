import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { chamarSdr } from "@/hooks/useProspeccao";

/** Estúdio: social media no automático. Tabelas estudio_* (só perfil dono) + ações no servidor da Ana. */

export type Formato = "estatico" | "carrossel" | "reels";
export type StatusPauta =
  | "pauta"
  | "revisar_copy"
  | "copy_aprovada"
  | "aguardando_video"
  | "revisar_arte"
  | "agendado"
  | "publicando"
  | "publicado"
  | "erro"
  | "descartado";

export interface Pauta {
  id: string;
  dia: string;
  horario: string;
  formato: Formato;
  pilar: string | null;
  tema: string;
  gancho: string | null;
  palavra_gatilho: string | null;
  status: StatusPauta;
  comentario: string | null;
  erro: string | null;
}

export interface Peca {
  id: string;
  pauta_id: string;
  tipo: "copy" | "arte";
  versao: number;
  conteudo: Record<string, unknown>;
  arquivos: string[];
  criado_em: string;
}

export interface Fonte {
  id: string;
  tipo: "conta" | "hashtag";
  valor: string;
  nome: string | null;
  seguidores: number | null;
  posts: number | null;
  verificado_em: string | null;
  erro: string | null;
  ativo: boolean;
}

export interface ConfigEstudio {
  ativo: boolean;
  agentes: Record<string, boolean>;
  horarios: string[];
  dias_a_frente: number;
  pilares: { nome: string; descricao: string }[];
  mix: Partial<Record<Formato, number>>;
  ultimo_radar: string | null;
  inicio_em: string | null;
  marca: Marca | null;
  perfil_padrao: { resumo?: string; visual?: string; atualizado_em?: string } | null;
  ultimo_perfil: string | null;
}

/** Manual de marca que os agentes seguem nas copies, nas artes e nos vídeos. */
export interface Marca {
  nome?: string;
  cores?: { fundo?: string; fundo2?: string; destaque?: string; destaque2?: string; texto?: string };
  fontes?: { titulo?: string; texto?: string };
  logo_url?: string;
  logo_proporcao?: number;
  manual_url?: string;
  tom?: string;
  regras?: string;
  assinatura?: string;
}

export const STATUS_TEXTO: Record<StatusPauta, string> = {
  pauta: "Escrevendo",
  revisar_copy: "Aprovar copy",
  copy_aprovada: "Fazendo a arte",
  aguardando_video: "Falta o vídeo",
  revisar_arte: "Aprovar arte",
  agendado: "Agendado",
  publicando: "Publicando",
  publicado: "Publicado",
  erro: "Erro",
  descartado: "Descartado",
};

export const FORMATO_TEXTO: Record<Formato, string> = { estatico: "Estático", carrossel: "Carrossel", reels: "Reels" };

export const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

export function usePautas() {
  return useQuery({
    queryKey: ["estudio", "pautas"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("estudio_pautas").select("*").gte("dia", desde).order("dia").order("horario");
      if (error) throw error;
      return (data ?? []) as Pauta[];
    },
  });
}

/** Última copy e última arte de cada pauta. */
export function usePecas(ids: string[]) {
  return useQuery({
    queryKey: ["estudio", "pecas", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("estudio_pecas").select("*").in("pauta_id", ids).order("versao", { ascending: false });
      if (error) throw error;
      const ultima: Record<string, { copy?: Peca; arte?: Peca }> = {};
      for (const p of (data ?? []) as Peca[]) {
        const u = (ultima[p.pauta_id] ??= {});
        if (!u[p.tipo]) u[p.tipo] = p;
      }
      return ultima;
    },
  });
}

export function useConfigEstudio() {
  return useQuery({
    queryKey: ["estudio", "config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("estudio_config").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as ConfigEstudio | null;
    },
  });
}

export function useFontes() {
  return useQuery({
    queryKey: ["estudio", "fontes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("estudio_fontes").select("*").order("criado_em");
      if (error) throw error;
      return (data ?? []) as Fonte[];
    },
  });
}

export function useReferencias() {
  return useQuery({
    queryKey: ["estudio", "referencias"],
    queryFn: async () => {
      const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("estudio_referencias")
        .select("id,conta,link,formato,legenda,curtidas,comentarios,views,nota,motivo,publicado_em")
        .gte("publicado_em", desde)
        .order("nota", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["estudio"] });
}

/** Aprovar, pedir ajuste ou descartar uma pauta. */
export function useDecidirPauta() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ pauta, decisao, comentario }: { pauta: Pauta; decisao: "aprovar" | "ajuste" | "descartar"; comentario?: string }) => {
      let patch: Record<string, unknown>;
      if (decisao === "descartar") patch = { status: "descartado" };
      else if (decisao === "aprovar") patch = { status: pauta.status === "revisar_copy" ? "copy_aprovada" : "agendado", comentario: null, erro: null };
      // Ajuste na copy volta para o Redator; ajuste na arte volta para o Diretor de arte
      else patch = { status: pauta.status === "revisar_copy" ? "pauta" : "copy_aprovada", comentario: comentario?.trim() || "Refazer", erro: null };
      const { error } = await supabase.from("estudio_pautas").update(patch).eq("id", pauta.id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

/** Muda dia e horário de uma pauta. */
export function useReagendar() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, dia, horario }: { id: string; dia: string; horario: string }) => {
      const { error } = await supabase.from("estudio_pautas").update({ dia, horario }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

/**
 * Troca a foto de uma lâmina (ou cena do reels) pela que o Kelvin fez no ChatGPT dele.
 * A foto fica gravada na copy (foto_url) e a Duda refaz a arte só com essa troca, sem mexer no texto.
 */
export function useTrocarFoto() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ pauta, copy, indice, arquivo }: { pauta: Pauta; copy: Peca; indice: number; arquivo: File }) => {
      const ext = (arquivo.name.split(".").pop() || "jpg").toLowerCase();
      const caminho = `pautas/${pauta.id}/manual-${indice + 1}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("estudio").upload(caminho, arquivo, { contentType: arquivo.type || "image/jpeg", upsert: true });
      if (up.error) throw up.error;
      const url = supabase.storage.from("estudio").getPublicUrl(caminho).data.publicUrl;
      const conteudo = structuredClone(copy.conteudo) as { slides?: Record<string, unknown>[]; cenas?: Record<string, unknown>[] };
      const itens = conteudo.slides ?? conteudo.cenas;
      if (!itens?.[indice]) throw new Error("lâmina não encontrada na copy");
      itens[indice].foto_url = url;
      const r1 = await supabase.from("estudio_pecas").update({ conteudo }).eq("id", copy.id);
      if (r1.error) throw r1.error;
      const r2 = await supabase
        .from("estudio_pautas")
        .update({ status: "copy_aprovada", comentario: `[fotos] Kelvin trocou a foto ${pauta.formato === "reels" ? "da cena" : "da lâmina"} ${indice + 1} pela que fez no ChatGPT`, erro: null, tentativas: 0 })
        .eq("id", pauta.id);
      if (r2.error) throw r2.error;
    },
    onSuccess: invalidar,
  });
}

/** Reels: sobe o vídeo (e a capa, se tiver) e manda para aprovação da arte. */
export function useEnviarVideo() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ pauta, video, versao }: { pauta: Pauta; video: File; versao: number }) => {
      const ext = (video.name.split(".").pop() || "mp4").toLowerCase();
      const caminho = `pautas/${pauta.id}/v${versao}-video.${ext}`;
      const up = await supabase.storage.from("estudio").upload(caminho, video, { contentType: video.type || "video/mp4", upsert: true });
      if (up.error) throw up.error;
      const url = supabase.storage.from("estudio").getPublicUrl(caminho).data.publicUrl;
      const { error } = await supabase.from("estudio_pecas").insert({ pauta_id: pauta.id, tipo: "arte", versao, conteudo: { modelo: "video" }, arquivos: [url] });
      if (error) throw error;
      const r = await supabase.from("estudio_pautas").update({ status: "revisar_arte", erro: null }).eq("id", pauta.id);
      if (r.error) throw r.error;
    },
    onSuccess: invalidar,
  });
}

export function useSalvarConfig() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (patch: Partial<ConfigEstudio>) => {
      const { error } = await supabase.from("estudio_config").update(patch).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useFonteAcoes() {
  const invalidar = useInvalidar();
  const verificar = useMutation({
    mutationFn: (username: string) =>
      chamarSdr<{ ok: boolean; username: string; nome?: string | null; seguidores?: number | null; erro?: string }>("/api/estudio", { acao: "verificar", username }),
    onSuccess: invalidar,
  });
  const alternar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("estudio_fontes").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("estudio_fontes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
  return { verificar, alternar, remover };
}

/** Roda um agente agora, sem esperar o relógio. */
export function useRodarAgente() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (etapa: "radar" | "perfil" | "pauteiro" | "redator" | "diretor" | "publicador") =>
      chamarSdr<{ ok: boolean; resultado: Record<string, unknown> }>("/api/estudio", { acao: "rodar", etapa }),
    onSuccess: invalidar,
  });
}

/** Sobe um arquivo da marca (logo ou manual) no bucket do Estúdio e devolve o link público. */
export async function subirArquivoDaMarca(arquivo: File, nome: "logo" | "manual"): Promise<string> {
  const ext = (arquivo.name.split(".").pop() || "bin").toLowerCase();
  const caminho = `marca/${nome}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from("estudio").upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: true });
  if (up.error) throw up.error;
  return supabase.storage.from("estudio").getPublicUrl(caminho).data.publicUrl;
}
