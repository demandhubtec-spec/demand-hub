import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ChevronRight, File as FileIcon, Image as ImageIcon, Music, Paperclip, Plus, Send, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { usePerfis } from "@/hooks/usePerfis";
import { useUpdateProjeto, type ProjetoView } from "@/hooks/useProjetos";
import {
  useAtividadesProjeto,
  useCreateAtividade,
  useUpdateAtividade,
  type AtividadeView,
} from "@/hooks/useAtividades";
import { useMensagens, useEnviarMensagem, type ChatAlvo } from "@/hooks/useMensagens";
import { useAnexos, useUploadAnexos, useRemoverAnexo, abrirAnexo } from "@/hooks/useAnexos";
import type { Anexo, AtividadePrioridade, AtividadeStatus, Perfil, ProjetoStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// Mesmas opções do protótipo; valores fora delas (ex.: "urgente", "atrasado") só aparecem se já estiverem salvos.
const prioridadeBase: { value: AtividadePrioridade; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
];
const prioridadeExtra: Record<string, string> = { urgente: "Urgente" };

const projetoStatusBase: { value: ProjetoStatus; label: string }[] = [
  { value: "a-fazer", label: "A fazer" },
  { value: "andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
];

const atividadeStatusBase: { value: AtividadeStatus; label: string }[] = [
  { value: "a-fazer", label: "A fazer" },
  { value: "andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
];
const statusExtra: Record<string, string> = { atrasado: "Atrasado" };

function comAtual<T extends string>(base: { value: T; label: string }[], atual: T, extras: Record<string, string>) {
  if (base.some((o) => o.value === atual)) return base;
  return [...base, { value: atual, label: extras[atual] ?? atual }];
}

const ERRO = "Não foi possível salvar — verifique a conexão com o Supabase";

function formatarData(iso: string | null) {
  if (!iso) return "";
  return new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("pt-BR");
}

function formatarHora(iso: string) {
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return hoje ? hora : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

// ---------------------------------------------------------------------------
// Peças reutilizadas pelas duas telas do modal (projeto e atividade)
// ---------------------------------------------------------------------------

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2.5 text-xs font-bold uppercase tracking-[.04em] text-muted", className)}>{children}</div>
  );
}

function BriefingInput({
  value,
  placeholder,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  const [texto, setTexto] = React.useState(value ?? "");
  React.useEffect(() => setTexto(value ?? ""), [value]);
  return (
    <textarea
      rows={3}
      value={texto}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => texto !== (value ?? "") && onSave(texto)}
      className="w-full resize-y rounded-[7px] border border-border bg-surface-2 px-3 py-2.5 text-[13.5px] leading-normal text-ink focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-primary-bright"
    />
  );
}

function TitleInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [texto, setTexto] = React.useState(value);
  React.useEffect(() => setTexto(value), [value]);
  return (
    <input
      type="text"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => texto.trim() && texto !== value && onSave(texto.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="mb-0.5 w-full border-none bg-transparent px-0 py-0.5 font-display text-[19px] font-bold text-ink focus:border-b-[1.5px] focus:border-primary-bright focus:outline-none"
    />
  );
}

function DateField({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string | null) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="date" value={value ?? ""} onChange={(e) => onSave(e.target.value || null)} />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onSave: (v: T) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onSave(v as T)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[75]">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ResponsavelField({
  value,
  perfis,
  onSave,
}: {
  value: string | null;
  perfis: Perfil[];
  onSave: (v: string | null) => void;
}) {
  return (
    <div>
      <Label>Responsável</Label>
      <Select value={value || "none"} onValueChange={(v) => onSave(v === "none" ? null : v)}>
        <SelectTrigger>
          <SelectValue placeholder="Selecionar" />
        </SelectTrigger>
        <SelectContent className="z-[75]">
          <SelectItem value="none">Sem responsável</SelectItem>
          {perfis.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Chat({ titulo, alvo, perfis }: { titulo: string; alvo: ChatAlvo; perfis: Perfil[] }) {
  const { session } = useAuth();
  const { showToast } = useToast();
  const { data: mensagens = [], isLoading } = useMensagens(alvo);
  const enviar = useEnviarMensagem();
  const [texto, setTexto] = React.useState("");
  const listaRef = React.useRef<HTMLDivElement>(null);

  const nomePorId = React.useMemo(() => new Map(perfis.map((p) => [p.id, p.nome])), [perfis]);

  React.useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [mensagens.length]);

  async function handleEnviar() {
    const t = texto.trim();
    if (!t || !session?.user) return;
    try {
      await enviar.mutateAsync({ alvo, texto: t, autorId: session.user.id });
      setTexto("");
    } catch {
      showToast(ERRO);
    }
  }

  return (
    <div className="flex min-h-0 flex-col border-border bg-surface-2 max-md:max-h-[300px] max-md:border-t md:border-l">
      <div className="shrink-0 px-4 pb-2.5 pt-3.5 text-xs font-bold uppercase tracking-[.04em] text-muted">{titulo}</div>
      <div ref={listaRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5">
        {isLoading ? null : mensagens.length === 0 ? (
          <div className="px-2.5 py-5 text-center text-xs text-muted">Nenhuma mensagem ainda. Comece a conversa abaixo.</div>
        ) : (
          mensagens.map((m) => (
            <div key={m.id} className="rounded-[9px] border border-border bg-surface px-[11px] py-[9px] text-[12.5px] leading-[1.45]">
              <div className="mb-[3px] flex justify-between gap-2">
                <span className="text-[11.5px] font-bold text-primary-bright">
                  {(m.autor_id && nomePorId.get(m.autor_id)) || "Usuário"}
                </span>
                <span className="whitespace-nowrap font-mono text-[10px] text-muted">{formatarHora(m.criado_em)}</span>
              </div>
              <div className="whitespace-pre-wrap break-words">{m.texto}</div>
            </div>
          ))
        )}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-border px-3.5 py-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleEnviar();
            }
          }}
          placeholder="Escrever uma mensagem..."
          className="max-h-[90px] min-h-[38px] flex-1 resize-none rounded-[7px] border border-border bg-surface px-2.5 py-2 text-[12.5px] text-ink focus:outline focus:outline-[1.5px] focus:outline-primary-bright"
        />
        <button
          type="button"
          onClick={handleEnviar}
          disabled={enviar.isPending || !texto.trim()}
          aria-label="Enviar mensagem"
          className="flex w-[38px] shrink-0 items-center justify-center rounded-[7px] bg-primary text-white hover:bg-[#642F81] disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function AnexoIcone({ tipo }: { tipo: string | null }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-primary-bright";
  if (tipo?.startsWith("audio")) return <Music className={cls} />;
  if (tipo?.startsWith("image")) return <ImageIcon className={cls} />;
  return <FileIcon className={cls} />;
}

function Anexos({ projetoId }: { projetoId: string }) {
  const { session } = useAuth();
  const { showToast } = useToast();
  const { data: anexos = [] } = useAnexos(projetoId);
  const upload = useUploadAnexos();
  const remover = useRemoverAnexo();

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !session?.user) return;
    try {
      await upload.mutateAsync({ projetoId, files: Array.from(files), autorId: session.user.id });
      showToast(files.length > 1 ? `${files.length} anexos adicionados` : "Anexo adicionado");
    } catch {
      showToast("Não foi possível enviar o arquivo — verifique a conexão com o Supabase");
    }
  }

  async function handleAbrir(a: Anexo) {
    try {
      await abrirAnexo(a);
    } catch {
      showToast("Não foi possível abrir o anexo");
    }
  }

  async function handleRemover(a: Anexo) {
    try {
      await remover.mutateAsync(a);
    } catch {
      showToast("Não foi possível remover o anexo");
    }
  }

  return (
    <>
      {anexos.length === 0 ? (
        <div className="mb-2.5 text-xs text-muted">Nenhum anexo ainda.</div>
      ) : (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {anexos.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-[7px] rounded-full border border-border bg-surface-2 py-1.5 pl-2.5 pr-3 text-xs"
            >
              <AnexoIcone tipo={a.tipo} />
              <button type="button" onClick={() => handleAbrir(a)} className="max-w-[220px] truncate hover:text-primary-bright">
                {a.nome}
              </button>
              <button
                type="button"
                onClick={() => handleRemover(a)}
                aria-label={`Remover ${a.nome}`}
                className="pl-0.5 text-sm leading-none text-muted hover:text-negative"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <label
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-dashed border-primary-bright px-[13px] py-2 text-[12.5px] font-semibold text-primary-bright hover:bg-primary-tint",
          upload.isPending && "pointer-events-none opacity-60",
        )}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {upload.isPending ? "Enviando..." : "Anexar arquivo, foto ou áudio"}
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
    </>
  );
}

function AtividadeRow({ a, onClick }: { a: AtividadeView; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-2 flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-[11px] text-left transition-colors hover:border-primary-bright"
    >
      <StatusBadge status={a.status} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{a.titulo}</span>
      <span className="whitespace-nowrap text-[11px] text-muted">
        {a.responsavelNome || "Sem responsável"}
        {a.prazo ? ` · ${formatarData(a.prazo)}` : ""}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Modal principal
// ---------------------------------------------------------------------------

interface ProjetoModalProps {
  projeto: ProjetoView | null;
  onOpenChange: (open: boolean) => void;
}

export function ProjetoModal({ projeto, onOpenChange }: ProjetoModalProps) {
  const [atividadeId, setAtividadeId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!projeto) setAtividadeId(null);
  }, [projeto]);

  return (
    <DialogPrimitive.Root open={!!projeto} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-[rgba(5,5,8,.65)] data-[state=open]:animate-in data-[state=open]:fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[61] flex h-[min(760px,calc(100vh-40px))] w-[calc(100%-24px)] max-w-[1040px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        >
          {projeto &&
            (atividadeId ? (
              <TelaAtividade
                projeto={projeto}
                atividadeId={atividadeId}
                onVoltar={() => setAtividadeId(null)}
              />
            ) : (
              <TelaProjeto projeto={projeto} onAbrirAtividade={setAtividadeId} onFechar={() => onOpenChange(false)} />
            ))}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Header({ voltarLabel, onVoltar }: { voltarLabel: string; onVoltar: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-[22px] py-4">
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex items-center gap-1 py-1 text-[12.5px] font-semibold text-muted hover:text-primary-bright"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {voltarLabel}
      </button>
      <DialogPrimitive.Close
        aria-label="Fechar"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-muted hover:bg-surface-2 hover:text-ink"
      >
        <X className="h-[17px] w-[17px]" />
      </DialogPrimitive.Close>
    </div>
  );
}

function TelaProjeto({
  projeto: p,
  onAbrirAtividade,
  onFechar,
}: {
  projeto: ProjetoView;
  onAbrirAtividade: (id: string) => void;
  onFechar: () => void;
}) {
  const { showToast } = useToast();
  const { data: perfis = [] } = usePerfis();
  const { data: atividades = [] } = useAtividadesProjeto(p.id);
  const update = useUpdateProjeto();
  const createAtividade = useCreateAtividade();

  // Estado local otimista: os campos refletem a edição na hora, mesmo antes do refetch.
  const [local, setLocal] = React.useState(p);
  React.useEffect(() => setLocal(p), [p]);

  async function salvar(patch: Parameters<typeof update.mutateAsync>[0]["patch"], otimista: Partial<ProjetoView>) {
    setLocal((s) => ({ ...s, ...otimista }));
    try {
      await update.mutateAsync({ id: p.id, patch });
    } catch {
      setLocal(p);
      showToast(ERRO);
    }
  }

  async function novaAtividade() {
    try {
      const nova = await createAtividade.mutateAsync({
        titulo: "Nova atividade",
        departamento: p.departamento,
        projeto_id: p.id,
        prioridade: "media",
      });
      showToast("Atividade criada");
      if (nova?.id) onAbrirAtividade(nova.id);
    } catch {
      showToast(ERRO);
    }
  }

  return (
    <>
      <Header voltarLabel={p.empresa !== "—" ? p.empresa : "Projetos"} onVoltar={onFechar} />
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[1fr_auto] md:grid-cols-[1fr_320px] md:grid-rows-1">
        <div className="min-w-0 overflow-y-auto px-[22px] py-5">
          <div className="mb-2 font-mono text-[11px] text-muted">
            {p.empresa !== "—" ? p.empresa : "Projeto interno"}
            {p.entregaNumero ? ` · Entrega ${String(p.entregaNumero).padStart(2, "0")}` : ""}
          </div>
          <DialogPrimitive.Title asChild>
            <div>
              <TitleInput value={local.nome} onSave={(nome) => salvar({ nome }, { nome })} />
            </div>
          </DialogPrimitive.Title>

          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
            <ResponsavelField
              value={local.responsavelId}
              perfis={perfis}
              onSave={(v) => salvar({ responsavel_id: v }, { responsavelId: v })}
            />
            <SelectField
              label="Status"
              value={local.status}
              options={comAtual(projetoStatusBase, local.status, statusExtra)}
              onSave={(v) => salvar({ status: v }, { status: v })}
            />
            <SelectField
              label="Prioridade"
              value={local.prioridade}
              options={comAtual(prioridadeBase, local.prioridade, prioridadeExtra)}
              onSave={(v) => salvar({ prioridade: v }, { prioridade: v })}
            />
            <DateField
              label="Início"
              value={local.prazoInicio}
              onSave={(v) => salvar({ prazo_inicio: v }, { prazoInicio: v })}
            />
            <DateField
              label="Conclusão"
              value={local.prazoFim}
              onSave={(v) => salvar({ prazo_fim: v }, { prazoFim: v, prazo: v })}
            />
          </div>

          <div className="mt-[22px]">
            <SectionTitle>Briefing</SectionTitle>
            <BriefingInput
              value={local.briefing}
              placeholder="Do que se trata esse projeto"
              onSave={(v) => salvar({ briefing: v || null }, { briefing: v || null })}
            />
          </div>

          <div className="mt-[22px]">
            <SectionTitle>Anexos</SectionTitle>
            <Anexos projetoId={p.id} />
          </div>

          <div className="mt-[22px]">
            <div className="mb-2.5 flex items-center justify-between">
              <SectionTitle className="mb-0">Atividades</SectionTitle>
              <button
                type="button"
                onClick={novaAtividade}
                disabled={createAtividade.isPending}
                className="inline-flex items-center gap-1.5 rounded-[7px] border border-border px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-60"
              >
                <Plus className="h-[13px] w-[13px]" />
                Atividade
              </button>
            </div>
            {atividades.length === 0 ? (
              <div className="mb-2 rounded-lg border border-dashed border-border py-3.5 text-center text-[12.5px] text-muted">
                Nenhuma atividade criada ainda.
              </div>
            ) : (
              atividades.map((a) => <AtividadeRow key={a.id} a={a} onClick={() => onAbrirAtividade(a.id)} />)
            )}
          </div>
        </div>

        <Chat titulo="Conversa deste projeto" alvo={{ projetoId: p.id }} perfis={perfis} />
      </div>
    </>
  );
}

function TelaAtividade({
  projeto: p,
  atividadeId,
  onVoltar,
}: {
  projeto: ProjetoView;
  atividadeId: string;
  onVoltar: () => void;
}) {
  const { showToast } = useToast();
  const { data: perfis = [] } = usePerfis();
  const { data: atividades = [], isLoading } = useAtividadesProjeto(p.id);
  const update = useUpdateAtividade();
  const original = atividades.find((a) => a.id === atividadeId) ?? null;

  const [local, setLocal] = React.useState<AtividadeView | null>(original);
  React.useEffect(() => setLocal(original), [original]);

  if (!local) {
    return (
      <>
        <Header voltarLabel={p.nome} onVoltar={onVoltar} />
        <div className="p-8 text-center text-sm text-muted">{isLoading ? "Carregando..." : "Atividade não encontrada."}</div>
      </>
    );
  }

  async function salvar(patch: Parameters<typeof update.mutateAsync>[0]["patch"], otimista: Partial<AtividadeView>) {
    setLocal((s) => (s ? { ...s, ...otimista } : s));
    try {
      await update.mutateAsync({ id: atividadeId, patch });
    } catch {
      setLocal(original);
      showToast(ERRO);
    }
  }

  return (
    <>
      <Header voltarLabel={p.nome} onVoltar={onVoltar} />
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[1fr_auto] md:grid-cols-[1fr_320px] md:grid-rows-1">
        <div className="min-w-0 overflow-y-auto px-[22px] py-5">
          <div className="mb-2 font-mono text-[11px] text-muted">
            Atividade de {p.empresa !== "—" ? `${p.empresa} — ` : ""}
            {p.nome}
          </div>
          <DialogPrimitive.Title asChild>
            <div>
              <TitleInput value={local.titulo} onSave={(titulo) => salvar({ titulo }, { titulo })} />
            </div>
          </DialogPrimitive.Title>

          <div className="mt-[22px]">
            <SectionTitle>Briefing</SectionTitle>
            <BriefingInput
              value={local.descricao}
              placeholder="O que precisa ser feito nessa atividade"
              onSave={(v) => salvar({ descricao: v || null }, { descricao: v || null })}
            />
            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
              <SelectField
                label="Status"
                value={local.status}
                options={comAtual(atividadeStatusBase, local.status, statusExtra)}
                onSave={(v) => salvar({ status: v }, { status: v })}
              />
              <SelectField
                label="Prioridade"
                value={local.prioridade}
                options={comAtual(prioridadeBase, local.prioridade, prioridadeExtra)}
                onSave={(v) => salvar({ prioridade: v }, { prioridade: v })}
              />
              <DateField label="Prazo" value={local.prazo} onSave={(v) => salvar({ prazo: v }, { prazo: v })} />
              <ResponsavelField
                value={local.responsavelId}
                perfis={perfis}
                onSave={(v) =>
                  salvar(
                    { responsavel_id: v },
                    { responsavelId: v, responsavelNome: perfis.find((x) => x.id === v)?.nome ?? null },
                  )
                }
              />
            </div>
          </div>
        </div>

        <Chat titulo="Conversa desta atividade" alvo={{ atividadeId }} perfis={perfis} />
      </div>
    </>
  );
}
