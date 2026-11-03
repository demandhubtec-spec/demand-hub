import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageOff, Instagram, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Gatilhos do Instagram: palavra-chave + post → resposta no comentário + mensagem no Direct com botão.
 * Os gatilhos ficam em ig_gatilhos (só gestor) e o robô (função bright-respondig-boter) lê os ativos.
 * A lista de posts vem do próprio robô (?api=midias), que tem o token da Meta.
 */

const FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bright-respondig-boter`;
const NOME_EXEMPLO = "Juliana";

type BotaoTipo = "nenhum" | "diagnostico" | "whatsapp" | "link";

interface MidiaInfo {
  id: string;
  link?: string;
  imagem?: string | null;
  legenda?: string;
}

interface Gatilho {
  id?: string;
  nome: string;
  ativo: boolean;
  tipo: "link" | "diagnostico";
  palavras: string[];
  midias: string[];
  midias_info: MidiaInfo[];
  respostas_publicas: string[];
  mensagem: string;
  botao_tipo: BotaoTipo;
  botao_texto: string;
  botao_url: string | null;
  whatsapp_texto: string | null;
  comentarios?: number;
  envios?: number;
  ultimo_em?: string | null;
}

const NOVO: Gatilho = {
  nome: "",
  ativo: true,
  tipo: "link",
  palavras: [],
  midias: [],
  midias_info: [],
  respostas_publicas: ["Te mandei no direct 📩", "Acabei de te chamar no direct!", "Olha seu direct 👀"],
  mensagem: "Oi, {nome}! Aqui está o que você pediu 👇",
  botao_tipo: "whatsapp",
  botao_texto: "Falar com a Ana",
  botao_url: null,
  whatsapp_texto: "Oi, vim do Instagram e quero o diagnóstico gratuito.",
};

const BOTOES: { tipo: BotaoTipo; label: string; ajuda: string }[] = [
  { tipo: "whatsapp", label: "WhatsApp da Ana", ajuda: "Abre o WhatsApp com a mensagem pronta. A Ana reconhece e conduz até o diagnóstico." },
  { tipo: "diagnostico", label: "Página do diagnóstico", ajuda: "Leva para demandhub.com.br/diagnostico, já marcando a origem deste gatilho." },
  { tipo: "link", label: "Link próprio", ajuda: "Material, checklist, planilha ou qualquer página." },
  { tipo: "nenhum", label: "Sem botão", ajuda: "Só a mensagem." },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const limparPalavra = (s: string) => semAcento(s.replace(/^#/, "")).replace(/[^a-z0-9 ]/g, "").trim();
const comNome = (t: string) => t.replace(/\{nome\}/g, NOME_EXEMPLO);

async function chamarRobo<T>(rota: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo no portal.");
  const r = await fetch(`${FUNCAO}?api=${rota}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
  return j as T;
}

function useGatilhos() {
  return useQuery({
    queryKey: ["ig_gatilhos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ig_gatilhos").select("*").order("criado_em");
      if (error) throw error;
      return (data ?? []) as Gatilho[];
    },
  });
}

