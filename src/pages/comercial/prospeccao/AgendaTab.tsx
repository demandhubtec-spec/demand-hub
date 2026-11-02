import * as React from "react";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronRight, Mail, MessageCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEnviosHoje, useOutreachConfig, useOutreachLeads } from "@/hooks/useProspeccao";
import { cn } from "@/lib/utils";
import { type EnvioPrevisto, FERIADOS, diaDaSemana, inicioDoDia, preverEnvios, ymd } from "./agenda";
import { FichaLead } from "./FichaLead";

type Periodo = "hoje" | "amanha" | "semana" | "7" | "15" | "30";
type Canal = "todos" | "whatsapp" | "email";
type Tipo = "todos" | "primeiro" | "follow" | 2 | 3 | 4 | 5 | 6;

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "amanha", label: "Amanhã" },
  { key: "semana", label: "Esta semana" },
  { key: "7", label: "Próximos 7 dias" },
  { key: "15", label: "15 dias" },
  { key: "30", label: "30 dias" },
];
const TIPOS: { key: Tipo; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "primeiro", label: "1º contato" },
  { key: "follow", label: "Follow-ups" },
  { key: 2, label: "Toque 2" },
  { key: 3, label: "Toque 3" },
  { key: 4, label: "Toque 4" },
  { key: 5, label: "Toque 5" },
  { key: 6, label: "Toque 6" },
];

const DIA = 864e5;
const SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const ddmm = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Intervalo [de, até) do período escolhido. */
function janela(p: Periodo, agora = new Date()): [Date, Date] {
  const h = inicioDoDia(agora);
  if (p === "hoje") return [h, new Date(h.getTime() + DIA)];
  if (p === "amanha") return [new Date(h.getTime() + DIA), new Date(h.getTime() + 2 * DIA)];
  if (p === "semana") {
    const dow = diaDaSemana(agora);
    return [h, new Date(h.getTime() + (7 - dow) * DIA)]; // até domingo
  }
  return [h, new Date(h.getTime() + Number(p) * DIA)];
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors",
        ativo ? "border-primary-bright bg-primary-tint text-primary-bright" : "border-border text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Linha({ e, onAbrir }: { e: EnvioPrevisto; onAbrir: () => void }) {
  const Icone = e.canal === "email" ? Mail : MessageCircle;
  return (
    <button onClick={onAbrir} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-surface-2">
      <span className="w-[52px] shrink-0 tabular-nums text-muted">≈ {hhmm(e.quando)}</span>
      <Icone className={cn("h-3.5 w-3.5 shrink-0", e.canal === "email" ? "text-primary-bright" : "text-positive")} />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{e.lead.empresa}</span>
        <span className="ml-2 text-[11.5px] text-muted">{[e.lead.nicho, e.lead.cidade].filter(Boolean).join(" · ")}</span>
      </span>
      {e.atrasado && <span className="shrink-0 rounded bg-attention-tint px-1.5 text-[11px] text-attention">atrasado</span>}
      <span
        className={cn(
          "shrink-0 rounded-full px-2 text-[11px] font-semibold",
          e.toque === 1 ? "bg-primary-tint text-primary-bright" : "bg-surface-2 text-muted",
        )}
      >
        {e.toque === 1 ? "1º contato" : `Toque ${e.toque} de ${e.total}`}
      </span>
    </button>
  );
}

/** Painel que abre embaixo de um botão e fecha ao clicar fora ou apertar Esc. */
function Suspenso({
  rotulo,
  icone,
  destaque,
  children,
  largura = 300,
}: {
  rotulo: React.ReactNode;
  icone: React.ReactNode;
  destaque?: boolean;
  children: (fechar: () => void) => React.ReactNode;
  largura?: number;
}) {
  const [aberto, setAberto] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
          destaque || aberto ? "border-primary-bright/70 bg-primary-tint text-primary-bright" : "border-border text-ink hover:border-primary-bright/50",
        )}
      >
        {icone}
        {rotulo}
        <ChevronDown className={cn("h-3.5 w-3.5 opacity-70 transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-30 rounded-lg border border-border bg-surface p-3 shadow-xl"
          style={{ width: largura }}
        >
          {children(() => setAberto(false))}
        </div>
      )}
    </div>
  );
}

