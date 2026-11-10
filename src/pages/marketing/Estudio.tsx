import * as React from "react";
import { Navigate } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Copy as CopyIcon, Download, LayoutGrid, List, Pencil, Play, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { chamarSdr } from "@/hooks/useProspeccao";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import {
  FORMATO_TEXTO,
  STATUS_TEXTO,
  hoje,
  useConfigEstudio,
  useDecidirPauta,
  useEnviarVideo,
  useTrocarFoto,
  useFonteAcoes,
  useFontes,
  usePautas,
  usePecas,
  useReagendar,
  useReferencias,
  useRodarAgente,
  useSalvarConfig,
  subirArquivoDaMarca,
  type Marca,
  type Pauta,
  type Peca,
} from "@/hooks/useEstudio";

/**
 * Marketing · Time de Marketing IA (antes "Estúdio"): social media no automático.
 * Agentes no servidor da Ana pesquisam, montam o calendário, escrevem e fazem a arte.
 * Aqui o Kelvin conversa com o time (Central), aprova copy e arte por etapa e acompanha o calendário.
 * Só o dono acessa.
 */
export default function Estudio() {
  const { isColaborador } = useAuth();
  // O chat da Central (HTML na mesma origem) grava as conversas com o cliente do banco do portal
  React.useEffect(() => {
    const w = window as unknown as { __demandSupabase?: typeof supabase; __demandChamarSdr?: typeof chamarSdr };
    w.__demandSupabase = supabase;
    // O chat da Central conversa com os agentes de verdade pelo servidor da Ana
    w.__demandChamarSdr = chamarSdr;
  }, []);
  if (isColaborador) return <Navigate to="/" replace />;
  return (
    <Tabs defaultValue="central">
      <TabsList>
        <TabsTrigger value="central">Central do time</TabsTrigger>
        <TabsTrigger value="aprovar">Aprovações</TabsTrigger>
        <TabsTrigger value="calendario">Calendário</TabsTrigger>
        <TabsTrigger value="materiais">Materiais</TabsTrigger>
        <TabsTrigger value="marca">Manual de marca</TabsTrigger>
        <TabsTrigger value="radar">Radar</TabsTrigger>
        <TabsTrigger value="config">Configurações</TabsTrigger>
      </TabsList>
      <TabsContent value="central">
        <iframe
          src="/central-estudio.html"
          title="Central do Time de Marketing IA"
          className="block w-full rounded-[14px] border-0"
          style={{ height: "calc(100vh - 140px)", minHeight: 640 }}
        />
      </TabsContent>
      <TabsContent value="aprovar">
        <Aprovacoes />
      </TabsContent>
      <TabsContent value="calendario">
        <Calendario />
      </TabsContent>
      <TabsContent value="materiais">
        <Materiais />
      </TabsContent>
      <TabsContent value="marca">
        <ManualDeMarca />
      </TabsContent>
      <TabsContent value="radar">
        <Radar />
      </TabsContent>
      <TabsContent value="config">
        <Configuracoes />
      </TabsContent>
    </Tabs>
  );
}