function validar(g: Gatilho): string | null {
  if (!g.nome.trim()) return "Dê um nome para o gatilho.";
  if (!g.palavras.length) return "Coloque pelo menos uma palavra-chave.";
  if (g.palavras.length > 5) return "No máximo 5 palavras-chave.";
  if (!g.mensagem.trim()) return "Escreva a mensagem do Direct.";
  if (g.mensagem.length > 900) return "A mensagem do Direct passou de 900 caracteres.";
  if (g.botao_tipo !== "nenhum" && !g.botao_texto.trim()) return "Escreva o texto do botão.";
  if (g.botao_texto.length > 20) return "O texto do botão tem no máximo 20 caracteres.";
  if (g.botao_tipo === "link" && !/^https?:\/\//i.test(g.botao_url ?? "")) return "O link do botão precisa começar com https://";
  if (g.botao_tipo === "whatsapp" && !(g.whatsapp_texto ?? "").trim()) return "Escreva a mensagem pronta do WhatsApp.";
  return null;
}

/** Outro gatilho ativo com a mesma palavra no mesmo post (ou os dois em "qualquer post"). */
function conflito(g: Gatilho, todos: Gatilho[]): string | null {
  for (const o of todos) {
    if (o.id === g.id || !o.ativo) continue;
    const mesmaPalavra = o.palavras.some((p) => g.palavras.includes(p));
    if (!mesmaPalavra) continue;
    const ambosGerais = !o.midias.length && !g.midias.length;
    const mesmoPost = o.midias.some((m) => g.midias.includes(m));
    if (ambosGerais || mesmoPost) return o.nome;
  }
  return null;
}

export default function GatilhosInstagram() {
  const { data: gatilhos, isLoading, error } = useGatilhos();
  const [editando, setEditando] = React.useState<Gatilho | null>(null);
  const qc = useQueryClient();
  const { showToast } = useToast();

  const alternar = useMutation({
    mutationFn: async (g: Gatilho) => {
      const { error } = await supabase.from("ig_gatilhos").update({ ativo: !g.ativo }).eq("id", g.id!);
      if (error) throw error;
      await chamarRobo("gatilhos_recarregar", { method: "POST", body: "{}" }).catch(() => null);
      return !g.ativo;
    },
    onSuccess: (ativo) => {
      qc.invalidateQueries({ queryKey: ["ig_gatilhos"] });
      showToast(ativo ? "Gatilho ligado" : "Gatilho pausado");
    },
  });

  if (error) {
    return (
      <EmptyState>
        Não consegui ler os gatilhos. Se a migração 0018 ainda não rodou no Supabase, rode e recarregue a página.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[640px]">
          <h2 className="font-display text-[19px] font-semibold">Gatilhos</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            A pessoa comenta a palavra-chave no post e recebe a resposta no comentário e uma mensagem no Direct com um botão.
            O botão pode levar ao WhatsApp da Ana, à página do diagnóstico ou a um material.
          </p>
        </div>
        <Button onClick={() => setEditando({ ...NOVO })}>
          <Plus /> Novo gatilho
        </Button>
      </div>

      {isLoading ? (
        <EmptyState>Carregando gatilhos…</EmptyState>
      ) : !gatilhos?.length ? (
        <EmptyState>Nenhum gatilho ainda. Crie o primeiro e ligue a um post.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {gatilhos.map((g) => (
            <Card key={g.id} className={cn("p-5", !g.ativo && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold">{g.nome}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.palavras.map((p) => (
                      <span key={p} className="rounded-full border border-primary bg-primary-tint px-2.5 py-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-primary-bright">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
                <Switch checked={g.ativo} onCheckedChange={() => alternar.mutate(g)} aria-label={g.ativo ? "Pausar gatilho" : "Ligar gatilho"} />
              </div>

              <div className="mt-4 flex items-center gap-2">
                {g.midias.length ? (
                  <>
                    {g.midias_info.slice(0, 4).map((m) => (
                      <Miniatura key={m.id} midia={m} tamanho={38} />
                    ))}
                    {g.midias.length > 4 && <span className="text-[12px] text-muted">+{g.midias.length - 4}</span>}
                  </>
                ) : (
                  <span className="text-[12.5px] text-muted">Qualquer post recente</span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-[12.5px] text-muted">
                <span>
                  <b className="text-ink">{g.comentarios ?? 0}</b> comentários · <b className="text-ink">{g.envios ?? 0}</b> Directs enviados
                  {" · "}
                  {BOTOES.find((b) => b.tipo === g.botao_tipo)?.label}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setEditando({ ...g })}>
                  <Pencil /> Editar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[12px] leading-relaxed text-muted">
        Hoje a Meta libera uma mensagem no Direct por comentário. A conversa continua no WhatsApp com a Ana.
        Quando a conta tiver o acesso avançado da Meta, dá para fazer perguntas dentro do próprio Direct.
      </p>

      {editando && (
        <Editor
          inicial={editando}
          todos={gatilhos ?? []}
          onFechar={() => setEditando(null)}
          onSalvo={(msg) => {
            setEditando(null);
            qc.invalidateQueries({ queryKey: ["ig_gatilhos"] });
            showToast(msg);
          }}
        />
      )}
    </div>
  );
}

function Miniatura({ midia, tamanho }: { midia: MidiaInfo; tamanho?: number }) {
  const estilo = tamanho ? { width: tamanho, height: tamanho } : undefined;
  const cheio = tamanho ? "" : "aspect-square w-full";
  return midia.imagem ? (
    <img src={midia.imagem} alt={midia.legenda || "Post"} className={cn("block rounded-md border border-border object-cover", cheio)} style={estilo} loading="lazy" />
  ) : (
    <span className={cn("grid place-items-center rounded-md border border-border bg-surface-2 text-muted", cheio)} style={estilo}>
      <ImageOff className="h-4 w-4" />
    </span>
  );
}

function Editor({ inicial, todos, onFechar, onSalvo }: { inicial: Gatilho; todos: Gatilho[]; onFechar: () => void; onSalvo: (msg: string) => void }) {
  const [g, setG] = React.useState<Gatilho>(inicial);
  const [palavrasTxt, setPalavrasTxt] = React.useState(inicial.palavras.join(", ").toUpperCase());
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const set = <K extends keyof Gatilho>(k: K, v: Gatilho[K]) => setG((x) => ({ ...x, [k]: v }));

  const midias = useQuery({
    queryKey: ["ig_midias"],
    queryFn: () => chamarRobo<{ midias: (MidiaInfo & { data?: string })[] }>("midias"),
    staleTime: 5 * 60_000,
  });

  React.useEffect(() => {
    const palavras = [...new Set(palavrasTxt.split(/[,;\n]/).map(limparPalavra).filter(Boolean))];
    setG((x) => ({ ...x, palavras }));
  }, [palavrasTxt]);

  const alternarMidia = (m: MidiaInfo) => {
    setG((x) => {
      const tem = x.midias.includes(m.id);
      return {
        ...x,
        midias: tem ? x.midias.filter((id) => id !== m.id) : [...x.midias, m.id],
        midias_info: tem ? x.midias_info.filter((i) => i.id !== m.id) : [...x.midias_info, { id: m.id, link: m.link, imagem: m.imagem, legenda: m.legenda }],
      };
    });
  };

  const repetido = conflito(g, todos);

  async function salvar() {
    const msg = validar(g);
    if (msg) return setErro(msg);
    setErro(null);
    setSalvando(true);
    const linha = {
      nome: g.nome.trim(),
      ativo: g.ativo,
      tipo: g.tipo,
      palavras: g.palavras,
      midias: g.midias,
      midias_info: g.midias_info,
      respostas_publicas: g.respostas_publicas.map((r) => r.trim()).filter(Boolean).slice(0, 5),
      mensagem: g.mensagem.trim(),
      botao_tipo: g.botao_tipo,
      botao_texto: g.botao_tipo === "nenhum" ? "" : g.botao_texto.trim(),
      botao_url: g.botao_tipo === "link" ? (g.botao_url ?? "").trim() : g.botao_url,
      whatsapp_texto: g.botao_tipo === "whatsapp" ? (g.whatsapp_texto ?? "").trim() : g.whatsapp_texto,
    };
    const { error } = g.id ? await supabase.from("ig_gatilhos").update(linha).eq("id", g.id) : await supabase.from("ig_gatilhos").insert(linha);
    setSalvando(false);
    if (error) return setErro(`Não salvou: ${error.message}`);
    await chamarRobo("gatilhos_recarregar", { method: "POST", body: "{}" }).catch(() => null);
    onSalvo(g.id ? "Gatilho atualizado" : "Gatilho criado");
  }

  async function excluir() {
    if (!g.id || !window.confirm(`Excluir o gatilho "${g.nome}"? Os números dele somem junto.`)) return;
    const { error } = await supabase.from("ig_gatilhos").delete().eq("id", g.id);
    if (error) return setErro(`Não excluiu: ${error.message}`);
    onSalvo("Gatilho excluído");
  }

  const botaoAtual = BOTOES.find((b) => b.tipo === g.botao_tipo)!;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-[980px] overflow-y-auto">
        <DialogTitle>{g.id ? "Editar gatilho" : "Novo gatilho"}</DialogTitle>
        <DialogDescription>Comentou a palavra, recebe a resposta no post e a mensagem no Direct.</DialogDescription>

        <div className="grid gap-6 md:grid-cols-[1fr_300px]">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Nome do gatilho" ajuda="Só você vê. Ex.: Checklist da agenda">
                <Input value={g.nome} maxLength={80} onChange={(e) => set("nome", e.target.value)} />
              </Campo>
              <Campo rotulo="Palavra-chave" ajuda="Separe por vírgula. Ex.: AGENDA">
                <Input value={palavrasTxt} onChange={(e) => setPalavrasTxt(e.target.value.toUpperCase())} />
              </Campo>
            </div>
            {repetido && (
              <p className="rounded-lg border border-attention bg-attention-tint px-3 py-2 text-[12.5px] text-attention">
                O gatilho "{repetido}" já usa essa palavra no mesmo post. Só um deles vai responder.
              </p>
            )}

            <Campo rotulo="Em quais posts" ajuda="Sem nenhum marcado, vale para os 10 posts mais recentes.">
              <div className="rounded-lg border border-border p-3">
                {midias.isLoading ? (
                  <p className="text-[12.5px] text-muted">Buscando posts da conta…</p>
                ) : midias.error ? (
                  <p className="text-[12.5px] text-muted">Não consegui buscar os posts agora ({(midias.error as Error).message}).</p>
                ) : (
                  <div className="grid max-h-[220px] grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-6">
                    {midias.data?.midias.map((m) => {
                      const marcado = g.midias.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          title={m.legenda || "Post"}
                          onClick={() => alternarMidia(m)}
                          className={cn("relative rounded-md outline-none ring-offset-2 ring-offset-surface focus-visible:ring-2 focus-visible:ring-primary-bright", marcado && "ring-2 ring-primary")}
                        >
                          <Miniatura midia={m} />
                          {marcado && (
                            <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-white">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 text-[12px] text-muted">{g.midias.length ? `${g.midias.length} post(s) marcado(s)` : "Qualquer post recente"}</p>
              </div>
            </Campo>

            <Campo rotulo="Resposta no comentário" ajuda="Até 3 variações. O robô sorteia uma para não parecer automático.">
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Input
                    key={i}
                    value={g.respostas_publicas[i] ?? ""}
                    placeholder={i === 0 ? "Te mandei no direct 📩" : "Outra variação (opcional)"}
                    maxLength={200}
                    onChange={(e) => {
                      const r = [...g.respostas_publicas];
                      r[i] = e.target.value;
                      set("respostas_publicas", r);
                    }}
                  />
                ))}
              </div>
            </Campo>

            <Campo rotulo="Mensagem no Direct" ajuda="Use {nome} para o primeiro nome da pessoa.">
              <Textarea rows={4} value={g.mensagem} maxLength={900} onChange={(e) => set("mensagem", e.target.value)} />
            </Campo>

            <Campo rotulo="Botão da mensagem">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BOTOES.map((b) => (
                  <button
                    key={b.tipo}
                    type="button"
                    onClick={() => set("botao_tipo", b.tipo)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-[12.5px] font-semibold transition-colors",
                      g.botao_tipo === b.tipo ? "border-primary bg-primary-tint text-ink" : "border-border text-muted hover:border-primary-bright",
                    )}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-muted">{botaoAtual.ajuda}</p>
            </Campo>

            {g.botao_tipo !== "nenhum" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Texto do botão" ajuda={`${g.botao_texto.length}/20 caracteres`}>
                  <Input value={g.botao_texto} maxLength={20} onChange={(e) => set("botao_texto", e.target.value)} />
                </Campo>
                {g.botao_tipo === "link" && (
                  <Campo rotulo="Link" ajuda="Começando com https://">
                    <Input value={g.botao_url ?? ""} onChange={(e) => set("botao_url", e.target.value)} placeholder="https://" />
                  </Campo>
                )}
                {g.botao_tipo === "whatsapp" && (
                  <Campo rotulo="Mensagem pronta no WhatsApp" ajuda='Mantenha "quero o diagnóstico gratuito" para a Ana reconhecer.'>
                    <Input value={g.whatsapp_texto ?? ""} maxLength={300} onChange={(e) => set("whatsapp_texto", e.target.value)} />
                  </Campo>
                )}
              </div>
            )}

            {erro && <p className="text-[13px] font-medium text-negative">{erro}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              {g.id && g.tipo !== "diagnostico" ? (
                <Button variant="icon" size="sm" onClick={excluir}>
                  <Trash2 /> Excluir
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onFechar}>
                  Cancelar
                </Button>
                <Button onClick={salvar} disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar gatilho"}
                </Button>
              </div>
            </div>
          </div>

          <Previa g={g} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ rotulo, ajuda, children }: { rotulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block">{rotulo}</Label>
      {children}
      {ajuda && <p className="mt-1 text-[11.5px] text-muted">{ajuda}</p>}
    </div>
  );
}

/** Prévia de celular: o comentário, a resposta pública e a mensagem do Direct. */
function Previa({ g }: { g: Gatilho }) {
  const palavra = g.palavras[0]?.toUpperCase() || "PALAVRA";
  const resposta = g.respostas_publicas.find((r) => r.trim()) || "Te mandei no direct 📩";
  return (
    <div className="md:sticky md:top-0">
      <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Como fica no celular</div>
      <div className="rounded-[28px] border border-border bg-[#0b0b10] p-3 shadow-2xl">
        <div className="rounded-[20px] bg-black p-4 text-[12.5px] text-white">
          <div className="mb-3 flex items-center gap-2 text-[11px] text-white/60">
            <Instagram className="h-3.5 w-3.5" /> Comentários
          </div>
          <div className="space-y-2">
            <p>
              <b>{NOME_EXEMPLO.toLowerCase()}.clinica</b> {palavra}
            </p>
            <p className="pl-4 text-white/85">
              <b>demand_ia</b> {resposta}
            </p>
          </div>

          <div className="my-4 border-t border-white/10" />

          <div className="mb-3 flex items-center gap-2 text-[11px] text-white/60">
            <MessageCircle className="h-3.5 w-3.5" /> Direct
          </div>
          <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-[#262630] px-3.5 py-2.5 leading-relaxed">
            <p className="whitespace-pre-wrap">{comNome(g.mensagem) || "Sua mensagem aparece aqui."}</p>
            {g.botao_tipo !== "nenhum" && (
              <div className="mt-2.5 rounded-lg bg-white/10 px-3 py-2 text-center text-[12px] font-semibold text-[#4fa3ff]">
                {g.botao_texto || "Texto do botão"}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-muted">A prévia usa "{NOME_EXEMPLO}" no lugar de {"{nome}"}.</p>
    </div>
  );
}
