import * as React from "react";
import { Bot, MessageCircle, Mic, ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCanal, useContatos } from "@/hooks/useCrm";
import { cn } from "@/lib/utils";
import { fmtData } from "../prospeccao/shared";
import { Compositor } from "./Compositor";

/**
 * "Você e a Ana": a Ana pede orientação sobre um lead, você orienta (texto, áudio ou foto) e ela
 * aplica na conversa. Também dá para orientar sem ela pedir, sobre um lead ou em geral.
 * O mesmo canal funciona pelo WhatsApp: o que você responde para a Ana lá aparece aqui.
 */
export function CanalTab({ abrirConversa }: { abrirConversa: (id: string) => void }) {
  const { data: msgs = [], isLoading, isError } = useCanal();
  const { contatos } = useContatos();
  const [sobre, setSobre] = React.useState<string>("");
  const fim = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => fim.current?.scrollIntoView({ block: "end" }), [msgs.length]);

  const nome = (id: string | null) => (id ? contatos.find((c) => c.id === id)?.nomeExibicao ?? "contato" : null);
  const pendentes = msgs.filter((m) => m.status === "pendente");

  // Respondendo um pedido: já deixa o lead selecionado
  React.useEffect(() => {
    if (!sobre && pendentes.length) setSobre(pendentes[pendentes.length - 1].lead_id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendentes.length]);

  if (isError) return <EmptyState>Falta rodar o SQL do canal com a Ana no Supabase para liberar esta aba.</EmptyState>;

  return (
    <Card className="flex h-[680px] flex-col overflow-hidden">
      <div className="border-b border-border p-3 text-[12.5px] text-muted">
        A Ana te chama aqui quando precisar de direcionamento. Você também pode orientar sobre qualquer conversa, por texto, áudio ou foto.
        O que você responder para ela no WhatsApp também aparece aqui.
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-surface-2/40 p-3">
        {isLoading && <div className="text-[12.5px] text-muted">Carregando…</div>}
        {!isLoading && msgs.length === 0 && <div className="text-[12.5px] text-muted">Nada por aqui ainda.</div>}
        {msgs.map((m) => {
          const ana = m.autor === "ana";
          const lead = nome(m.lead_id);
          return (
            <div key={m.id} className={cn("flex", ana ? "justify-start" : "justify-end")}>
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap rounded-[10px] px-3 py-2 text-[13px]",
                  ana ? "border border-border bg-surface" : "bg-primary/15",
                  m.status === "pendente" && "border-attention/60 ring-1 ring-attention/40",
                )}
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold">
                  {ana ? (
                    <span className="inline-flex items-center gap-1 text-primary-bright">
                      <Bot className="h-3 w-3" /> Ana
                    </span>
                  ) : (
                    <span className="text-ink">Você{m.origem === "whatsapp" ? " · pelo WhatsApp" : ""}</span>
                  )}
                  {m.tipo === "audio" && <Mic className="h-3 w-3 text-muted" />}
                  {m.tipo === "imagem" && <ImageIcon className="h-3 w-3 text-muted" />}
                  {m.status === "pendente" && <span className="rounded bg-attention-tint px-1.5 text-attention">esperando você</span>}
                  {lead && (
                    <button onClick={() => abrirConversa(m.lead_id!)} className="inline-flex items-center gap-1 text-muted hover:text-primary-bright">
                      <MessageCircle className="h-3 w-3" /> {lead}
                    </button>
                  )}
                </div>
                {m.conteudo.replace(/^\[áudio transcrito\]\s*/, "")}
                <div className="mt-1 text-right font-mono text-[10px] text-muted">{fmtData(m.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={fim} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 pt-2 text-[12px]">
        <span className="text-muted">Sobre:</span>
        <select className="max-w-[260px] rounded-[7px] border border-border bg-surface-2 px-2 py-1" value={sobre} onChange={(e) => setSobre(e.target.value)}>
          <option value="">Geral (regra para todas as conversas)</option>
          {contatos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nomeExibicao}
            </option>
          ))}
        </select>
      </div>
      <Compositor leadId={sobre || null} placeholder={sobre ? "Ex.: oferece terça às 10h e manda o link da análise" : "Ex.: com imobiliária, sempre peça o e-mail do gerente"} />
    </Card>
  );
}