const diaBonito = (d: string) => {
  const [a, m, dd] = d.split("-").map(Number);
  return new Date(a, m - 1, dd).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

function Selo({ status }: { status: Pauta["status"] }) {
  const cor =
    status === "publicado" ? "bg-emerald-500/15 text-emerald-300"
    : status === "erro" ? "bg-red-500/15 text-red-300"
    : status === "revisar_copy" || status === "revisar_arte" || status === "aguardando_video" ? "bg-amber-500/15 text-amber-300"
    : status === "agendado" ? "bg-sky-500/15 text-sky-300"
    : "bg-surface-2 text-muted";
  return <span className={cn("rounded-full px-2 py-[2px] text-[11.5px] font-semibold", cor)}>{STATUS_TEXTO[status]}</span>;
}

/* ───────────── Aprovações ───────────── */

/** Etapas do quadro de aprovação, na ordem do fluxo. */
const ETAPAS: { chave: string; titulo: string; status: Pauta["status"][]; voce?: boolean }[] = [
  { chave: "pauta", titulo: "Pauta · Bia escrevendo", status: ["pauta"] },
  { chave: "copy", titulo: "Aprovar copy", status: ["revisar_copy"], voce: true },
  { chave: "arte_prod", titulo: "Arte em produção", status: ["copy_aprovada", "aguardando_video"] },
  { chave: "arte", titulo: "Aprovar arte", status: ["revisar_arte"], voce: true },
  { chave: "agendado", titulo: "Agendado", status: ["agendado", "publicando"] },
  { chave: "publicado", titulo: "Publicado", status: ["publicado"] },
  { chave: "erro", titulo: "Com erro", status: ["erro"] },
];

/** Abre a pauta num quadro com a copy, a arte e os botões de aprovar. */
function PautaDialog({ pauta, onClose }: { pauta: Pauta | null; onClose: () => void }) {
  const { data: pecas = {} } = usePecas(pauta ? [pauta.id] : []);
  return (
    <Dialog open={!!pauta} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-[860px] overflow-y-auto p-0">
        <DialogTitle className="sr-only">{pauta?.tema ?? "Pauta"}</DialogTitle>
        {pauta && <CartaoAprovacao pauta={pauta} copy={pecas[pauta.id]?.copy} arte={pecas[pauta.id]?.arte} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CartaoPauta({ p, onOpen }: { p: Pauta; onOpen: (p: Pauta) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(p)}
      className="w-full rounded-[10px] border border-border bg-surface p-3 text-left transition hover:border-primary hover:shadow-[0_0_18px_rgba(164,123,255,.18)]"
    >
      <div className="flex items-center gap-2 text-[11.5px] text-muted">
        <span>{diaBonito(p.dia)} · {p.horario}</span>
        <span className="ml-auto rounded-full bg-surface-2 px-2 py-[1px] font-semibold">{FORMATO_TEXTO[p.formato]}</span>
      </div>
      <div className="mt-1.5 line-clamp-3 text-[13px] font-semibold leading-snug text-ink">{p.tema}</div>
      {p.palavra_gatilho && <div className="mt-1 text-[11.5px] text-primary-bright">palavra {p.palavra_gatilho}</div>}
      {p.erro && <div className="mt-1 line-clamp-2 text-[11.5px] text-red-300">{p.erro}</div>}
    </button>
  );
}

function Aprovacoes() {
  const { data: pautas = [], isLoading } = usePautas();
  const [aberta, setAberta] = React.useState<Pauta | null>(null);
  if (isLoading) return <p className="p-6 text-[13px] text-muted">Carregando…</p>;
  const visiveis = pautas.filter((p) => p.status !== "descartado");
  if (!visiveis.length) return <EmptyState>O quadro está vazio. O Pauteiro monta os próximos dias sozinho; dá para rodar agora em Configurações.</EmptyState>;
  const colunas = ETAPAS.map((e) => ({ ...e, itens: visiveis.filter((p) => e.status.includes(p.status)) })).filter((c) => c.chave !== "erro" || c.itens.length);
  return (
    <>
      <p className="mb-3 text-[12.5px] text-muted">Cada post anda da esquerda para a direita. As colunas em amarelo esperam você: clique no card para ver e aprovar.</p>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {colunas.map((c) => (
          <div key={c.chave} className={cn("flex w-[260px] shrink-0 flex-col rounded-xl border bg-surface-2/60 p-2.5", c.voce ? "border-amber-400/40" : "border-border")}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className={cn("text-[12.5px] font-semibold", c.voce ? "text-amber-300" : "text-ink")}>{c.titulo}</span>
              <span className="ml-auto rounded-full bg-surface px-2 text-[11.5px] text-muted">{c.itens.length}</span>
            </div>
            <div className="flex max-h-[calc(100vh-260px)] flex-col gap-2 overflow-y-auto pr-0.5">
              {c.itens.length ? c.itens.map((p) => <CartaoPauta key={p.id} p={p} onOpen={setAberta} />) : <div className="px-1 py-4 text-center text-[12px] text-muted">Nada aqui</div>}
            </div>
          </div>
        ))}
      </div>
      <PautaDialog pauta={aberta} onClose={() => setAberta(null)} />
    </>
  );
}

function CartaoAprovacao({ pauta, copy, arte, onDone }: { pauta: Pauta; copy?: Peca; arte?: Peca; onDone?: () => void }) {
  const { showToast } = useToast();
  const decidir = useDecidirPauta();
  const enviarVideo = useEnviarVideo();
  const [ajuste, setAjuste] = React.useState<string | null>(null);
  const arquivo = React.useRef<HTMLInputElement>(null);
  const emArte = pauta.status === "revisar_arte";

  const agir = (decisao: "aprovar" | "ajuste" | "descartar", comentario?: string) =>
    decidir.mutate(
      { pauta, decisao, comentario },
      {
        onSuccess: () => {
          setAjuste(null);
          onDone?.();
          showToast(decisao === "aprovar" ? (emArte ? "Aprovado. Vai para a agenda." : "Copy aprovada. Agora vem a arte.") : decisao === "ajuste" ? "Pedido de ajuste enviado." : "Descartado.");
        },
        onError: (e) => showToast(`Não deu: ${(e as Error).message}`),
      },
    );

  const subir = (f?: File | null) => {
    if (!f) return;
    enviarVideo.mutate(
      { pauta, video: f, versao: (arte?.versao ?? 0) + 1 },
      { onSuccess: () => showToast("Vídeo enviado. Confere e aprova."), onError: (e) => showToast(`Falhou o envio: ${(e as Error).message}`) },
    );
  };

  return (
    <Card className="space-y-3 border-0 p-6">
      <div className="flex flex-wrap items-center gap-2 pr-6">
        <Selo status={pauta.status} />
        <span className="text-[12.5px] text-muted">
          {diaBonito(pauta.dia)} · {pauta.horario} · {FORMATO_TEXTO[pauta.formato]}
          {pauta.pilar ? ` · ${pauta.pilar}` : ""}
          {pauta.palavra_gatilho ? ` · palavra ${pauta.palavra_gatilho}` : ""}
        </span>
      </div>
      <h3 className="text-[16px] font-semibold text-ink">{pauta.tema}</h3>
      {pauta.gancho && <p className="text-[13px] text-muted">Gancho: {pauta.gancho}</p>}
      {pauta.erro && <p className="rounded-[9px] bg-red-500/10 p-2 text-[12.5px] text-red-300">{pauta.erro}</p>}

      {emArte && arte && <ArteVisual arte={arte} />}
      {emArte && arte && copy && <FotosDaArte pauta={pauta} copy={copy} arte={arte} />}
      {copy && <CopyTexto copy={copy} formato={pauta.formato} aberto={!emArte} />}

      {pauta.status === "aguardando_video" && (
        <div className="rounded-[10px] border border-dashed border-border p-3 text-[13px] text-muted">
          Reels: grava ou gera o vídeo seguindo o roteiro acima e sobe aqui (MP4 vertical, até 90s).
          <div className="mt-2">
            <input ref={arquivo} type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
            <Button size="sm" onClick={() => arquivo.current?.click()} disabled={enviarVideo.isPending}>
              <Upload /> {enviarVideo.isPending ? "Enviando…" : "Enviar vídeo"}
            </Button>
          </div>
        </div>
      )}

      {ajuste !== null ? (
        <div className="space-y-2">
          <Textarea value={ajuste} onChange={(e) => setAjuste(e.target.value)} placeholder="O que mudar? Ex.: gancho mais forte, menos texto no slide 3" rows={3} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => agir("ajuste", ajuste)} disabled={decidir.isPending || !ajuste.trim()}>
              Enviar ajuste
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAjuste(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(pauta.status === "revisar_copy" || emArte) && (
            <Button size="sm" onClick={() => agir("aprovar")} disabled={decidir.isPending}>
              <Check /> Aprovar {emArte ? "arte" : "copy"}
            </Button>
          )}
          {(pauta.status === "revisar_copy" || emArte || pauta.status === "erro") && (
            <Button size="sm" variant="outline" onClick={() => setAjuste("")}>
              <Pencil /> {pauta.status === "erro" ? "Refazer" : "Pedir ajuste"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => agir("descartar")} disabled={decidir.isPending}>
            <Trash2 /> Descartar
          </Button>
        </div>
      )}
    </Card>
  );
}

function ArteVisual({ arte }: { arte: Peca }) {
  const video = arte.arquivos.find((u) => /\.(mp4|mov)(\?|$)/i.test(u));
  if (video) return <video src={video} controls className="max-h-[520px] rounded-[10px]" />;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {arte.arquivos.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" className="shrink-0">
          <img src={u} alt={`Slide ${i + 1}`} className="h-[340px] w-auto rounded-[10px] border border-border" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

type PromptFoto = { indice: number; prompt: string; referencias?: string[] };

/**
 * Fotos da peça: o prompt de cada foto (instrução da Bia + referências) para copiar e gerar no ChatGPT,
 * e o botão para trocar pela foto feita lá. A Duda refaz só a arte, sem mexer no texto.
 */
function FotosDaArte({ pauta, copy, arte }: { pauta: Pauta; copy: Peca; arte: Peca }) {
  const { showToast } = useToast();
  const trocar = useTrocarFoto();
  const entrada = React.useRef<HTMLInputElement>(null);
  const [alvo, setAlvo] = React.useState<number | null>(null);
  const prompts = ((arte.conteudo as { prompts?: PromptFoto[] }).prompts ?? []).filter((p) => p?.prompt);
  if (!prompts.length) return null;
  const nome = pauta.formato === "reels" ? "Cena" : "Lâmina";
  const copiar = (t: string) =>
    navigator.clipboard.writeText(t).then(
      () => showToast("Prompt copiado. Cola no ChatGPT."),
      () => showToast("Não consegui copiar."),
    );
  const subir = (f?: File | null) => {
    if (!f || alvo === null) return;
    trocar.mutate(
      { pauta, copy, indice: alvo, arquivo: f },
      {
        onSuccess: () => showToast(`Foto da ${nome.toLowerCase()} ${alvo + 1} trocada. A Duda refaz a arte em alguns minutos.`),
        onError: (e) => showToast(`Não deu: ${(e as Error).message}`),
      },
    );
  };
  return (
    <details className="rounded-[10px] bg-surface-2 p-3 text-[13px] text-ink">
      <summary className="cursor-pointer font-semibold">Fotos ({prompts.length}): gerar no seu ChatGPT e trocar</summary>
      <p className="mt-2 text-[12px] text-muted">As fotos já saem geradas pelo modelo de imagem do ChatGPT. Se quiser outra, copie o prompt, gere no seu ChatGPT e suba aqui.</p>
      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="mt-2 space-y-2">
        {prompts.map((p) => (
          <div key={p.indice} className="rounded-[9px] border border-border p-2.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{nome} {p.indice + 1}</span>
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => copiar(p.prompt + (p.referencias?.length ? `\n\nReferências: ${p.referencias.join(" ")}` : ""))}>
                  <CopyIcon /> Copiar prompt
                </Button>
                <Button size="sm" variant="outline" disabled={trocar.isPending} onClick={() => { setAlvo(p.indice); entrada.current?.click(); }}>
                  <Upload /> {trocar.isPending && alvo === p.indice ? "Enviando…" : "Trocar foto"}
                </Button>
              </div>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{p.prompt}</p>
            {p.referencias?.length ? (
              <div className="mt-1 flex flex-wrap gap-2 text-[11.5px]">
                {p.referencias.map((r) => (
                  <a key={r} href={r} target="_blank" rel="noreferrer" className="text-primary-bright hover:underline">
                    referência
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

type Slide = { titulo?: string; texto?: string };
type Cena = { tempo?: string; texto_tela?: string; fala?: string; imagem?: string };

function CopyTexto({ copy, formato, aberto }: { copy: Peca; formato: Pauta["formato"]; aberto: boolean }) {
  const c = copy.conteudo as Record<string, unknown>;
  const slides = (c.slides as Slide[] | undefined) ?? [];
  const cenas = (c.cenas as Cena[] | undefined) ?? [];
  const hashtags = (c.hashtags as string[] | undefined) ?? [];
  return (
    <details open={aberto} className="rounded-[10px] bg-surface-2 p-3 text-[13px] text-ink">
      <summary className="cursor-pointer font-semibold">Copy (versão {copy.versao})</summary>
      <div className="mt-2 space-y-2">
        {formato === "carrossel" &&
          slides.map((s, i) => (
            <div key={i}>
              <span className="text-muted">Slide {i + 1}:</span> <b>{s.titulo}</b> {s.texto}
            </div>
          ))}
        {formato === "estatico" && (
          <div>
            <b>{String(c.titulo ?? "")}</b>
            {c.subtitulo ? <div className="text-muted">{String(c.subtitulo)}</div> : null}
          </div>
        )}
        {formato === "reels" && (
          <>
            {c.capa_titulo ? <div><span className="text-muted">Capa:</span> <b>{String(c.capa_titulo)}</b></div> : null}
            {cenas.map((s, i) => (
              <div key={i}>
                <span className="text-muted">{s.tempo ?? `Cena ${i + 1}`}:</span> <b>{s.texto_tela}</b> {s.fala ? `· fala: ${s.fala}` : ""} {s.imagem ? <span className="text-muted">· imagem: {s.imagem}</span> : null}
              </div>
            ))}
            {c.prompt_video ? <div className="text-muted">Prompt de vídeo: {String(c.prompt_video)}</div> : null}
          </>
        )}
        <div className="whitespace-pre-wrap border-t border-border pt-2">{String(c.legenda ?? "")}</div>
        {hashtags.length > 0 && <div className="text-muted">{hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</div>}
      </div>
    </details>
  );
}

/* ───────────── Calendário ───────────── */

const COR_STATUS: Partial<Record<Pauta["status"], string>> = {
  revisar_copy: "border-amber-400/50 bg-amber-500/10",
  revisar_arte: "border-amber-400/50 bg-amber-500/10",
  aguardando_video: "border-amber-400/50 bg-amber-500/10",
  agendado: "border-sky-400/40 bg-sky-500/10",
  publicado: "border-emerald-400/40 bg-emerald-500/10",
  erro: "border-red-400/50 bg-red-500/10",
};

function Calendario() {
  const [modo, setModo] = React.useState<"mes" | "lista">("mes");
  const [aberta, setAberta] = React.useState<Pauta | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <Button size="sm" variant={modo === "mes" ? "primary" : "outline"} onClick={() => setModo("mes")}>
          <LayoutGrid /> Mês
        </Button>
        <Button size="sm" variant={modo === "lista" ? "primary" : "outline"} onClick={() => setModo("lista")}>
          <List /> Lista
        </Button>
      </div>
      {modo === "mes" ? <CalendarioMes onOpen={setAberta} /> : <CalendarioLista onOpen={setAberta} />}
      <PautaDialog pauta={aberta} onClose={() => setAberta(null)} />
    </div>
  );
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function CalendarioMes({ onOpen }: { onOpen: (p: Pauta) => void }) {
  const { data: pautas = [], isLoading } = usePautas();
  const [ref, setRef] = React.useState(() => {
    const [a, m] = hoje().split("-").map(Number);
    return new Date(a, m - 1, 1);
  });
  if (isLoading) return <p className="p-6 text-[13px] text-muted">Carregando…</p>;
  const porDia: Record<string, Pauta[]> = {};
  for (const p of pautas) if (p.status !== "descartado") (porDia[p.dia] ??= []).push(p);
  const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1 - ref.getDay());
  const dias = Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
  const semanas = dias[35].getMonth() !== ref.getMonth() ? dias.slice(0, 35) : dias;
  const hj = hoje();
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))} aria-label="Mês anterior">
          <ChevronLeft />
        </Button>
        <h3 className="min-w-[160px] text-center text-[15px] font-semibold text-ink">{ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase())}</h3>
        <Button size="icon" variant="ghost" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))} aria-label="Próximo mês">
          <ChevronRight />
        </Button>
        <span className="ml-auto text-[12px] text-muted">Amarelo: espera você · Azul: agendado · Verde: publicado</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-[11.5px] text-muted">
        {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
          <div key={d} className="px-1 pb-1 font-semibold uppercase">{d}</div>
        ))}
        {semanas.map((d) => {
          const k = ymd(d);
          const fora = d.getMonth() !== ref.getMonth();
          return (
            <div key={k} className={cn("min-h-[104px] rounded-[9px] border border-border p-1.5", fora && "opacity-40", k === hj && "border-primary")}>
              <div className={cn("mb-1 text-[11.5px] font-semibold", k === hj ? "text-primary-bright" : "text-muted")}>{d.getDate()}</div>
              <div className="flex flex-col gap-1">
                {(porDia[k] ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpen(p)}
                    title={`${p.horario} · ${FORMATO_TEXTO[p.formato]} · ${STATUS_TEXTO[p.status]}\n${p.tema}`}
                    className={cn("rounded-[6px] border px-1.5 py-1 text-left text-[11px] leading-tight text-ink hover:brightness-125", COR_STATUS[p.status] ?? "border-border bg-surface-2")}
                  >
                    <span className="font-semibold">{p.horario}</span> {FORMATO_TEXTO[p.formato]}
                    <span className="mt-0.5 line-clamp-2 block text-muted">{p.tema}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CalendarioLista({ onOpen }: { onOpen: (p: Pauta) => void }) {
  const { data: pautas = [], isLoading } = usePautas();
  const reagendar = useReagendar();
  const decidir = useDecidirPauta();
  const { showToast } = useToast();
  const [editando, setEditando] = React.useState<{ id: string; dia: string; horario: string } | null>(null);
  const lista = pautas.filter((p) => p.status !== "descartado" && p.dia >= hoje());
  const passadas = pautas.filter((p) => p.status === "publicado" && p.dia < hoje()).slice(-7);

  if (isLoading) return <p className="p-6 text-[13px] text-muted">Carregando…</p>;
  if (!lista.length && !passadas.length)
    return <EmptyState>O calendário ainda está vazio. O Pauteiro monta os próximos dias sozinho; dá para rodar agora em Configurações.</EmptyState>;

  const linha = (p: Pauta) => (
    <div key={p.id} className="flex flex-wrap items-center gap-3 border-b border-border py-2 text-[13px] last:border-0">
      <span className="w-[110px] text-muted">{diaBonito(p.dia)} {p.horario}</span>
      <span className="w-[80px] text-muted">{FORMATO_TEXTO[p.formato]}</span>
      <button type="button" onClick={() => onOpen(p)} className="min-w-[200px] flex-1 text-left text-ink hover:text-primary-bright">{p.tema}</button>
      <Selo status={p.status} />
      {editando?.id === p.id ? (
        <span className="flex items-center gap-1">
          <Input type="date" value={editando.dia} min={hoje()} onChange={(e) => setEditando({ ...editando, dia: e.target.value })} className="h-8 w-[150px]" />
          <Input type="time" value={editando.horario} onChange={(e) => setEditando({ ...editando, horario: e.target.value })} className="h-8 w-[110px]" />
          <Button
            size="icon"
            variant="ghost"
            onClick={() =>
              reagendar.mutate(editando, { onSuccess: () => { setEditando(null); showToast("Reagendado."); }, onError: (e) => showToast((e as Error).message) })
            }
          >
            <Check />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setEditando(null)}>
            <X />
          </Button>
        </span>
      ) : (
        p.status !== "publicado" &&
        p.status !== "publicando" && (
          <span className="flex gap-1">
            <Button size="icon" variant="ghost" title="Mudar dia ou hora" onClick={() => setEditando({ id: p.id, dia: p.dia, horario: p.horario })}>
              <Pencil />
            </Button>
            <Button size="icon" variant="ghost" title="Descartar" onClick={() => decidir.mutate({ pauta: p, decisao: "descartar" })}>
              <Trash2 />
            </Button>
          </span>
        )
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-2 text-[15px] font-semibold text-ink">Próximos posts</h3>
        {lista.map(linha)}
      </Card>
      {passadas.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-2 text-[15px] font-semibold text-ink">Publicados recentes</h3>
          {passadas.map(linha)}
        </Card>
      )}
    </div>
  );
}

/* ───────────── Materiais ───────────── */

/** Tudo o que o time já produziu (copy e arte), para baixar, conferir e validar. */
function Materiais() {
  const { data: pautas = [], isLoading } = usePautas();
  const vivas = pautas.filter((p) => p.status !== "descartado" && p.status !== "pauta");
  const { data: pecas = {} } = usePecas(vivas.map((p) => p.id));
  const { showToast } = useToast();
  const [aberta, setAberta] = React.useState<Pauta | null>(null);
  if (isLoading) return <p className="p-6 text-[13px] text-muted">Carregando…</p>;
  if (!vivas.length) return <EmptyState>Ainda não tem material pronto. Assim que a Bia escrever e a Duda fizer as artes, tudo fica guardado aqui.</EmptyState>;
  const legendaDe = (c?: Peca) => {
    const x = (c?.conteudo ?? {}) as Record<string, unknown>;
    const tags = ((x.hashtags as string[] | undefined) ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
    return `${String(x.legenda ?? "")}${tags ? `\n\n${tags}` : ""}`;
  };
  return (
    <>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {vivas.map((p) => {
          const arte = pecas[p.id]?.arte;
          const copy = pecas[p.id]?.copy;
          const capa = arte?.arquivos.find((u) => !/\.(mp4|mov)(\?|$)/i.test(u));
          return (
            <Card key={p.id} className="flex flex-col overflow-hidden p-0">
              <button type="button" onClick={() => setAberta(p)} className="block aspect-[4/5] w-full bg-surface-2">
                {capa ? (
                  <img src={capa} alt={p.tema} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-[12.5px] text-muted">{arte ? "Vídeo" : "Arte ainda não feita"}</div>
                )}
              </button>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-center gap-2 text-[11.5px] text-muted">
                  <span>{diaBonito(p.dia)} · {FORMATO_TEXTO[p.formato]}</span>
                  <span className="ml-auto"><Selo status={p.status} /></span>
                </div>
                <div className="line-clamp-2 text-[13px] font-semibold text-ink">{p.tema}</div>
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {copy && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(legendaDe(copy)).then(() => showToast("Legenda copiada."), () => showToast("Não deu para copiar."))}
                    >
                      <CopyIcon /> Legenda
                    </Button>
                  )}
                  {(arte?.arquivos ?? []).map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" download className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-ink hover:border-primary">
                      <Download className="h-3.5 w-3.5" /> {arte!.arquivos.length > 1 ? `${i + 1}` : "Arte"}
                    </a>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <PautaDialog pauta={aberta} onClose={() => setAberta(null)} />
    </>
  );
}

/* ───────────── Radar ───────────── */

function ComoFuncionaRadar() {
  const { data: fontes = [] } = useFontes();
  const ativas = fontes.filter((f) => f.ativo);
  const semPermissao = ativas.filter((f) => /permiss/i.test(f.erro ?? "")).length;
  return (
    <Card className="space-y-2 p-5 text-[13px]">
      <h3 className="text-[15px] font-semibold text-ink">Como o Radar funciona</h3>
      <ol className="list-decimal space-y-1 pl-5 text-muted">
        <li>Uma vez por dia a Rita lê os últimos 25 posts de cada perfil de referência ({ativas.length} perfis ligados em Configurações).</li>
        <li>Cada post ganha uma nota: curtidas, comentários e views comparados ao tamanho da conta. Assim um perfil pequeno que bombou aparece na frente de um grande que foi mal.</li>
        <li>Os 10 melhores dos últimos 30 dias ganham uma explicação em uma frase: o tipo de gancho, o formato e o tema que fizeram funcionar.</li>
        <li>O Téo usa esses 10 como inspiração de formato e gancho no plano dos próximos posts (nunca copia o texto).</li>
      </ol>
      {semPermissao > 0 && (
        <p className="rounded-[9px] bg-amber-500/10 p-2 text-amber-200">
          Parado agora: a Meta não está deixando ler os perfis ({semPermissao} de {ativas.length}). Falta a permissão instagram_manage_insights no acesso do app DemandIA Direct. Assim que liberar, o Radar volta sozinho no próximo ciclo.
        </p>
      )}
    </Card>
  );
}

function Radar() {
  const { data: refs = [], isLoading } = useReferencias();
  if (isLoading) return <p className="p-6 text-[13px] text-muted">Carregando…</p>;
  if (!refs.length)
    return (
      <div className="space-y-4">
        <ComoFuncionaRadar />
        <EmptyState>O Radar ainda não trouxe referências. Ele roda uma vez por dia; dá para rodar agora em Configurações.</EmptyState>
      </div>
    );
  return (
    <div className="space-y-4">
    <ComoFuncionaRadar />
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold text-ink">O que bombou nos últimos 30 dias</h3>
      <p className="mb-3 text-[12.5px] text-muted">Nota = engajamento comparado ao tamanho da conta. O Pauteiro usa os melhores como inspiração.</p>
      {refs.map((r) => (
        <div key={r.id} className="border-b border-border py-2 text-[13px] last:border-0">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-ink">@{r.conta}</b>
            <span className="text-muted">{r.formato}</span>
            <span className="text-muted">♥ {r.curtidas ?? 0} · 💬 {r.comentarios ?? 0}{r.views ? ` · ▶ ${r.views}` : ""}</span>
            <span className="rounded-full bg-primary-tint px-2 text-[11.5px] font-semibold text-primary-bright">nota {Number(r.nota ?? 0).toFixed(1)}</span>
            {r.link && (
              <a href={r.link} target="_blank" rel="noreferrer" className="text-primary-bright underline">
                ver post
              </a>
            )}
          </div>
          {r.motivo ? <div className="mt-1 text-ink">{r.motivo}</div> : <div className="mt-1 line-clamp-2 text-muted">{r.legenda}</div>}
        </div>
      ))}
    </Card>
    </div>
  );
}

/* ───────────── Configurações ───────────── */

const AGENTES: { chave: "radar" | "pauteiro" | "redator" | "diretor" | "publicador"; nome: string; faz: string }[] = [
  { chave: "radar", nome: "Rita · Radar", faz: "Pesquisa os perfis de referência todo dia e estuda o nosso perfil toda semana." },
  { chave: "pauteiro", nome: "Téo · Plano do mês", faz: "Monta o mês inteiro, 1 post por dia. A partir do dia 24 já planeja o mês seguinte." },
  { chave: "redator", nome: "Bia · Copy", faz: "Escreve slides, roteiro e legenda com a palavra do Direct, no tom do manual." },
  { chave: "diretor", nome: "Duda · Arte", faz: "Faz as imagens do carrossel e do estático e o vídeo dos reels, no visual da marca." },
  { chave: "publicador", nome: "Lara · Publicação", faz: "Posta no horário e cria o gatilho do Direct." },
];

function Configuracoes() {
  const { data: config } = useConfigEstudio();
  const salvar = useSalvarConfig();
  const rodar = useRodarAgente();
  const { showToast } = useToast();
  const [horarios, setHorarios] = React.useState("");
  React.useEffect(() => {
    if (config) setHorarios(config.horarios.join(", "));
  }, [config]);

  if (!config) return <p className="p-6 text-[13px] text-muted">Carregando…</p>;

  const ok = () => showToast("Salvo.");
  const erro = (e: unknown) => showToast(`Não salvou: ${(e as Error).message}`);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Time de Marketing IA ligado</h3>
            <p className="text-[12.5px] text-muted">Desligado, nenhum agente roda e nada é publicado.</p>
          </div>
          <Switch checked={config.ativo} onCheckedChange={(v) => salvar.mutate({ ativo: v }, { onSuccess: ok, onError: erro })} />
        </div>
        {AGENTES.map((a) => (
          <div key={a.chave} className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <Switch
              checked={config.agentes?.[a.chave] !== false}
              onCheckedChange={(v) => salvar.mutate({ agentes: { ...config.agentes, [a.chave]: v } }, { onSuccess: ok, onError: erro })}
            />
            <div className="min-w-[220px] flex-1">
              <div className="text-[13.5px] font-semibold text-ink">{a.nome}</div>
              <div className="text-[12.5px] text-muted">{a.faz}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={rodar.isPending}
              onClick={() =>
                rodar.mutate(a.chave, {
                  onSuccess: (r) => showToast(`${a.nome}: ${JSON.stringify(r.resultado ?? {}).slice(0, 140)}`),
                  onError: (e) => showToast(`${a.nome} falhou: ${(e as Error).message}`),
                })
              }
            >
              <Play /> Rodar agora
            </Button>
          </div>
        ))}
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="text-[15px] font-semibold text-ink">Agenda</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Horários (um post por dia, alternando)</Label>
            <Input value={horarios} onChange={(e) => setHorarios(e.target.value)} placeholder="12:00, 19:30" />
          </div>
          <div>
            <Label>Começar a postar em</Label>
            <Input
              type="date"
              defaultValue={config.inicio_em ?? ""}
              onBlur={(e) => {
                const v = e.target.value || null;
                if (v !== config.inicio_em) salvar.mutate({ inicio_em: v }, { onSuccess: ok, onError: erro });
              }}
            />
            <p className="mt-1 text-[12px] text-muted">O Téo planeja o mês inteiro a partir daqui. Do dia 24 em diante, já monta o mês seguinte.</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            const lista = horarios.split(/[,\s]+/).map((h) => h.trim()).filter((h) => /^\d{1,2}:\d{2}$/.test(h)).map((h) => h.padStart(5, "0"));
            if (!lista.length) return showToast("Coloca pelo menos um horário, tipo 12:00.");
            salvar.mutate({ horarios: lista }, { onSuccess: ok, onError: erro });
          }}
        >
          Salvar horários
        </Button>
        <p className="text-[12.5px] text-muted">
          Mix da semana: {Object.entries(config.mix ?? {}).map(([f, n]) => `${n} ${FORMATO_TEXTO[f as keyof typeof FORMATO_TEXTO] ?? f}`).join(", ")}.
        </p>
      </Card>

      <Pilares />
      <Fontes />
    </div>
  );
}

function Pilares() {
  const { data: config } = useConfigEstudio();
  const salvar = useSalvarConfig();
  const { showToast } = useToast();
  const [texto, setTexto] = React.useState("");
  React.useEffect(() => {
    if (config) setTexto(config.pilares.map((p) => `${p.nome}: ${p.descricao}`).join("\n"));
  }, [config]);
  if (!config) return null;
  return (
    <Card className="space-y-2 p-5">
      <h3 className="text-[15px] font-semibold text-ink">Pilares de conteúdo</h3>
      <p className="text-[12.5px] text-muted">Um por linha, no formato “Nome: do que fala”. O Pauteiro reveza entre eles.</p>
      <Textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <Button
        size="sm"
        onClick={() => {
          const pilares = texto
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
              const i = l.indexOf(":");
              return i > 0 ? { nome: l.slice(0, i).trim(), descricao: l.slice(i + 1).trim() } : { nome: l, descricao: "" };
            });
          if (!pilares.length) return showToast("Coloca pelo menos um pilar.");
          salvar.mutate({ pilares }, { onSuccess: () => showToast("Pilares salvos."), onError: (e) => showToast((e as Error).message) });
        }}
      >
        Salvar pilares
      </Button>
    </Card>
  );
}

function Fontes() {
  const { data: fontes = [] } = useFontes();
  const { verificar, alternar, remover } = useFonteAcoes();
  const { showToast } = useToast();
  const [novo, setNovo] = React.useState("");
  const adicionar = () => {
    const u = novo.trim().replace(/^@/, "").replace(/.*instagram\.com\//, "").replace(/\/.*/, "").toLowerCase();
    if (!u) return;
    verificar.mutate(u, {
      onSuccess: (r) => {
        if (r.ok) {
          setNovo("");
          showToast(`@${r.username} adicionado${r.seguidores ? ` (${r.seguidores.toLocaleString("pt-BR")} seguidores)` : ""}.`);
        } else showToast(`Não deu para ler @${u}: ${r.erro ?? "conta pessoal ou privada"}`);
      },
      onError: (e) => showToast(`Não deu para ler @${u}: ${(e as Error).message}`),
    });
  };
  return (
    <Card className="space-y-3 p-5">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">Perfis de referência</h3>
        <p className="text-[12.5px] text-muted">O Radar lê só contas comerciais ou de criador. Conta pessoal ou privada não aparece.</p>
      </div>
      <div className="flex gap-2">
        <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="@perfil ou link do Instagram" onKeyDown={(e) => e.key === "Enter" && adicionar()} />
        <Button onClick={adicionar} disabled={verificar.isPending}>
          {verificar.isPending ? "Verificando…" : "Adicionar"}
        </Button>
      </div>
      {fontes.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-[13px]">
          <Switch checked={f.ativo} onCheckedChange={(v) => alternar.mutate({ id: f.id, ativo: v })} />
          <a href={`https://instagram.com/${f.valor}`} target="_blank" rel="noreferrer" className="font-semibold text-ink">
            @{f.valor}
          </a>
          <span className="text-muted">{f.nome ?? ""}</span>
          <span className="text-muted">{f.seguidores ? `${f.seguidores.toLocaleString("pt-BR")} seguidores` : f.verificado_em ? "" : "ainda não lido"}</span>
          {f.erro && <span className="text-red-300">{f.erro}</span>}
          <Button size="icon" variant="ghost" className="ml-auto" title="Remover" onClick={() => remover.mutate(f.id, { onError: (e) => showToast((e as Error).message) })}>
            <Trash2 />
          </Button>
        </div>
      ))}
    </Card>
  );
}

/* ───────────── Manual de marca ───────────── */

const CORES: { chave: keyof NonNullable<Marca["cores"]>; nome: string; padrao: string }[] = [
  { chave: "fundo", nome: "Fundo", padrao: "#0d0a1a" },
  { chave: "fundo2", nome: "Brilho do fundo", padrao: "#1e1145" },
  { chave: "destaque", nome: "Destaque", padrao: "#8b5cf6" },
  { chave: "destaque2", nome: "Destaque claro", padrao: "#c4b5fd" },
  { chave: "texto", nome: "Texto", padrao: "#ffffff" },
];

function proporcaoDaImagem(arquivo: File): Promise<number> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img.naturalHeight ? img.naturalWidth / img.naturalHeight : 3);
    img.onerror = () => ok(3);
    img.src = URL.createObjectURL(arquivo);
  });
}

function ManualDeMarca() {
  const { data: config } = useConfigEstudio();
  const salvar = useSalvarConfig();
  const rodar = useRodarAgente();
  const { showToast } = useToast();
  const [m, setM] = React.useState<Marca>({});
  const [subindo, setSubindo] = React.useState<"logo" | "manual" | "trilha" | null>(null);
  React.useEffect(() => {
    if (config) setM(config.marca ?? {});
  }, [config]);
  if (!config) return <p className="p-6 text-[13px] text-muted">Carregando…</p>;

  const campo = (k: keyof Marca, v: string) => setM((x) => ({ ...x, [k]: v }));
  const gravar = (nova: Marca, aviso = "Manual salvo. Vale para as próximas copies e artes.") =>
    salvar.mutate({ marca: nova }, { onSuccess: () => showToast(aviso), onError: (e) => showToast(`Não salvou: ${(e as Error).message}`) });
  const subir = async (arquivo: File | undefined, tipo: "logo" | "manual") => {
    if (!arquivo) return;
    setSubindo(tipo);
    try {
      const url = await subirArquivoDaMarca(arquivo, tipo);
      const nova: Marca = tipo === "logo" ? { ...m, logo_url: url, logo_proporcao: await proporcaoDaImagem(arquivo) } : { ...m, manual_url: url };
      setM(nova);
      gravar(nova, tipo === "logo" ? "Logo salva. Entra nas próximas artes." : "Manual salvo.");
    } catch (e) {
      showToast(`Não subiu: ${(e as Error).message}`);
    } finally {
      setSubindo(null);
    }
  };
  const subirTrilhas = async (arquivos: FileList | null) => {
    const lista = Array.from(arquivos ?? []);
    if (!lista.length) return;
    setSubindo("trilha");
    try {
      const links: string[] = [];
      for (const a of lista) links.push(await subirArquivoDaMarca(a, "trilha"));
      const nova: Marca = { ...m, trilhas: [...(m.trilhas ?? []), ...links] };
      setM(nova);
      gravar(nova, links.length > 1 ? `${links.length} trilhas salvas. Entram nos próximos reels.` : "Trilha salva. Entra nos próximos reels.");
    } catch (e) {
      showToast(`Não subiu: ${(e as Error).message}`);
    } finally {
      setSubindo(null);
    }
  };
  const tirarTrilha = (url: string) => {
    const nova: Marca = { ...m, trilhas: (m.trilhas ?? []).filter((t) => t !== url) };
    setM(nova);
    gravar(nova, "Trilha removida.");
  };
  const perfil = config.perfil_padrao ?? {};

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Manual de marca</h3>
          <p className="text-[12.5px] text-muted">Tudo aqui entra nas copies (Bia), nas artes e nos vídeos (Duda). Mudou, vale a partir da próxima peça.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Logo (PNG ou SVG, de preferência fundo transparente)</Label>
            <div className="flex items-center gap-3">
              {m.logo_url ? <img src={m.logo_url} alt="Logo" className="h-12 max-w-[200px] rounded-md bg-[#0d0a1a] object-contain p-1" /> : <span className="text-[12.5px] text-muted">Sem logo ainda</span>}
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[12.5px] text-ink hover:bg-surface-2">
                <Upload className="h-3.5 w-3.5" /> {subindo === "logo" ? "Subindo…" : "Subir logo"}
                <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden" onChange={(e) => subir(e.target.files?.[0], "logo")} />
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Manual completo (PDF)</Label>
            <div className="flex items-center gap-3">
              {m.manual_url ? (
                <a href={m.manual_url} target="_blank" rel="noreferrer" className="text-[12.5px] text-primary underline">Abrir manual</a>
              ) : (
                <span className="text-[12.5px] text-muted">Sem PDF ainda</span>
              )}
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[12.5px] text-ink hover:bg-surface-2">
                <Upload className="h-3.5 w-3.5" /> {subindo === "manual" ? "Subindo…" : "Subir PDF"}
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => subir(e.target.files?.[0], "manual")} />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Trilhas do reels (MP3, instrumental)</Label>
          <p className="text-[12.5px] text-muted">Cada reels sorteia uma destas e toca baixinho por baixo da narração. Pode gerar no Kairogen (Estúdio de Áudio, aba Trilha) e subir aqui.</p>
          <div className="space-y-2">
            {(m.trilhas ?? []).map((t, i) => (
              <div key={t} className="flex items-center gap-3">
                <span className="w-16 text-[12.5px] text-muted">Trilha {i + 1}</span>
                <audio src={t} controls preload="none" className="h-8 max-w-[320px] flex-1" />
                <button type="button" onClick={() => tirarTrilha(t)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Remover trilha">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {!(m.trilhas ?? []).length ? <span className="text-[12.5px] text-muted">Sem trilha ainda. Os reels saem só com a narração.</span> : null}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[12.5px] text-ink hover:bg-surface-2">
            <Upload className="h-3.5 w-3.5" /> {subindo === "trilha" ? "Subindo…" : "Subir trilhas"}
            <input type="file" multiple accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,.mp3,.wav,.m4a" className="hidden" onChange={(e) => subirTrilhas(e.target.files)} />
          </label>
        </div>

        <div>
          <Label>Cores</Label>
          <div className="mt-2 flex flex-wrap gap-4">
            {CORES.map((c) => {
              const v = m.cores?.[c.chave] || c.padrao;
              return (
                <label key={c.chave} className="flex items-center gap-2 text-[12.5px] text-ink">
                  <input type="color" value={v} onChange={(e) => setM((x) => ({ ...x, cores: { ...x.cores, [c.chave]: e.target.value } }))} className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" />
                  <span>{c.nome}<br /><span className="text-muted">{v}</span></span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Nome da marca</Label>
            <Input value={m.nome ?? ""} onChange={(e) => campo("nome", e.target.value)} placeholder="Demand AI" />
          </div>
          <div>
            <Label>Fonte dos títulos (Google Fonts)</Label>
            <Input value={m.fontes?.titulo ?? ""} onChange={(e) => setM((x) => ({ ...x, fontes: { ...x.fontes, titulo: e.target.value } }))} placeholder="Anton" />
          </div>
          <div>
            <Label>Fonte dos textos (Google Fonts)</Label>
            <Input value={m.fontes?.texto ?? ""} onChange={(e) => setM((x) => ({ ...x, fontes: { ...x.fontes, texto: e.target.value } }))} placeholder="Inter" />
          </div>
        </div>
        <div>
          <Label>Tom de voz</Label>
          <Textarea rows={3} value={m.tom ?? ""} onChange={(e) => campo("tom", e.target.value)} placeholder="Como a marca fala: com quem, de que jeito, o que vende." />
        </div>
        <div>
          <Label>Regras (o que sempre fazer e o que nunca fazer)</Label>
          <Textarea rows={4} value={m.regras ?? ""} onChange={(e) => campo("regras", e.target.value)} placeholder="Ex.: nome sempre escrito assim, palavras proibidas, uso da logo, chamadas." />
        </div>
        <div>
          <Label>Assinatura (aparece na última lâmina e no fim dos vídeos)</Label>
          <Input value={m.assinatura ?? ""} onChange={(e) => campo("assinatura", e.target.value)} placeholder="A DemandIA trabalha. Você fatura." />
        </div>
        <Button size="sm" disabled={salvar.isPending} onClick={() => gravar(m)}>
          <Check /> Salvar manual
        </Button>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Padrão do nosso perfil (@demand_ia)</h3>
            <p className="text-[12.5px] text-muted">
              A Rita estuda os nossos posts toda semana (texto e imagem) e o time segue essa linha.
              {config.ultimo_perfil ? ` Último estudo: ${config.ultimo_perfil.split("-").reverse().join("/")}.` : " Ainda não estudou."}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={rodar.isPending}
            onClick={() => rodar.mutate("perfil", { onSuccess: () => showToast("Perfil estudado de novo."), onError: (e) => showToast(`Não deu: ${(e as Error).message}`) })}
          >
            <Play /> {rodar.isPending ? "Estudando…" : "Estudar agora"}
          </Button>
        </div>
        {perfil.resumo ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[10px] border border-border p-3">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">Conteúdo</div>
              <p className="whitespace-pre-wrap text-[13px] text-ink">{perfil.resumo}</p>
            </div>
            <div className="rounded-[10px] border border-border p-3">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">Visual</div>
              <p className="whitespace-pre-wrap text-[13px] text-ink">{perfil.visual}</p>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