/** Filtro ativo mostrado ao lado dos botões, com X para tirar. */
function Pilula({ children, onTirar }: { children: React.ReactNode; onTirar: () => void }) {
  return (
    <span className="flex h-7 items-center gap-1 rounded-full bg-surface-2 pl-2.5 pr-1 text-[12px] font-semibold text-ink">
      {children}
      <button onClick={onTirar} className="rounded-full p-0.5 text-muted hover:text-ink" aria-label="Tirar filtro">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/** Agenda de envios: quem recebe o quê e mais ou menos a que horas, por dia. */
export function AgendaTab() {
  const { data: leads = [] } = useOutreachLeads();
  const { data: cfg } = useOutreachConfig();
  const { data: feitos } = useEnviosHoje();
  const [periodo, setPeriodo] = React.useState<Periodo>("amanha");
  const [canal, setCanal] = React.useState<Canal>("todos");
  const [tipo, setTipo] = React.useState<Tipo>("todos");
  const [busca, setBusca] = React.useState("");
  const [abertos, setAbertos] = React.useState<Record<string, boolean>>({});
  const [aberto, setAberto] = React.useState<string | null>(null);

  // Recalcula a cada minuto (o "agora" muda o que ainda falta sair hoje)
  const [agora, setAgora] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const previstos = React.useMemo(
    () => (cfg ? preverEnvios(leads, cfg, feitos ?? { waNovos: 0, waFollow: 0, email: 0 }, 31, agora) : []),
    [leads, cfg, feitos, agora],
  );

  const [de, ate] = janela(periodo, agora);
  const termo = busca.trim().toLowerCase();
  const filtrados = previstos.filter(
    (e) =>
      e.quando >= de &&
      e.quando < ate &&
      (canal === "todos" || e.canal === canal) &&
      (tipo === "todos" || (tipo === "primeiro" ? e.toque === 1 : tipo === "follow" ? e.toque > 1 : e.toque === tipo)) &&
      (!termo || e.lead.empresa.toLowerCase().includes(termo)),
  );

  const porDia = new Map<string, EnvioPrevisto[]>();
  for (const e of filtrados) porDia.set(ymd(e.quando), [...(porDia.get(ymd(e.quando)) ?? []), e]);

  const n1 = filtrados.filter((e) => e.toque === 1).length;
  const nFollowWa = filtrados.filter((e) => e.toque > 1 && e.canal === "whatsapp").length;
  const nEmail = filtrados.filter((e) => e.canal === "email").length;
  const paraAprovar = leads.filter((l) => l.wa_status === "pendente" && l.msg_status === "rascunho").length;
  const naFila = leads.filter((l) => l.wa_status === "pendente" && l.msg_status === "aprovada" && l.whatsapp).length;
  const ultimoPrimeiro = [...previstos].reverse().find((e) => e.toque === 1);
  const feriados = [...FERIADOS].filter((f) => f >= ymd(de) && f < ymd(ate));
  const diasLongos = Number(periodo) >= 15;
  const leadAberto = aberto ? leads.find((l) => l.place_id === aberto) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Suspenso
          icone={<CalendarDays className="h-3.5 w-3.5" />}
          rotulo={PERIODOS.find((p) => p.key === periodo)?.label}
          largura={200}
        >
          {(fechar) => (
            <div className="flex flex-col">
              {PERIODOS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => {
                    setPeriodo(p.key);
                    fechar();
                  }}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-left text-[12.5px] hover:bg-surface-2",
                    periodo === p.key ? "font-semibold text-primary-bright" : "text-ink",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </Suspenso>

        <Suspenso
          icone={<SlidersHorizontal className="h-3.5 w-3.5" />}
          rotulo={`Filtros${(canal !== "todos" ? 1 : 0) + (tipo !== "todos" ? 1 : 0) ? ` (${(canal !== "todos" ? 1 : 0) + (tipo !== "todos" ? 1 : 0)})` : ""}`}
          destaque={canal !== "todos" || tipo !== "todos"}
          largura={320}
        >
          {() => (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Canal</div>
                <div className="flex flex-wrap gap-1.5">
                  <Chip ativo={canal === "todos"} onClick={() => setCanal("todos")}>Todos</Chip>
                  <Chip ativo={canal === "whatsapp"} onClick={() => setCanal("whatsapp")}>WhatsApp</Chip>
                  <Chip ativo={canal === "email"} onClick={() => setCanal("email")}>E-mail</Chip>
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Tipo de envio</div>
                <div className="flex flex-wrap gap-1.5">
                  {TIPOS.map((t) => (
                    <Chip key={String(t.key)} ativo={tipo === t.key} onClick={() => setTipo(t.key)}>
                      {t.label}
                    </Chip>
                  ))}
                </div>
              </div>
              {(canal !== "todos" || tipo !== "todos") && (
                <button
                  className="text-[12px] font-semibold text-primary-bright"
                  onClick={() => {
                    setCanal("todos");
                    setTipo("todos");
                  }}
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </Suspenso>

        {canal !== "todos" && <Pilula onTirar={() => setCanal("todos")}>{canal === "whatsapp" ? "WhatsApp" : "E-mail"}</Pilula>}
        {tipo !== "todos" && <Pilula onTirar={() => setTipo("todos")}>{TIPOS.find((t) => t.key === tipo)?.label}</Pilula>}

        <label className="ml-auto flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[12.5px] focus-within:border-primary-bright/60">
          <Search className="h-3.5 w-3.5 text-muted" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa" className="w-[150px] bg-transparent outline-none" />
          {busca && (
            <button onClick={() => setBusca("")} className="text-muted hover:text-ink" aria-label="Limpar busca">
              <X className="h-3 w-3" />
            </button>
          )}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Envios no período", n: filtrados.length },
          { label: "Primeiros contatos", n: n1 },
          { label: "Follow-ups no WhatsApp", n: nFollowWa },
          { label: "E-mails", n: nEmail },
        ].map((k) => (
          <Card key={k.label} className="p-3.5 px-4">
            <div className="text-[11.5px] text-muted">{k.label}</div>
            <div className="font-display text-[22px] font-bold">{k.n}</div>
          </Card>
        ))}
      </div>

      <div className="space-y-1 text-[12px] text-muted">
        <div>
          Horários aproximados: o robô sorteia de {Math.round((cfg?.wa_min_interval_sec ?? 300) / 60)} a {Math.round((cfg?.wa_max_interval_sec ?? 540) / 60)} minutos entre um
          WhatsApp e outro. Follow-ups saem antes dos primeiros contatos. Sábado só de manhã e só follow-up.
        </div>
        <div>
          {naFila} aprovados na fila
          {ultimoPrimeiro ? `, os últimos recebem o 1º contato em ${ddmm(ultimoPrimeiro.quando)}` : ""}.
          {paraAprovar > 0 && ` ${paraAprovar} esperando sua aprovação ainda não entram na agenda.`}
        </div>
        {feriados.length > 0 && <div>Feriado no período ({feriados.map((f) => f.slice(8, 10) + "/" + f.slice(5, 7)).join(", ")}): nada sai nesse dia.</div>}
        {cfg && !cfg.wa_enabled && (
          <div className="flex items-center gap-1.5 text-attention">
            <AlertTriangle className="h-3.5 w-3.5" /> WhatsApp pausado: nada de WhatsApp sai até você ligar de novo em Controles.
          </div>
        )}
      </div>

      {porDia.size === 0 && <Card className="p-6 text-center text-[13px] text-muted">Nenhum envio previsto com esses filtros.</Card>}

      {[...porDia.entries()].map(([dia, itens]) => {
        const d = itens[0].quando;
        const expandido = abertos[dia] ?? !diasLongos;
        const p = itens.filter((e) => e.toque === 1).length;
        const fw = itens.filter((e) => e.toque > 1 && e.canal === "whatsapp").length;
        const em = itens.filter((e) => e.canal === "email").length;
        const wa = itens.filter((e) => e.canal === "whatsapp");
        return (
          <Card key={dia} className="p-3 px-4">
            <button className="flex w-full items-center gap-2 text-left" onClick={() => setAbertos((s) => ({ ...s, [dia]: !expandido }))}>
              {expandido ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
              <span className="text-[13.5px] font-semibold">
                {SEMANA[diaDaSemana(d)]}, {ddmm(d)}
              </span>
              <span className="text-[12px] text-muted">
                {[p && `${p} primeiros contatos`, fw && `${fw} follow-ups no WhatsApp`, em && `${em} e-mails`].filter(Boolean).join(" · ")}
                {wa.length > 0 && ` · WhatsApp das ${hhmm(wa[0].quando)} às ${hhmm(wa[wa.length - 1].quando)}`}
              </span>
            </button>
            {expandido && (
              <div className="mt-2 space-y-0.5 border-t border-border pt-2">
                {itens.map((e) => (
                  <Linha key={`${e.lead.place_id}-${e.toque}`} e={e} onAbrir={() => setAberto(e.lead.place_id)} />
                ))}
              </div>
            )}
          </Card>
        );
      })}

      {leadAberto && <FichaLead lead={leadAberto} onClose={() => setAberto(null)} />}
    </div>
  );
}
