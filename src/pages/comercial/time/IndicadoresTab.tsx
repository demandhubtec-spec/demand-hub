import * as React from "react";
import { AlertTriangle, Check, Lightbulb, Instagram, Linkedin, MapPin, Megaphone, Phone, Settings, Target, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useContatos } from "@/hooks/useCrm";
import { useOutreachLeads } from "@/hooks/useProspeccao";
import { type CanalFunil, type ListaLead, useInsights, useListaLeads, useMetas } from "@/hooks/useComercial";
import { cn } from "@/lib/utils";
import { FunilGrafico } from "./FunilGrafico";
import { ETAPAS_FUNIL, contarFunil, desdeDias, fmtPct, linhasFunil, nivelGoogle, nivelInbound, nivelLista, type LinhaFunil } from "./indicadores-calc";

const fim8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);
const Rotulo = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("text-[12px] text-muted", className)}>{children}</div>
);

interface Canal {
  key: CanalFunil;
  nome: string;
  sub: string;
  icone: React.ComponentType<{ className?: string }>;
  itens: { nivel: number; nicho: string | null; quando: string }[];
  emBreve?: boolean;
}

const PERIODOS = [
  { v: 7, l: "7 dias" },
  { v: 30, l: "30 dias" },
  { v: 90, l: "90 dias" },
  { v: null, l: "Tudo" },
] as const;

/**
 * Aba Indicadores: os 5 funis (Google, Instagram, LinkedIn, Ligações e Inbound) de cima para baixo,
 * com a meta de cada etapa e o gargalo em destaque. Os números grandes do topo são o que o dono olha primeiro.
 */
