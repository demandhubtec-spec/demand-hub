import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, QrCode, RefreshCw, Smartphone, Unplug, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { chamarSdr, useOutreachConfig, useUpdateConfig } from "@/hooks/useProspeccao";
import { cn } from "@/lib/utils";

/**
 * WhatsApp das SDRs (16/11/2026, pedido do Kelvin): o número da Gabi e o da Marina, cada um com o status
 * da conexão e o QR Code para ler direto do portal (WhatsApp Business > Dispositivos conectados > Conectar).
 * A Marina começa com 10 primeiros contatos por dia para aquecer o número; a Gabi segue com o teto de Controles.
 * As duas usam a mesma fila de aprovados e nunca falam com o mesmo contato.
 */
type Sdr = "gabi" | "marina";
interface StatusSdr {
  agente: Sdr;
  nome: string;
  existe: boolean;
  conectado: boolean;
  logado: boolean;
  numero: string | null;
  perfil?: string | null;
  instancia?: string | null;
  erro?: string;
}

const fmtNumero = (n: string | null) => {
  const d = (n ?? "").replace(/\D/g, "");
  if (d.length < 12) return n ?? "";
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, d.length - 4)}-${d.slice(-4)}`;
};

function useStatusSdrs() {
  return useQuery({
    queryKey: ["whatsapp", "sdrs"],
    refetchInterval: 15_000,
    queryFn: () => chamarSdr<{ sdrs: StatusSdr[] }>("/api/whatsapp", { acao: "status" }).then((r) => r.sdrs),
  });
}

function Selo({ s }: { s: StatusSdr }) {
  const ok = s.existe && s.conectado && s.logado;
  const texto = !s.existe ? "Número não criado" : ok ? "Conectado" : s.erro ? "Sem resposta do servidor" : "Desconectado: leia o QR Code";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold",
        ok ? "bg-positive-tint text-positive" : "bg-attention-tint text-attention",
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {texto}
    </span>
  );
}

/** QR Code que se atualiza sozinho até o número conectar (o WhatsApp troca o QR a cada ~20 s). */
function LeitorQr({ agente, fechar }: { agente: Sdr; fechar: () => void }) {
  const qc = useQueryClient();
  const [qr, setQr] = React.useState<{ qrcode: string | null; codigo?: string | null; aviso?: string } | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [conectou, setConectou] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      try {
        const r = await chamarSdr<{ conectado: boolean; qrcode?: string | null; codigo?: string | null; aviso?: string }>("/api/whatsapp", { acao: "qr", agente });
        if (!vivo) return;
        if (r.conectado) {
          setConectou(true);
          qc.invalidateQueries({ queryKey: ["whatsapp", "sdrs"] });
          return;
        }
        setErro(null);
        setQr({ qrcode: r.qrcode ?? null, codigo: r.codigo, aviso: r.aviso });
      } catch (e) {
        if (vivo) setErro((e as Error).message);
      }
      if (vivo) setTimeout(buscar, 6000);
    };
    buscar();
    return () => {
      vivo = false;
    };
  }, [agente, qc]);

  if (conectou)
    return (
      <div className="mt-3 rounded-[10px] bg-positive-tint p-4 text-[14px] text-positive">
        Conectado! O número já está pronto para enviar e receber mensagens.{" "}
        <button className="font-semibold underline" onClick={fechar}>
          Fechar
        </button>
      </div>
    );

  const src = qr?.qrcode ? (qr.qrcode.startsWith("data:") ? qr.qrcode : `data:image/png;base64,${qr.qrcode}`) : null;
  return (
    <div className="mt-3 flex flex-col gap-4 rounded-[10px] border border-border p-4 sm:flex-row sm:items-start">
      <div className="flex h-[240px] w-[240px] shrink-0 items-center justify-center rounded-[8px] bg-white">
        {src ? <img src={src} alt="QR Code do WhatsApp" className="h-[230px] w-[230px]" /> : <Loader2 className="h-6 w-6 animate-spin text-muted" />}
      </div>
      <div className="space-y-2 text-[13px] text-muted">
        <div className="text-[14px] font-semibold text-ink">Leia com o celular do número</div>
        <ol className="list-decimal space-y-1 pl-4">
          <li>Abra o WhatsApp Business no celular desse número.</li>
          <li>Toque em ⋮ (ou Configurações) e depois em Dispositivos conectados.</li>
          <li>Toque em Conectar dispositivo e aponte a câmera para o código ao lado.</li>
        </ol>
        <p>O código se renova sozinho a cada poucos segundos. Quando conectar, esta caixa avisa.</p>
        {qr?.aviso && <p className="text-attention">{qr.aviso}</p>}
        {erro && <p className="text-attention">Erro: {erro}</p>}
        <Button variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function CartaoSdr({ s }: { s: StatusSdr }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [lendo, setLendo] = React.useState(false);
  const [chave, setChave] = React.useState("");
  const [ocupado, setOcupado] = React.useState<string | null>(null);

  async function acao(nome: "criar" | "reconectar" | "desconectar", extra: Record<string, unknown> = {}) {
    setOcupado(nome);
    try {
      const r = await chamarSdr<{ ok?: boolean; detalhe?: string; criada?: string }>("/api/whatsapp", { acao: nome, agente: s.agente, ...extra });
      if (nome === "criar") {
        showToast(`Número da ${s.nome} criado. Agora leia o QR Code.`);
        setChave("");
        setLendo(true);
      } else showToast(r.ok ? (nome === "reconectar" ? "Reconectando…" : "Desconectado.") : `Não deu certo: ${r.detalhe ?? "erro"}`);
      qc.invalidateQueries({ queryKey: ["whatsapp", "sdrs"] });
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    } finally {
      setOcupado(null);
    }
  }

  const ok = s.existe && s.conectado && s.logado;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-tint text-[15px] font-semibold text-primary">{s.nome.charAt(0)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{s.nome}</span>
            <Selo s={s} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            <Smartphone className="h-3.5 w-3.5" />
            {s.numero ? fmtNumero(s.numero) : s.existe ? "número aparece depois de conectar" : "ainda sem número"}
            {s.perfil ? ` · ${s.perfil}` : ""}
          </div>
        </div>
        {s.existe && (
          <div className="flex flex-wrap gap-2">
            {!ok && (
              <Button onClick={() => setLendo(true)} disabled={lendo}>
                <QrCode className="mr-1.5 h-4 w-4" /> Ler QR Code
              </Button>
            )}
            <Button variant="ghost" onClick={() => acao("reconectar")} disabled={!!ocupado}>
              <RefreshCw className={cn("mr-1.5 h-4 w-4", ocupado === "reconectar" && "animate-spin")} /> Reconectar
            </Button>
            {ok && (
              <Button
                variant="ghost"
                onClick={() => window.confirm(`Desconectar o WhatsApp da ${s.nome}? Ela para de enviar e responder até você ler o QR Code de novo.`) && acao("desconectar")}
                disabled={!!ocupado}
              >
                <Unplug className="mr-1.5 h-4 w-4" /> Desconectar
              </Button>
            )}
          </div>
        )}
      </div>

      {!s.existe && s.agente === "marina" && (
        <div className="mt-3 space-y-2 rounded-[10px] bg-surface-2 p-3 text-[13px]">
          <div className="font-semibold">Criar o número da Marina no servidor do WhatsApp</div>
          <p className="text-muted">
            Cole a chave geral do Evolution (a GLOBAL_API_KEY do servidor). Ela é usada só agora para criar o número e não fica salva. Depois é só ler o QR Code com
            o celular da Marina.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input value={chave} onChange={(e) => setChave(e.target.value)} placeholder="Chave geral do Evolution" type="password" className="max-w-[340px]" />
            <Button onClick={() => acao("criar", { chave_global: chave })} disabled={!!ocupado}>
              {ocupado === "criar" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Criar número da Marina
            </Button>
          </div>
        </div>
      )}
      {s.erro && <p className="mt-2 text-[12px] text-attention">{s.erro}</p>}
      {lendo && <LeitorQr agente={s.agente} fechar={() => setLendo(false)} />}
    </Card>
  );
}

export function WhatsAppSdrsTab() {
  const { data: sdrs, isLoading, error } = useStatusSdrs();
  const { data: cfg } = useOutreachConfig();
  const update = useUpdateConfig();
  const { showToast } = useToast();
  const [teto, setTeto] = React.useState<string>("");
  React.useEffect(() => {
    if (cfg) setTeto(String(cfg.marina_daily_cap ?? 10));
  }, [cfg]);

  const marina = sdrs?.find((x) => x.agente === "marina");
  const salvar = (patch: Record<string, unknown>, descricao: string, ok: string) =>
    update.mutate({ patch, descricao }, { onSuccess: () => showToast(ok), onError: (e) => showToast(`Erro: ${(e as Error).message}`) });

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[16px] font-semibold">WhatsApp das SDRs</div>
        <p className="mt-1 max-w-[760px] text-[13px] text-muted">
          A Gabi e a Marina fazem o mesmo trabalho (primeiro contato, follow-up e agendamento), cada uma no seu número. Elas dividem a mesma fila de aprovados e
          nunca falam com o mesmo contato: cada lead fica com quem mandou o primeiro "Oi", e quem chama sozinho fica com o número em que chamou.
        </p>
      </div>
      {isLoading && <div className="text-[13px] text-muted">Conferindo os números…</div>}
      {error && <div className="text-[13px] text-attention">Não consegui ver os números agora: {(error as Error).message}</div>}
      {sdrs?.map((s) => <CartaoSdr key={s.agente} s={s} />)}

      {cfg && (
        <Card className="space-y-3 p-4">
          <div className="text-[15px] font-semibold">Disparo da Marina</div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[14px] font-semibold">Marina fazendo primeiros contatos</div>
              <div className="text-[12px] text-muted">
                {/* 16/11: o texto dizia "Ligado" mesmo com o disparo desligado */}
                {cfg.marina_enabled
                  ? marina?.existe && marina.conectado
                    ? "Ligado: ela entra na fila de aprovados junto com a Gabi."
                    : "Ligado, mas o número dela está desconectado: ela não dispara até reconectar."
                  : marina?.existe && marina.conectado
                    ? "Desligado: a Marina não faz primeiros contatos. Ligue para ela entrar na fila."
                    : "Desligado. Ligue depois de conectar o número dela."}
              </div>
            </div>
            <Switch
              checked={!!cfg.marina_enabled}
              onCheckedChange={(v) => salvar({ marina_enabled: v }, v ? "Marina ligada nos primeiros contatos" : "Marina desligada dos primeiros contatos", v ? "Marina ligada." : "Marina desligada.")}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[14px] font-semibold">Primeiros contatos da Marina por dia</div>
              <div className="text-[12px] text-muted">
                Comece com 10 para aquecer o número e aumente aos poucos. A Gabi está com {cfg.wa_daily_cap} por dia (em Controles). Follow-ups e respostas não
                contam no teto.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input value={teto} onChange={(e) => setTeto(e.target.value.replace(/\D/g, ""))} className="w-[80px]" inputMode="numeric" />
              <Button
                variant="ghost"
                disabled={!teto || Number(teto) === cfg.marina_daily_cap}
                onClick={() => salvar({ marina_daily_cap: Math.min(Number(teto), 60) }, `Teto da Marina: ${teto} por dia`, "Teto da Marina salvo.")}
              >
                Salvar
              </Button>
            </div>
          </div>
          {cfg.marina_daily_cap === undefined && (
            <p className="text-[12px] text-attention">Falta rodar a migration 0035 no Supabase para os controles da Marina funcionarem.</p>
          )}
        </Card>
      )}
    </div>
  );
}
