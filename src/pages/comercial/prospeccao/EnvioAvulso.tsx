import * as React from "react";
import { Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { type OutreachLead, useEnviarAvulso } from "@/hooks/useProspeccao";
import { cn } from "@/lib/utils";

/**
 * Mensagem avulsa para o lead: o follow-up feito à mão ou a análise para o e-mail que a recepção passou.
 * Sai do WhatsApp ou do e-mail da Ana (com a assinatura dela), só depois que você revisa e clica em enviar.
 */
export function EnvioAvulso({ lead }: { lead: OutreachLead }) {
  const enviar = useEnviarAvulso();
  const { showToast } = useToast();
  const [canal, setCanal] = React.useState<"whatsapp" | "email">(lead.whatsapp ? "whatsapp" : "email");
  const [para, setPara] = React.useState(lead.email ?? "");
  const [assunto, setAssunto] = React.useState("");
  const [texto, setTexto] = React.useState("");
  const [confirmar, setConfirmar] = React.useState(false);

  const baloes = texto.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const emails = para.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const travessao = /[—–]/.test(texto);
  const pronto = !!texto.trim() && !travessao && (canal === "whatsapp" ? !!lead.whatsapp : emails.length > 0 && !!assunto.trim());

  async function mandar() {
    try {
      const r = await enviar.mutateAsync({ placeId: lead.place_id, canal, texto, ...(canal === "email" ? { para: emails, assunto } : {}) });
      showToast(canal === "email" ? `E-mail enviado para ${emails.join(", ")}` : `WhatsApp enviado (${r.enviados} balões)`);
      setTexto("");
      setAssunto("");
    } catch (e) {
      showToast(`Não enviou: ${(e as Error).message}`);
    } finally {
      setConfirmar(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Mensagem avulsa</span>
        <div className="ml-auto flex gap-1">
          {(["whatsapp", "email"] as const).map((c) => (
            <button
              key={c}
              onClick={() => { setCanal(c); setConfirmar(false); }}
              className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px]", canal === c ? "bg-surface-2 font-semibold" : "text-muted")}
            >
              {c === "whatsapp" ? <MessageCircle className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
              {c === "whatsapp" ? "WhatsApp" : "E-mail"}
            </button>
          ))}
        </div>
      </div>

      {canal === "email" && (
        <div className="mb-2 grid gap-2">
          <Input className="h-9 py-1.5" placeholder="Para (separe vários e-mails por vírgula)" value={para} onChange={(e) => setPara(e.target.value)} />
          <Input className="h-9 py-1.5" placeholder="Assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        </div>
      )}
      {canal === "whatsapp" && !lead.whatsapp && <div className="mb-2 text-[12px] text-attention">Este lead não tem WhatsApp.</div>}

      <Textarea
        rows={canal === "email" ? 9 : 5}
        placeholder={canal === "email" ? "Texto do e-mail. A assinatura da Ana entra sozinha." : "Texto do WhatsApp. Linha em branco = novo balão."}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setConfirmar(false); }}
      />
      <div className="mt-1 text-[11.5px] text-muted">
        {canal === "whatsapp" ? `${baloes.length} balão(ões). Sai do WhatsApp da Ana.` : "Sai do e-mail da Ana, com foto e assinatura."}
        {travessao && <span className="text-attention"> Tem travessão: troque por vírgula ou ponto.</span>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!confirmar ? (
          <Button size="sm" disabled={!pronto || enviar.isPending} onClick={() => setConfirmar(true)}>
            <Send /> Enviar
          </Button>
        ) : (
          <>
            <span className="text-[12.5px]">
              Confirma o envio {canal === "email" ? `para ${emails.join(", ")}` : `para o WhatsApp de ${lead.empresa}`}?
            </span>
            <Button size="sm" onClick={mandar} disabled={enviar.isPending}>
              {enviar.isPending ? "Enviando..." : "Sim, enviar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)} disabled={enviar.isPending}>
              Cancelar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
