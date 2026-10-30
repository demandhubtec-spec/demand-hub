import * as React from "react";
import { ImagePlus, Mic, Send, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useEnviarCanal, type EnvioCanal } from "@/hooks/useCrm";
import { cn } from "@/lib/utils";

const paraBase64 = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^;]+;base64,/, ""));
    r.onerror = rej;
    r.readAsDataURL(b);
  });

/** Reduz a foto para no máximo 1600px (o envio fica leve e a leitura continua boa). */
async function imagemLeve(f: File): Promise<{ base64: string; mimetype: string }> {
  const img = await createImageBitmap(f);
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
  return { base64: await paraBase64(blob), mimetype: "image/jpeg" };
}

/** Caixa para falar com a Ana: texto, áudio gravado na hora ou foto (print de conversa, por exemplo). */
export function Compositor({ leadId, placeholder, compacto = false }: { leadId: string | null; placeholder: string; compacto?: boolean }) {
  const enviar = useEnviarCanal();
  const { showToast } = useToast();
  const [texto, setTexto] = React.useState("");
  const [imagem, setImagem] = React.useState<{ base64: string; mimetype: string; nome: string } | null>(null);
  const [gravando, setGravando] = React.useState(false);
  const gravador = React.useRef<MediaRecorder | null>(null);
  const pedacos = React.useRef<Blob[]>([]);
  const arquivo = React.useRef<HTMLInputElement>(null);

  async function mandar(extra: Partial<EnvioCanal> = {}) {
    const corpo: EnvioCanal = { lead_id: leadId, texto: texto.trim() || undefined, ...extra };
    if (imagem && !corpo.midia) corpo.midia = { tipo: "imagem", base64: imagem.base64, mimetype: imagem.mimetype };
    if (!corpo.texto && !corpo.midia) return;
    try {
      await enviar.mutateAsync(corpo);
      setTexto("");
      setImagem(null);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  async function alternarGravacao() {
    if (gravando) {
      gravador.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      pedacos.current = [];
      rec.ondataavailable = (e) => e.data.size && pedacos.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const blob = new Blob(pedacos.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1500) return;
        await mandar({ midia: { tipo: "audio", base64: await paraBase64(blob), mimetype: blob.type } });
      };
      gravador.current = rec;
      rec.start();
      setGravando(true);
    } catch {
      showToast("Não consegui usar o microfone. Libere o acesso no navegador.");
    }
  }

  return (
    <div className={cn("border-t border-border p-2.5", compacto && "p-2")}>
      {imagem && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-[7px] bg-surface-2 px-2 py-1 text-[12px]">
          <ImagePlus className="h-3.5 w-3.5" /> {imagem.nome}
          <button onClick={() => setImagem(null)} aria-label="Tirar imagem">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          rows={compacto ? 1 : 2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              mandar();
            }
          }}
          placeholder={gravando ? "Gravando… clique no quadrado para enviar" : placeholder}
          className="min-h-0 flex-1 resize-none"
          disabled={gravando}
        />
        <input
          ref={arquivo}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setImagem({ ...(await imagemLeve(f)), nome: f.name });
          }}
        />
        <Button variant="ghost" size="icon" onClick={() => arquivo.current?.click()} aria-label="Enviar imagem" disabled={gravando || enviar.isPending}>
          <ImagePlus />
        </Button>
        <Button variant="ghost" size="icon" onClick={alternarGravacao} aria-label={gravando ? "Parar e enviar áudio" : "Gravar áudio"} disabled={enviar.isPending}>
          {gravando ? <Square className="text-attention" /> : <Mic />}
        </Button>
        <Button size="icon" onClick={() => mandar()} disabled={enviar.isPending || gravando || (!texto.trim() && !imagem)} aria-label="Enviar">
          <Send />
        </Button>
      </div>
      {enviar.isPending && <div className="mt-1 text-[11px] text-muted">Enviando para a Ana…</div>}
    </div>
  );
}