export function IndicadoresTab({ irPara }: { irPara: (aba: "insights" | "config" | "aprovacao" | "funil") => void }) {
  const { data: leads = [] } = useOutreachLeads();
  const { contatos } = useContatos();
  const { data: listas = [] } = useListaLeads();
  const { data: metas } = useMetas();
  const { data: ins } = useInsights();
  const [dias, setDias] = React.useState<number | null>(30);
  const [segmento, setSegmento] = React.useState("");
  const desde = desdeDias(dias);

  const noPeriodo = (quando: string | null | undefined) => !desde || (quando ?? "") >= desde;
  const doSegmento = (n: string | null | undefined) => !segmento || (n ?? "").toLowerCase() === segmento.toLowerCase();

  const fonesLista = React.useMemo(() => new Set(listas.map((l) => fim8(l.whatsapp)).filter(Boolean)), [listas]);
  const segmentos = React.useMemo(() => {
    const s = new Set<string>();
    leads.forEach((l) => l.nicho && s.add(l.nicho));
    listas.forEach((l) => l.nicho && s.add(l.nicho));
    contatos.forEach((c) => c.segmento && s.add(c.segmento));
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [leads, listas, contatos]);

  const daLista = (k: ListaLead["lista"]) =>
    listas.filter((l) => l.lista === k).map((l) => ({ nivel: nivelLista(l), nicho: l.nicho, quando: l.criado_em }));

  const brutos: Canal[] = [
    {
      key: "google",
      nome: "Google Meu Negócio · Lista",
      sub: "WhatsApp com a Gabi",
      icone: MapPin,
      itens: leads
        .map((l) => ({ nivel: nivelGoogle(l), nicho: l.nicho, quando: l.created_at }))
        .filter((x): x is { nivel: number; nicho: string | null; quando: string } => x.nivel !== null),
    },
    { key: "instagram", nome: "Instagram · Lista", sub: "Rodadas por concorrente", icone: Instagram, itens: daLista("instagram") },
    { key: "linkedin", nome: "LinkedIn · Lista", sub: "Aguardando a primeira coleta", icone: Linkedin, itens: daLista("linkedin") },
    { key: "ligacoes", nome: "Ligações · Lista", sub: "Empresa parceira, dados via webhook", icone: Phone, itens: daLista("ligacoes") },
    {
      key: "inbound",
      nome: "Inbound · Anúncios",
      sub: "Leads que vieram dos anúncios",
      icone: Megaphone,
      itens: contatos
        .filter((c) => c.tipo === "inbound" && !c.lixeira_em && !fonesLista.has(fim8(c.phone)))
        .map((c) => ({ nivel: nivelInbound(c), nicho: c.segmento, quando: c.created_at })),
    },
  ];
  const canais: Canal[] = brutos.map((c) => {
    const itens = c.itens.filter((i) => noPeriodo(i.quando) && doSegmento(i.nicho));
    return { ...c, itens, emBreve: c.key === "linkedin" && !listas.some((l) => l.lista === "linkedin") };
  });

  const funis = canais.map((c) => {
    const etapas = ETAPAS_FUNIL[c.key];
    const contagem = contarFunil(
      c.itens.map((i) => i.nivel),
      etapas.length,
    );
    return { canal: c, linhas: linhasFunil(c.key, contagem, metas) };
  });

  // Números grandes
  const mes = new Date();
  const inicioMes = new Date(mes.getFullYear(), mes.getMonth(), 1).toISOString();
  const vendasMes =
    leads.filter((l) => l.status_comercial === "ganho" && (l.updated_at ?? "") >= inicioMes).length +
    contatos.filter((c) => c.tipo === "inbound" && !c.lixeira_em && (c.funil_etapa === "ganho" || c.status === "cliente") && (c.updated_at ?? "") >= inicioMes).length +
    listas.filter((l) => l.etapa === "ganho" && l.atualizado_em >= inicioMes).length;
  const valorMes = listas.filter((l) => l.etapa === "ganho" && l.atualizado_em >= inicioMes).reduce((s, l) => s + Number(l.valor ?? 0), 0);
  const chegou = (key: string) =>
    funis.reduce((s, f) => s + (f.linhas.find((l) => l.key === key)?.valor ?? 0), 0);
  const agendadas = chegou("reuniao");
  const realizadas = chegou("reuniao_realizada");
  const naoRealizadas = Math.max(0, agendadas - realizadas);
  const pctNao = agendadas ? Math.round((naoRealizadas / agendadas) * 100) : 0;
  const topo = funis.reduce((s, f) => s + (f.linhas[0]?.valor ?? 0), 0);
  const vendas = chegou("ganho");
  const topoVenda = topo ? Math.round((vendas / topo) * 1000) / 10 : null;

  // Onde olhar primeiro
  const gargalos = funis
    .map((f) => ({ f, l: f.linhas.find((x) => x.estado === "gargalo") }))
    .filter((x): x is { f: (typeof funis)[number]; l: LinhaFunil } => !!x.l)
    .sort((a, b) => (b.l.meta! - b.l.conversao!) / b.l.meta! - (a.l.meta! - a.l.conversao!) / a.l.meta!);
  const semContato = (["instagram", "linkedin", "ligacoes"] as const)
    .map((k) => ({ k, n: listas.filter((l) => l.lista === k && l.etapa === "na_lista").length }))
    .filter((x) => x.n > 0);
  const pendentes = (ins?.insights ?? []).filter((i) => i.status === "pendente").length;
  const NOME_CURTO: Record<CanalFunil, string> = { google: "Google", instagram: "Instagram", linkedin: "LinkedIn", ligacoes: "Ligações", inbound: "Inbound" };

  // Rodadas do Instagram
  const rodadas = React.useMemo(() => {
    const m = new Map<string, ListaLead[]>();
    listas.filter((l) => l.lista === "instagram").forEach((l) => m.set(l.rodada ?? "Sem rodada", [...(m.get(l.rodada ?? "Sem rodada") ?? []), l]));
    const r = [...m.entries()].map(([nome, ls]) => {
      const niv = ls.map((l) => nivelLista(l));
      const abordados = niv.filter((n) => n >= 1).length;
      const responderam = niv.filter((n) => n >= 2).length;
      return {
        nome,
        leads: ls.length,
        quentes: ls.filter((l) => l.nota === "Quente").length,
        whats: ls.filter((l) => fim8(l.whatsapp)).length,
        resposta: abordados ? Math.round((responderam / abordados) * 100) : null,
        reunioes: niv.filter((n) => n >= 4).length,
        vendas: niv.filter((n) => n >= 7).length,
      };
    });
    return r.sort((a, b) => b.leads - a.leads);
  }, [listas]);
  const melhorRodada = [...rodadas].sort((a, b) => (b.reunioes - a.reunioes) || ((b.resposta ?? -1) - (a.resposta ?? -1)) || (b.quentes - a.quentes))[0];

  // Segmentos: de conversa para reunião, somando os canais
  const porSegmento = React.useMemo(() => {
    const m = new Map<string, { conversa: number; reuniao: number }>();
    for (const f of funis) {
      const iConv = ETAPAS_FUNIL[f.canal.key].findIndex((e) => e.key === "conversa");
      const iReu = ETAPAS_FUNIL[f.canal.key].findIndex((e) => e.key === "reuniao");
      for (const it of f.canal.itens) {
        const k = it.nicho?.trim() || "Sem segmento";
        const s = m.get(k) ?? { conversa: 0, reuniao: 0 };
        if (it.nivel >= iConv) s.conversa++;
        if (it.nivel >= iReu) s.reuniao++;
        m.set(k, s);
      }
    }
    return [...m.entries()]
      .filter(([, s]) => s.conversa >= 3)
      .map(([nome, s]) => ({ nome, pct: Math.round((s.reuniao / s.conversa) * 100), base: s.conversa }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 6);
  }, [funis]);
  const maxSeg = Math.max(1, ...porSegmento.map((s) => s.pct));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Rotulo className="mr-1">Período</Rotulo>
        {PERIODOS.map((p) => (
          <button
            key={p.l}
            onClick={() => setDias(p.v)}
            className={cn(
              "rounded-[8px] border px-3 py-1.5 text-[13px]",
              dias === p.v ? "border-primary-bright bg-primary-tint text-ink" : "border-border bg-surface text-muted hover:text-ink",
            )}
          >
            {p.l}
          </button>
        ))}
        <Rotulo className="ml-3 mr-1">Segmento</Rotulo>
        <select
          value={segmento}
          onChange={(e) => setSegmento(e.target.value)}
          className="rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[13px] text-ink"
        >
          <option value="">Todos</option>
          {segmentos.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Números do dono */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.5fr]">
        <Card className="border-positive/40 bg-[linear-gradient(160deg,rgba(47,210,127,.14),transparent_60%)] p-5">
          <Rotulo>Vendas no mês</Rotulo>
          <div className="mt-1 text-[28px] font-semibold leading-none text-positive">{vendasMes}</div>
          <div className="mt-2 text-[13px] text-muted">{valorMes > 0 ? `${valorMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} fechados` : "somando os canais"}</div>
          {metas && (
            <span
              className={cn(
                "mt-2 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-0.5 text-[13px] font-medium",
                vendasMes >= metas.vendas_mes ? "bg-positive-tint text-positive" : "bg-attention-tint text-attention",
              )}
            >
              <Target className="h-3.5 w-3.5" />
              {vendasMes >= metas.vendas_mes ? `meta ${metas.vendas_mes} batida` : `meta ${metas.vendas_mes} · faltam ${metas.vendas_mes - vendasMes}`}
            </span>
          )}
        </Card>
        <Card className="p-5">
          <Rotulo>Reuniões realizadas</Rotulo>
          <div className="mt-1 text-[28px] font-semibold leading-none">{realizadas}</div>
          <div className="mt-2 text-[13px] text-muted">de {agendadas} agendadas</div>
          {agendadas > 0 && metas && (
            <span
              className={cn(
                "mt-2 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-0.5 text-[13px] font-medium",
                pctNao > metas.faltas_max ? "bg-negative-tint text-negative" : "bg-positive-tint text-positive",
              )}
            >
              {pctNao > metas.faltas_max ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              {naoRealizadas} ainda não realizadas · meta até {metas.faltas_max}%
            </span>
          )}
        </Card>
        <Card className="p-5">
          <Rotulo>Do topo até a venda</Rotulo>
          <div className="mt-1 text-[28px] font-semibold leading-none">{fmtPct(topoVenda, 1)}</div>
          <div className="mt-2 text-[13px] text-muted">
            {vendas} {vendas === 1 ? "venda" : "vendas"} de {topo} leads no período
          </div>
          {metas && topoVenda != null && (
            <span
              className={cn(
                "mt-2 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-0.5 text-[13px] font-medium",
                topoVenda >= metas.topo_venda ? "bg-positive-tint text-positive" : "bg-attention-tint text-attention",
              )}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              meta {String(metas.topo_venda).replace(".", ",")}%{topoVenda >= metas.topo_venda ? " batida" : ""}
            </span>
          )}
        </Card>
        <Card className="border-negative/45 bg-[linear-gradient(160deg,rgba(255,107,129,.12),transparent_60%)] p-5">
          <Rotulo className="text-[#ffb3c0]">Onde olhar primeiro</Rotulo>
          <div className="mt-3 space-y-3 text-[14px] leading-snug">
            {gargalos.slice(0, 2).map(({ f, l }, i) => (
              <div key={f.canal.key} className="flex gap-2.5">
                <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", i === 0 ? "bg-negative" : "bg-attention")} />
                <div>
                  <b>
                    {NOME_CURTO[f.canal.key]}: só {fmtPct(l.conversao)} chegam em {l.label} (meta {l.meta}%).
                  </b>
                </div>
              </div>
            ))}
            {semContato.slice(0, 2).map((s) => (
              <button key={s.k} onClick={() => irPara("funil")} className="flex gap-2.5 text-left">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-attention" />
                <b>
                  {NOME_CURTO[s.k]}: {s.n} {s.n === 1 ? "lead ainda sem contato" : "leads ainda sem contato"}.
                </b>
              </button>
            ))}
            {pendentes > 0 && (
              <button onClick={() => irPara("insights")} className="flex gap-2.5 text-left text-primary-bright">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                <b>
                  {pendentes} {pendentes === 1 ? "insight da Gabi esperando" : "insights da Gabi esperando"} sua aprovação
                </b>
              </button>
            )}
            {!gargalos.length && !semContato.length && !pendentes && <div className="text-muted">Tudo dentro da meta no período.</div>}
          </div>
        </Card>
      </div>

      {/* Os 5 funis */}
      <div className="grid gap-4 xl:grid-cols-2">
        {funis.map(({ canal, linhas }) => {
          const venda = linhas[linhas.length - 1]?.valor ?? 0;
          const top = linhas[0]?.valor ?? 0;
          const Icone = canal.icone;
          return (
            <Card key={canal.key} className={cn("p-5", canal.emBreve && "opacity-50")}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5 text-[16px] font-semibold">
                    <Icone className="h-5 w-5 text-primary-bright" />
                    {canal.nome}
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted">{canal.sub}</div>
                </div>
                {canal.emBreve ? (
                  <span className="rounded-[8px] border border-border px-2 py-1 tabular-nums text-[12px] text-muted">Em breve</span>
                ) : (
                  <div className="text-right">
                    <div className="text-[28px] font-semibold leading-none text-positive">
                      {venda} {venda === 1 ? "venda" : "vendas"}
                    </div>
                    <div className="mt-1 text-[12px] text-muted">
                      {fmtPct(top ? Math.round((venda / top) * 1000) / 10 : null, 1)} {canal.key === "inbound" ? "dos leads" : "da lista"}
                    </div>
                  </div>
                )}
              </div>
              <FunilGrafico linhas={linhas} apagado={canal.emBreve || top === 0} />
            </Card>
          );
        })}
        <Card className="p-5">
          <Rotulo>Como ler os funis</Rotulo>
          <div className="mt-4 space-y-4 text-[13px]">
            <Legenda cor="bg-[linear-gradient(90deg,#ff6b81,#ffb35c)]" titulo="Gargalo" texto="A etapa mais longe da meta. É onde agir primeiro." />
            <Legenda cor="bg-attention" titulo="Abaixo da meta" texto="Número em laranja, ao lado da meta da etapa." />
            <Legenda cor="bg-positive" titulo="Venda" texto="O resultado final de cada canal, no canto do funil." />
            <button onClick={() => irPara("config")} className="flex gap-3 text-left">
              <Settings className="mt-0.5 h-4 w-4 shrink-0 text-primary-bright" />
              <span>
                <b>Metas editáveis</b>
                <span className="block text-muted">Em Configurações, por canal e por etapa.</span>
              </span>
            </button>
          </div>
        </Card>
      </div>

      {/* Rodadas e segmentos */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <Rotulo>Rodadas do Instagram</Rotulo>
          <div className="mb-4 mt-1 text-[16px] font-semibold">Qual concorrente traz lead melhor</div>
          {rodadas.length === 0 ? (
            <div className="text-[13px] text-muted">Nenhuma rodada importada ainda. Use "Nova rodada" na aba Funil.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rodadas.slice(0, 4).map((r) => {
                const melhor = rodadas.length > 1 && r.nome === melhorRodada?.nome;
                return (
                  <div key={r.nome} className={cn("rounded-[12px] border bg-surface-2 p-4", melhor ? "border-positive/45" : "border-border")}>
                    <div className="flex items-center justify-between text-[14px] font-semibold">
                      {r.nome}
                      {melhor && <span className="rounded-full bg-positive-tint px-2 py-0.5 text-[12px] text-positive">Melhor</span>}
                    </div>
                    <div className={cn("mt-2 text-[28px] font-semibold leading-none", melhor && "text-positive")}>{r.leads}</div>
                    <div className="mt-1 text-[12px] text-muted">leads coletados</div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
                      <span>
                        <b className="text-ink">{r.quentes}</b> quentes
                      </span>
                      <span>
                        <b className="text-ink">{r.whats}</b> com WhatsApp
                      </span>
                      <span>
                        <b className="text-ink">{fmtPct(r.resposta)}</b> resposta
                      </span>
                      <span>
                        <b className="text-ink">{r.reunioes}</b> reuniões
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <Rotulo>Segmentos · todos os canais</Rotulo>
          <div className="mb-4 mt-1 text-[16px] font-semibold">Onde a conversa vira reunião</div>
          {porSegmento.length === 0 ? (
            <div className="text-[13px] text-muted">Ainda não há conversas suficientes por segmento no período.</div>
          ) : (
            porSegmento.map((s, i) => {
              const top = i === 0;
              const baixo = i === porSegmento.length - 1 && porSegmento.length > 2;
              return (
                <div key={s.nome} className="mb-2.5 grid grid-cols-[150px_1fr_86px] items-center gap-3 text-[14px]">
                  <span className="truncate">{s.nome}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-primary-tint/40">
                    <i
                      className={cn("block h-full rounded-full", top ? "bg-positive" : baixo ? "bg-negative" : "bg-primary-bright/60")}
                      style={{ width: `${Math.max(4, (s.pct / maxSeg) * 100)}%` }}
                    />
                  </div>
                  <span className={cn("text-right tabular-nums text-[12px]", top ? "text-positive" : baixo ? "text-negative" : "text-muted")}>
                    {s.pct}% · {s.base}
                  </span>
                </div>
              );
            })
          )}
        </Card>
      </div>
    </div>
  );
}

function Legenda({ cor, titulo, texto }: { cor: string; titulo: string; texto: string }) {
  return (
    <div className="flex gap-3">
      <i className={cn("mt-1 inline-block h-3 w-3 shrink-0 rounded-[6px]", cor)} />
      <span>
        <b>{titulo}</b>
        <span className="block text-muted">{texto}</span>
      </span>
    </div>
  );
}
