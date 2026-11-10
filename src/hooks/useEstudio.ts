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
  /** Trilhas de fundo do reels (links de MP3). O estúdio sorteia uma por vídeo. */
  trilhas?: string[];
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

/** Sobe um arquivo da marca (logo, manual ou trilha) no bucket do Estúdio e devolve o link público. */
export async function subirArquivoDaMarca(arquivo: File, nome: "logo" | "manual" | "trilha"): Promise<string> {
  const ext = (arquivo.name.split(".").pop() || "bin").toLowerCase();
  const caminho = `marca/${nome}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from("estudio").upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: true });
  if (up.error) throw up.error;
  return supabase.storage.from("estudio").getPublicUrl(caminho).data.publicUrl;
}

/* ---------------- Ajustes criativo por criativo ---------------- */

/** O que fazer com a foto de uma lâmina: manter a atual, gerar uma nova (prompt editável) ou usar a do Kelvin. */
export type ModoFoto = "manter" | "nova" | "minha";
export interface AjusteLamina {
  indice: number;
  pedido: string;
  modo: ModoFoto;
  prompt?: string;
  arquivo?: File | null;
}

/**
 * Manda os ajustes da peça, lâmina por lâmina, para a Bia (texto) e a Duda (foto e arte).
 * Fotos "manter" ficam travadas (foto_url), "nova" vai com o prompt do Kelvin, "minha" sobe o arquivo dele.
 * Só as lâminas com pedido mudam de texto; o resto fica idêntico.
 */
export function useAjustarPorLamina() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ pauta, copy, arte, ajustes }: { pauta: Pauta; copy: Peca; arte: Peca; ajustes: AjusteLamina[] }) => {
      const conteudo = structuredClone(copy.conteudo) as { slides?: Record<string, unknown>[]; cenas?: Record<string, unknown>[] };
      const itens = conteudo.slides ?? conteudo.cenas;
      if (!itens?.length) throw new Error("peça sem lâminas na copy");
      const atuais = ((arte.conteudo as { fotos_links?: Record<string, string> }).fotos_links ?? {}) as Record<string, string>;
      const nome = pauta.formato === "reels" ? "cena" : "lâmina";
      const resumo: string[] = [];
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const a = ajustes.find((x) => x.indice === i);
        delete item.pedido;
        delete item.foto_prompt;
        if (!a || a.modo === "manter") {
          // Trava a foto que já está na arte (se a lâmina tem foto). "foto_fixa": só vale para este ajuste
          if (atuais[String(i)] && item.foto_url !== atuais[String(i)]) {
            item.foto_url = atuais[String(i)];
            item.foto_fixa = true;
          }
        } else if (a.modo === "nova") {
          delete item.foto_url;
          delete item.foto_fixa;
          if (a.prompt?.trim()) item.foto_prompt = a.prompt.trim();
          resumo.push(`foto nova na ${nome} ${i + 1}`);
        } else if (a.modo === "minha") {
          if (!a.arquivo) throw new Error(`Escolha a foto da ${nome} ${i + 1}`);
          const ext = (a.arquivo.name.split(".").pop() || "jpg").toLowerCase();
          const caminho = `pautas/${pauta.id}/manual-${i + 1}-${Date.now()}.${ext}`;
          const up = await supabase.storage.from("estudio").upload(caminho, a.arquivo, { contentType: a.arquivo.type || "image/jpeg", upsert: true });
          if (up.error) throw up.error;
          item.foto_url = supabase.storage.from("estudio").getPublicUrl(caminho).data.publicUrl;
          delete item.foto_fixa;
          resumo.push(`foto do Kelvin na ${nome} ${i + 1}`);
        }
        if (a?.pedido.trim()) {
          item.pedido = a.pedido.trim().slice(0, 800);
          resumo.push(`${nome} ${i + 1}: ${a.pedido.trim().slice(0, 160)}`);
        }
      }
      if (!resumo.length) throw new Error("Nenhum ajuste marcado");
      const temTexto = ajustes.some((a) => a.pedido.trim());
      const r1 = await supabase.from("estudio_pecas").update({ conteudo }).eq("id", copy.id);
      if (r1.error) throw r1.error;
      const r2 = await supabase
        .from("estudio_pautas")
        .update({ status: "copy_aprovada", comentario: `${temTexto ? "[lâminas]" : "[fotos]"} ${resumo.join("; ")}`.slice(0, 1500), erro: null, tentativas: 0 })
        .eq("id", pauta.id);
      if (r2.error) throw r2.error;
    },
    onSuccess: invalidar,
  });
}

/* ---------------- Kairogen ---------------- */

export interface InfoKairogen {
  conectado: boolean;
  conectado_em?: string;
  creditos?: string | null;
  ferramentas?: { nome: string; descricao: string }[];
  modelos_imagem?: string[];
  modelo_imagem?: string | null;
  erro?: string | null;
}

type RespostaKairogen = { ok: boolean; info?: InfoKairogen; codigo?: string; link?: string; expira_em?: number; estado?: "conectado" | "aguardando" | "expirado" | "negado" };

export const kairogen = (passo: "status" | "conectar" | "verificar" | "sincronizar" | "modelo" | "desconectar", extra: Record<string, unknown> = {}) =>
  chamarSdr<RespostaKairogen>("/api/estudio", { acao: "kairogen", passo, ...extra });

export function useKairogen() {
  return useQuery({ queryKey: ["kairogen"], queryFn: async () => (await kairogen("status")).info ?? { conectado: false }, staleTime: 60_000 });
}
