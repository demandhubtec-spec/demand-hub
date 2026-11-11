import * as React from "react";
import { Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { type CanalFunil, type EtapaLista, type FaseConversa, type Metas, METAS_PADRAO, useMetas, useSalvarMetas } from "@/hooks/useComercial";

const COLUNAS: { key: CanalFunil; nome: string }[] = [
  { key: "google", nome: "Google" },
  { key: "instagram", nome: "Instagram" },
  { key: "linkedin", nome: "LinkedIn" },
  { key: "ligacoes", nome: "Ligações" },
  { key: "inbound", nome: "Inbound" },
];
const LINHAS: { key: EtapaLista; nome: string }[] = [
  { key: "contato", nome: "Mensagem ou ligação feita" },
  { key: "atendida", nome: "Ligação atendida" },
  { key: "conversa", nome: "Conversa iniciada" },
  { key: "qualificacao", nome: "Qualificação" },
  { key: "reuniao", nome: "Reunião agendada" },
  { key: "reuniao_realizada", nome: "Reunião realizada" },
  { key: "proposta", nome: "Negociação" },
  { key: "ganho", nome: "Venda" },
];
const SE_APLICA: Record<CanalFunil, EtapaLista[]> = {
  google: ["contato", "conversa", "qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"],
  instagram: ["contato", "conversa", "qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"],
  linkedin: ["contato", "conversa", "qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"],
  ligacoes: ["contato", "atendida", "conversa", "qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"],
  inbound: ["conversa", "qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"],
};
const FASES: { key: FaseConversa; nome: string }[] = [
  { key: "abordagem", nome: "Abordagem (o lead responde)" },
  { key: "conexao", nome: "Conexão (a conversa continua)" },
  { key: "qualificacao", nome: "Qualificação" },
  { key: "agendamento", nome: "Agendamento" },
];

function Campo({ valor, onChange, sufixo, largura = 70 }: { valor: number; onChange: (n: number) => void; sufixo: string; largura?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[9px] border border-primary-bright/40 bg-[rgba(11,4,32,.7)] px-2.5 py-1">
      <input
        type="number"
        min={0}
        step="any"
        value={Number.isFinite(valor) ? valor : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-transparent text-center text-[14px] font-semibold text-ink outline-none"
        style={{ width: largura - 30 }}
      />
      <span className="text-[11.5px] text-muted">{sufixo}</span>
    </span>
  );
}

/** Configurações > Metas do funil: metas gerais e a meta de cada etapa por canal. */
export function MetasTab() {
  const { data } = useMetas();
  const salvar = useSalvarMetas();
  const { showToast } = useToast();
  const [m, setM] = React.useState<Metas>(METAS_PADRAO);
  React.useEffect(() => {
    if (data) setM(data);
  }, [data]);

  const etapa = (c: CanalFunil, e: EtapaLista, v: number) => setM((x) => ({ ...x, etapas: { ...x.etapas, [c]: { ...x.etapas[c], [e]: v } } }));

  return (
    <Card className="p-5">
      <div className="text-[17px] font-semibold">Metas do funil</div>
      <p className="mb-5 mt-1 text-[13px] text-muted">
        Cada meta é a % de leads que deve passar de uma etapa para a próxima. Quando o realizado fica abaixo, a etapa fica laranja. A que está mais longe
        da meta vira o gargalo.
      </p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Bloco titulo="Vendas por mês">
          <Campo valor={m.vendas_mes} onChange={(v) => setM({ ...m, vendas_mes: v })} sufixo="vendas" largura={100} />
        </Bloco>
        <Bloco titulo="Reuniões por semana">
          <Campo valor={m.reunioes_semana} onChange={(v) => setM({ ...m, reunioes_semana: v })} sufixo="reuniões" largura={104} />
        </Bloco>
        <Bloco titulo="Reuniões não realizadas, no máximo">
          <Campo valor={m.faltas_max} onChange={(v) => setM({ ...m, faltas_max: v })} sufixo="%" />
        </Bloco>
        <Bloco titulo="Do topo até a venda">
          <Campo valor={m.topo_venda} onChange={(v) => setM({ ...m, topo_venda: v })} sufixo="%" />
        </Bloco>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
          <thead>
            <tr>
              <th className="pb-2 text-left font-mono text-[10.5px] font-normal uppercase tracking-wider text-muted">Passagem para a etapa</th>
              {COLUNAS.map((c) => (
                <th key={c.key} className="pb-2 font-mono text-[10.5px] font-normal uppercase tracking-wider text-muted">
                  {c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINHAS.map((l) => (
              <tr key={l.key} className="border-t border-border">
                <td className="py-2">{l.nome}</td>
                {COLUNAS.map((c) => (
                  <td key={c.key} className="py-2 text-center">
                    {SE_APLICA[c.key].includes(l.key) ? (
                      <Campo valor={m.etapas[c.key]?.[l.key] ?? 0} onChange={(v) => etapa(c.key, l.key, v)} sufixo="%" />
                    ) : (
                      <span className="text-[12px] text-muted">não se aplica</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 text-[14px] font-semibold">Metas das conversas (aba Insights)</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FASES.map((f) => (
          <Bloco key={f.key} titulo={f.nome}>
            <Campo valor={m.fases[f.key]} onChange={(v) => setM({ ...m, fases: { ...m.fases, [f.key]: v } })} sufixo="%" />
          </Bloco>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] text-muted">Dá para mudar a qualquer momento. Os Indicadores mudam na hora; os Insights usam a meta nova na próxima análise.</p>
      <Button
        className="mt-4"
        disabled={salvar.isPending}
        onClick={() => salvar.mutate(m, { onSuccess: () => showToast("Metas salvas"), onError: (e) => showToast(`Erro: ${(e as Error).message}`) })}
      >
        {salvar.isPending ? "Salvando…" : "Salvar metas"}
      </Button>
    </Card>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface-2 p-3.5">
      <div className="mb-2 font-mono text-[10.5px] uppercase tracking-wider text-muted">{titulo}</div>
      {children}
    </div>
  );
}

const SDR_URL = (import.meta.env.VITE_SDR_URL as string | undefined) ?? "https://demandia-sdr.vercel.app";

/** Configurações > Ligações · webhook: o endereço para passar à empresa de ligações e o formato dos dados. */
export function LigacoesWebhookTab() {
  const { showToast } = useToast();
  const url = `${SDR_URL}/api/webhooks/ligacoes`;
  const exemplo = `{
  "id": "123",
  "empresa": "Clínica Exemplo",
  "telefone": "5519999999999",
  "status": "atendida",
  "tentativas": 2,
  "valor": null,
  "observacoes": "Pediu retorno na sexta"
}`;
  return (
    <Card className="p-5">
      <div className="text-[17px] font-semibold">Ligações · webhook</div>
      <p className="mb-4 mt-1 text-[13px] text-muted">
        Passe este endereço para a empresa de ligações. Cada contato que ela mandar entra no funil Ligações · Lista. Nada é enviado para o lead daqui.
      </p>
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-muted">Endereço (POST)</div>
      <div className="mb-4 flex items-center gap-2">
        <code className="flex-1 truncate rounded-[10px] border border-border bg-[rgba(11,4,32,.7)] px-3 py-2 text-[13px]">{url}</code>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(url);
            showToast("Endereço copiado");
          }}
        >
          <Copy /> Copiar
        </Button>
      </div>
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-muted">Senha do webhook</div>
      <p className="mb-4 text-[13px] text-ink/90">
        Vai no cabeçalho <code className="text-primary-bright">x-webhook-secret</code>. É a variável <code className="text-primary-bright">LIGACOES_WEBHOOK_SECRET</code> que
        você cadastra na Vercel do servidor da Ana. Enquanto ela não existir, o webhook fica desligado.
      </p>
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-muted">Exemplo de contato</div>
      <pre className="rounded-[10px] border border-border bg-[rgba(11,4,32,.7)] p-3 text-[12px] leading-relaxed">{exemplo}</pre>
      <p className="mt-3 text-[12.5px] text-muted">
        O status pode vir com palavras comuns: não atendeu, atendida, conversa, qualificado, reunião agendada, reunião realizada, proposta, venda, sem
        interesse. Também aceita uma lista de contatos de uma vez.
      </p>
    </Card>
  );
}
