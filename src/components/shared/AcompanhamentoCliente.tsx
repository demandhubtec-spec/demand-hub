import * as React from "react";
import { Check, Copy, ExternalLink, Link2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import {
  linkAcompanhamento,
  useComentariosCliente,
  useCompartilhamento,
  useCriarLink,
  useDesligarLink,
  useMarcarLidos,
  useResponderCliente,
} from "@/hooks/useAcompanhamento";
import type { ProjetoView } from "@/hooks/useProjetos";

const ERRO = "Não foi possível salvar. Confira se a migração 0023 já rodou no banco.";

function quando(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Botões da ficha do cliente: link de acompanhamento e comentários que o cliente deixou. */
export function AcompanhamentoCliente({
  clienteId,
  clienteNome,
  projetos,
}: {
  clienteId: string;
  clienteNome: string;
  projetos: ProjetoView[];
}) {
  const [linkAberto, setLinkAberto] = React.useState(false);
  const [comentAberto, setComentAberto] = React.useState(false);
  const { data: comentarios = [] } = useComentariosCliente(clienteId);
  const naoLidos = comentarios.filter((c) => c.autor_tipo === "cliente" && !c.lido).length;

  return (
    <>
      <Button variant="ghost" onClick={() => setComentAberto(true)}>
        <MessageSquare className="h-4 w-4" />
        Comentários do cliente
        {naoLidos > 0 && (
          <span className="ml-1 rounded-full bg-primary px-1.5 py-px tabular-nums text-[12px] font-bold text-white">{naoLidos}</span>
        )}
      </Button>
      <Button variant="ghost" onClick={() => setLinkAberto(true)}>
        <Link2 className="h-4 w-4" />
        Link do cliente
      </Button>

      <LinkDialog open={linkAberto} onOpenChange={setLinkAberto} clienteId={clienteId} clienteNome={clienteNome} />
      <ComentariosDialog
        open={comentAberto}
        onOpenChange={setComentAberto}
        clienteId={clienteId}
        projetos={projetos}
      />
    </>
  );
}

function LinkDialog({
  open,
  onOpenChange,
  clienteId,
  clienteNome,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  clienteNome: string;
}) {
  const { session } = useAuth();
  const { showToast } = useToast();
  const { data: link, isLoading } = useCompartilhamento(clienteId);
  const criar = useCriarLink();
  const desligar = useDesligarLink();
  const [copiado, setCopiado] = React.useState(false);
  const url = link ? linkAcompanhamento(link.token) : "";

  async function gerar() {
    try {
      await criar.mutateAsync({ clienteId, clienteNome, autorId: session?.user.id });
      showToast("Link criado");
    } catch {
      showToast(ERRO);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      showToast("Não deu para copiar. Selecione o link e copie à mão.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogTitle>Link de acompanhamento</DialogTitle>
        <DialogDescription>
          O cliente abre o link sem precisar de senha e acompanha as entregas, as fases e os prazos, atualizados a cada 30
          segundos. Ele também pode comentar. Valores do contrato não aparecem.
        </DialogDescription>

        {isLoading ? (
          <div className="text-[14px] text-muted">Carregando…</div>
        ) : link ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-[8px] border border-border bg-surface-2 px-3 py-2 tabular-nums text-[12px] text-ink"
              />
              <Button variant="primary" onClick={copiar}>
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => window.open(url, "_blank", "noopener")}>
                <ExternalLink className="h-4 w-4" />
                Ver como o cliente
              </Button>
              <Button variant="ghost" onClick={gerar} disabled={criar.isPending}>
                Gerar link novo
              </Button>
              <Button
                variant="ghost"
                disabled={desligar.isPending}
                onClick={async () => {
                  try {
                    await desligar.mutateAsync({ id: link.id, clienteId });
                    showToast("Link desligado. Quem tiver o endereço antigo perde o acesso.");
                  } catch {
                    showToast(ERRO);
                  }
                }}
              >
                Desligar link
              </Button>
            </div>
            <p className="text-[12px] text-muted">
              "Gerar link novo" desliga o anterior. Use se o link tiver sido repassado para quem não deveria.
            </p>
          </div>
        ) : (
          <Button variant="primary" onClick={gerar} disabled={criar.isPending}>
            <Link2 className="h-4 w-4" />
            Criar link para {clienteNome}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ComentariosDialog({
  open,
  onOpenChange,
  clienteId,
  projetos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  projetos: ProjetoView[];
}) {
  const { session, perfil } = useAuth();
  const { showToast } = useToast();
  const { data: comentarios = [] } = useComentariosCliente(clienteId);
  const responder = useResponderCliente();
  const marcar = useMarcarLidos();
  const [alvo, setAlvo] = React.useState<string>("geral");
  const [texto, setTexto] = React.useState("");
  const listaRef = React.useRef<HTMLDivElement>(null);

  const nomeEntrega = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projetos)
      m.set(p.id, p.entregaNumero ? `Entrega ${String(p.entregaNumero).padStart(2, "0")} · ${p.nome}` : p.nome);
    return m;
  }, [projetos]);

  const naoLidos = comentarios.some((c) => c.autor_tipo === "cliente" && !c.lido);
  React.useEffect(() => {
    if (open && naoLidos) marcar.mutate({ clienteId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, naoLidos, clienteId]);

  React.useEffect(() => {
    if (open) setTimeout(() => listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight }), 30);
  }, [open, comentarios.length]);

  async function enviar() {
    const t = texto.trim();
    if (!t || !session?.user) return;
    try {
      await responder.mutateAsync({
        clienteId,
        projetoId: alvo === "geral" ? null : alvo,
        texto: t,
        autorId: session.user.id,
        autorNome: "Equipe Demand",
      });
      setTexto("");
    } catch {
      showToast(ERRO);
    }
  }

  const entregasOrdenadas = [...projetos]
    .filter((p) => p.entregaNumero)
    .sort((a, b) => (a.entregaNumero ?? 0) - (b.entregaNumero ?? 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-[600px] flex-col">
        <DialogTitle>Comentários do cliente</DialogTitle>
        <DialogDescription>
          O que o cliente escreveu pelo link de acompanhamento. A resposta aparece para ele como "Equipe Demand"
          {perfil?.nome ? ` (enviada por ${perfil.nome})` : ""}.
        </DialogDescription>

        <div ref={listaRef} className="-mx-1 flex min-h-[120px] flex-1 flex-col gap-2.5 overflow-y-auto px-1">
          {comentarios.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-muted">Nenhum comentário ainda.</div>
          ) : (
            comentarios.map((c) => (
              <div
                key={c.id}
                className={
                  c.autor_tipo === "cliente"
                    ? "rounded-[8px] border border-border bg-surface-2 px-3 py-2.5 text-[13px]"
                    : "ml-8 rounded-[8px] border border-primary/30 bg-primary-tint px-3 py-2.5 text-[13px]"
                }
              >
                <div className="mb-1 flex justify-between gap-2">
                  <span className="text-[12px] font-bold text-primary-bright">{c.autor_nome}</span>
                  <span className="tabular-nums text-[12px] text-muted">{quando(c.criado_em)}</span>
                </div>
                <div className="mb-1 tabular-nums text-[12px] text-muted">
                  {c.projeto_id ? nomeEntrega.get(c.projeto_id) ?? "Entrega" : "Geral"}
                </div>
                <div className="whitespace-pre-wrap break-words">{c.texto}</div>
                {c.autor_tipo === "cliente" && (
                  <button
                    type="button"
                    onClick={() => setAlvo(c.projeto_id ?? "geral")}
                    className="mt-1.5 text-[12px] font-semibold text-primary-bright hover:underline"
                  >
                    Responder aqui
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <select
            value={alvo}
            onChange={(e) => setAlvo(e.target.value)}
            className="w-full rounded-[8px] border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-ink"
          >
            <option value="geral">Geral</option>
            {entregasOrdenadas.map((p) => (
              <option key={p.id} value={p.id}>
                {nomeEntrega.get(p.id)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Responder ao cliente..."
              className="max-h-[110px] min-h-[42px] flex-1 resize-none rounded-[8px] border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-ink"
            />
            <button
              type="button"
              onClick={enviar}
              disabled={responder.isPending || !texto.trim()}
              aria-label="Enviar resposta"
              className="flex w-[42px] shrink-0 items-center justify-center rounded-[8px] bg-primary text-white hover:brightness-110 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
