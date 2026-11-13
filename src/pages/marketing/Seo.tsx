import * as React from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { KpiCard } from "@/components/shared/KpiCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { useAuth } from "@/hooks/useAuth";
import { chamarSdr } from "@/hooks/useProspeccao";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * SEO e orgânico · como o site é encontrado.
 *  - Google: palavras-chave, posição, impressões e cliques (Google Search Console, sincronizado todo dia).
 *  - Origem das visitas: de onde vêm as visitas do site e do diagnóstico (rastreador próprio, lp_eventos).
 *  - Presença nas IAs: toda segunda o sistema pergunta ao ChatGPT e registra se a DemandIA foi citada.
 *  - Em cada palavra: posição média e em que página do Google o site aparece; palavras-alvo fixas e o plano
 *    da semana (o que fazer para subir), gerado toda segunda pelo servidor da Ana.
 * Só o dono vê. Dados pelas funções seo_resumo, seo_origens, seo_ia_resumo (0033) e seo_ranking (0034).
 */

const PERIODOS = [
  { dias: 7, label: "7 dias" },
  { dias: 28, label: "28 dias" },
  { dias: 90, label: "3 meses" },
];

interface Consulta {
  consulta: string;
  cliques: number;
  impressoes: number;
  ctr: number | null;
  posicao: number | null;
  posicao_ant: number | null;
}
interface ResumoGoogle {
  conectado: boolean;
  ultimo_dia: string | null;
  de?: string;
  ate?: string;
  cliques?: number;
  impressoes?: number;
  posicao?: number | null;
  cliques_ant?: number;
  impressoes_ant?: number;
  posicao_ant?: number | null;
  palavras?: number;
  por_dia?: { dia: string; cliques: number; impressoes: number; posicao: number | null }[];
  consultas?: Consulta[];
  paginas?: { pagina: string; cliques: number; impressoes: number; ctr: number | null; posicao: number | null }[];
}
interface Alvo {
  id: string;
  palavra: string;
  ativa: boolean;
  cliques: number;
  impressoes: number;
  posicao: number | null;
  posicao_ant: number | null;
  pagina_google: number | null;
  busca: string | null;
  buscas: number;
}
interface ItemPlano {
  prioridade: "alta" | "média" | "baixa";
  titulo: string;
  porque: string;
  como: string[];
  pagina?: string;
  palavra?: string;
}
interface Ranking {
  de: string;
  ate: string;
  tem_dados: boolean;
  alvos: Alvo[];
  oportunidades: { consulta: string; impressoes: number; cliques: number; posicao: number; pagina_google: number; pagina: string | null }[];
  plano: { criado_em: string; resumo: string | null; itens: ItemPlano[] } | null;
}
interface Origens {
  visitas_site: number;
  visitantes_site: number;
  visitas_diagnostico: number;
  cliques_diagnostico: number;
  cliques_whatsapp: number;
  diagnosticos: number;
  origens: { origem: string; site: number; diagnostico: number; cliques_diag: number; cliques_wa: number; envios: number }[];
  por_dia: { dia: string; site: number; diagnostico: number; envios: number }[];
}
interface PerguntaIA {
  id: string;
  pergunta: string;
  ativa: boolean;
  citou: boolean | null;
  quando: string | null;
  posicao: number | null;
  fontes: string[] | null;
  resposta: string | null;
  vezes: number;
  citou_vezes: number;
}
interface ResumoIA {
  ultima_checagem: string | null;
  checagens: number;
  citacoes: number;
  perguntas: PerguntaIA[];
  fontes: { site: string; vezes: number }[];
}

const num = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("pt-BR"));
const dec = (n: number | null | undefined) => (n == null ? "–" : String(n).replace(".", ","));
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const fmtPct = (v: number) => `${String(v).replace(".", ",")}%`;
const dataBR = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR") : "–");

function variacao(atual: number, antes: number) {
  if (!antes) return atual ? "novo" : "sem dados antes";
  const v = Math.round(((atual - antes) / antes) * 100);
  return `${v >= 0 ? "+" : ""}${v}% vs período anterior`;
}

/** Nome amigável de cada origem que o rastreador registra. */
function nomeOrigem(o: string) {
  const m: Record<string, string> = {
    google: "Google (orgânico)",
    "google (anúncio)": "Google Ads",
    instagram: "Instagram",
    "instagram/facebook": "Instagram / Facebook",
    facebook: "Facebook",
    chatgpt: "ChatGPT",
    perplexity: "Perplexity",
    gemini: "Gemini",
    "bing/copilot": "Bing / Copilot",
    claude: "Claude",
    linkedin: "LinkedIn",
    youtube: "YouTube",
    whatsapp: "WhatsApp",
    direto: "Direto (digitou o endereço ou link salvo)",
  };
  if (m[o]) return m[o];
  if (o.endsWith(" (anúncio)")) return `${o.replace(" (anúncio)", "")} (anúncio)`;
  return o;
}

function useResumoGoogle(dias: number) {
  return useQuery({
    queryKey: ["seo_resumo", dias],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("seo_resumo", { p_dias: dias });
      if (error) throw error;
      return data as ResumoGoogle;
    },
  });
}
function useRanking(dias: number) {
  return useQuery({
    queryKey: ["seo_ranking", dias],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("seo_ranking", { p_dias: dias });
      if (error) throw error;
      return data as Ranking;
    },
  });
}
function useOrigens(dias: number) {
  return useQuery({
    queryKey: ["seo_origens", dias],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("seo_origens", { p_dias: dias });
      if (error) throw error;
      return data as Origens;
    },
  });
}
function useResumoIA() {
  return useQuery({
    queryKey: ["seo_ia_resumo"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("seo_ia_resumo");
      if (error) throw error;
      return data as ResumoIA;
    },
  });
}

export default function Seo() {
  const { isColaborador } = useAuth();
  const [dias, setDias] = React.useState(28);
  if (isColaborador) return <Navigate to="/" replace />;

  return (
    <section>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[21px] font-semibold">SEO e orgânico</div>
          <div className="mt-1 text-[13px] text-muted">
            Como as pessoas encontram o demandhub.com.br: no Google, nas redes, no ChatGPT e em outras IAs.
          </div>
        </div>
        <div className="flex gap-1.5 rounded-[10px] border border-border bg-surface p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setDias(p.dias)}
              className={cn(
                "rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                dias === p.dias ? "bg-primary text-white" : "text-muted hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="google">
        <TabsList>
          <TabsTrigger value="google">Google</TabsTrigger>
          <TabsTrigger value="origens">Origem das visitas</TabsTrigger>
          <TabsTrigger value="ia">Presença nas IAs</TabsTrigger>
        </TabsList>
        <TabsContent value="google">
          <AbaGoogle dias={dias} />
        </TabsContent>
        <TabsContent value="origens">
          <AbaOrigens dias={dias} />
        </TabsContent>
        <TabsContent value="ia">
          <AbaIA />
        </TabsContent>
      </Tabs>
    </section>
  );
}

/* ---------------------------------- Google ---------------------------------- */

function AbaGoogle({ dias }: { dias: number }) {
  const q = useResumoGoogle(dias);
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [busca, setBusca] = React.useState("");

  const conectar = async () => {
    const aba = window.open("about:blank", "_blank");
    try {
      const { url } = await chamarSdr<{ url: string }>("/api/seo", { acao: "conectar" });
      if (aba) aba.location.href = url;
      else window.location.href = url;
    } catch (e) {
      aba?.close();
      showToast(`Não deu: ${(e as Error).message}`);
    }
  };
  const sincronizar = useMutation({
    mutationFn: () => chamarSdr<{ linhas: number; de: string; ate: string }>("/api/seo", { acao: "sincronizar" }),
    onSuccess: (r) => {
      showToast(`Google atualizado: ${r.linhas} linhas de ${dataBR(r.de)} a ${dataBR(r.ate)}.`);
      qc.invalidateQueries({ queryKey: ["seo_resumo"] });
    },
    onError: (e) => showToast(`Não deu: ${(e as Error).message}`),
  });

  if (q.isError) return <EmptyState>Não deu para carregar. Confira se a migração 0033 já foi rodada no banco.</EmptyState>;
  if (!q.data) return <EmptyState>Carregando…</EmptyState>;
  const r = q.data;

  if (!r.conectado) {
    return (
      <>
      <Card className="mb-[22px] p-6 px-[22px]">
        <div className="text-[15px] font-semibold">Conectar o Google Search Console</div>
        <div className="mt-1.5 max-w-[640px] text-[13px] text-muted">
          É de onde vêm as palavras-chave, a posição do site no Google, as impressões e os cliques. Clique no botão, entre com a conta{" "}
          <b className="text-ink">demandhubtec@gmail.com</b> e autorize. A partir daí o portal atualiza sozinho todo dia, com os últimos 3 meses já de início.
        </div>
        <Button className="mt-4" onClick={conectar}>
          Conectar Google Search Console
        </Button>
      </Card>
      <RankingEPlano dias={dias} />
      </>
    );
  }

  if (!r.ultimo_dia) {
    return (
      <>
      <Card className="mb-[22px] p-6 px-[22px]">
        <div className="text-[15px] font-semibold">Google conectado</div>
        <div className="mt-1.5 max-w-[640px] text-[13px] text-muted">
          Ainda não há dados guardados. O Google costuma mostrar os primeiros números alguns dias depois que o site é verificado. Dá para puxar agora:
        </div>
        <Button className="mt-4" onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
          {sincronizar.isPending ? "Buscando no Google…" : "Buscar dados agora"}
        </Button>
      </Card>
      <RankingEPlano dias={dias} />
      </>
    );
  }

  const ctr = pct(r.cliques ?? 0, r.impressoes ?? 0);
  const consultas = (r.consultas ?? []).filter((c) => !busca || c.consulta.toLowerCase().includes(busca.toLowerCase()));
  const top10 = (r.consultas ?? []).filter((c) => (c.posicao ?? 99) <= 10).length;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span>
          De {dataBR(r.de)} a {dataBR(r.ate)} · o Google entrega os números com 2 a 3 dias de atraso
        </span>
        <Button variant="ghost" size="sm" onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
          {sincronizar.isPending ? "Atualizando…" : "Atualizar agora"}
        </Button>
      </div>

      <div className="mb-[22px] grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        <KpiCard index={0} label="Cliques do Google" value={num(r.cliques)} delta={variacao(r.cliques ?? 0, r.cliques_ant ?? 0)} accent="positive" />
        <KpiCard index={1} label="Impressões" value={num(r.impressoes)} delta={variacao(r.impressoes ?? 0, r.impressoes_ant ?? 0)} />
        <KpiCard index={2} label="CTR" value={fmtPct(ctr)} delta="cliques ÷ impressões" />
        <KpiCard
          index={3}
          label="Posição média"
          value={dec(r.posicao)}
          delta={r.posicao_ant != null && r.posicao != null ? `antes ${dec(r.posicao_ant)} (menor é melhor)` : "menor é melhor"}
          deltaClass={r.posicao_ant != null && r.posicao != null && r.posicao > r.posicao_ant ? "warn" : "up"}
        />
        <KpiCard index={4} label="Palavras-chave" value={num(r.palavras)} delta={`${top10} na 1ª página`} />
      </div>

      <RankingEPlano dias={dias} />

      <Card className="mb-[22px] p-5 px-[22px]">
        <div className="text-sm font-semibold">Cliques e impressões por dia</div>
        <div className="mb-3 mt-0.5 text-[11.5px] text-muted">Barras: impressões (quantas vezes o site apareceu) · linha: cliques</div>
        <GraficoDias pontos={(r.por_dia ?? []).map((d) => ({ dia: d.dia, barra: d.impressoes, linha: d.cliques }))} />
      </Card>

      <div className="grid grid-cols-1 gap-3.5 2xl:grid-cols-[1.5fr_1fr]">
        <Card className="p-5 px-[22px]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Palavras-chave</div>
              <div className="mt-0.5 text-[11.5px] text-muted">O que as pessoas buscaram quando o site apareceu no Google</div>
            </div>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar palavra…" className="h-8 w-[200px] text-[12.5px]" />
          </div>
          <div className="mt-3">
            {consultas.length === 0 ? (
              <EmptyState>Nenhuma palavra-chave no período.</EmptyState>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Palavra-chave</Th>
                    <Th>Cliques</Th>
                    <Th>Impressões</Th>
                    <Th>CTR</Th>
                    <Th>Posição</Th>
                    <Th>Página do Google</Th>
                  </tr>
                </thead>
                <tbody>
                  {consultas.map((c) => (
                    <tr key={c.consulta}>
                      <Td wrap>{c.consulta}</Td>
                      <Td>{num(c.cliques)}</Td>
                      <Td>{num(c.impressoes)}</Td>
                      <Td>{c.ctr == null ? "–" : fmtPct(c.ctr)}</Td>
                      <Td>
                        <Posicao atual={c.posicao} antes={c.posicao_ant} />
                      </Td>
                      <Td>
                        <PaginaGoogle posicao={c.posicao} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        </Card>
        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Páginas que aparecem</div>
          <div className="mb-3 mt-0.5 text-[11.5px] text-muted">Qual página do site o Google mostrou</div>
          {(r.paginas ?? []).length === 0 ? (
            <EmptyState>Nenhuma página no período.</EmptyState>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Página</Th>
                  <Th>Cliques</Th>
                  <Th>Impr.</Th>
                  <Th>Posição</Th>
                  <Th>Página</Th>
                </tr>
              </thead>
              <tbody>
                {(r.paginas ?? []).map((p) => (
                  <tr key={p.pagina}>
                    <Td wrap>
                      <a href={p.pagina} target="_blank" rel="noreferrer" className="break-all hover:text-primary-bright">
                        {p.pagina.replace(/^https?:\/\/(www\.)?demandhub\.com\.br/, "") || "/"}
                      </a>
                    </Td>
                    <Td>{num(p.cliques)}</Td>
                    <Td>{num(p.impressoes)}</Td>
                    <Td>{dec(p.posicao)}</Td>
                    <Td>
                      <PaginaGoogle posicao={p.posicao} curto />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}

/** Em que página do Google a posição cai (posição 1 a 10 = 1ª página, 11 a 20 = 2ª...). */
function PaginaGoogle({ posicao, curto }: { posicao: number | null; curto?: boolean }) {
  if (posicao == null) return <span className="text-[11.5px] text-muted">{curto ? "–" : "ainda não aparece"}</span>;
  const pg = Math.max(1, Math.ceil(posicao / 10));
  const cls =
    pg === 1 ? "bg-positive-tint text-positive" : pg === 2 ? "bg-amber-500/15 text-amber-300" : "bg-surface-2 text-muted";
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{curto ? `${pg}ª` : `${pg}ª página`}</span>;
}

const COR_PRIORIDADE: Record<string, string> = {
  alta: "bg-negative-tint text-negative",
  média: "bg-amber-500/15 text-amber-300",
  baixa: "bg-surface-2 text-muted",
};

/** Palavras-alvo (onde o site está no Google), oportunidades perto da 1ª página e o plano da semana. */
function RankingEPlano({ dias }: { dias: number }) {
  const q = useRanking(dias);
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [nova, setNova] = React.useState("");
  const recarregar = () => qc.invalidateQueries({ queryKey: ["seo_ranking"] });

  const plano = useMutation({
    mutationFn: () => chamarSdr<{ itens: number }>("/api/seo", { acao: "plano" }),
    onSuccess: (r) => {
      showToast(`Plano da semana pronto: ${r.itens} ações.`);
      recarregar();
    },
    onError: (e) => showToast(`Não deu: ${(e as Error).message}`),
  });
  const adicionar = useMutation({
    mutationFn: async (palavra: string) => {
      const { error } = await supabase.from("seo_palavras_alvo").insert({ palavra: palavra.toLowerCase() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNova("");
      recarregar();
    },
    onError: (e) => showToast(`Não deu: ${(e as Error).message}`),
  });
  const alternar = useMutation({
    mutationFn: async (a: Alvo) => {
      const { error } = await supabase.from("seo_palavras_alvo").update({ ativa: !a.ativa }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: recarregar,
  });

  if (q.isError) return <EmptyState>Não deu para carregar o ranking. Confira se a migração 0034 já foi rodada no banco.</EmptyState>;
  if (!q.data) return null;
  const r = q.data;
  const ativas = r.alvos.filter((a) => a.ativa);
  const naPrimeira = ativas.filter((a) => a.pagina_google === 1).length;

  return (
    <>
      <Card className="mb-[22px] p-5 px-[22px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Palavras-alvo: onde o site aparece no Google</div>
            <div className="mt-0.5 text-[11.5px] text-muted">
              Posição média e página do Google ({r.tem_dados ? `${dataBR(r.de)} a ${dataBR(r.ate)}` : "ainda sem dados do Google"}) ·{" "}
              {naPrimeira} de {ativas.length} na 1ª página · posição 1 a 10 = 1ª página, 11 a 20 = 2ª página
            </div>
          </div>
        </div>
        <div className="mt-3">
          <TableWrap>
            <thead>
              <tr>
                <Th>Palavra-alvo</Th>
                <Th>Página do Google</Th>
                <Th>Posição</Th>
                <Th>Impressões</Th>
                <Th>Cliques</Th>
                <Th>Busca que mais aparece</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {r.alvos.map((a) => (
                <tr key={a.id} className={cn(!a.ativa && "opacity-50")}>
                  <Td wrap>
                    <span className="font-medium">{a.palavra}</span>
                  </Td>
                  <Td>
                    <PaginaGoogle posicao={a.posicao} />
                  </Td>
                  <Td>
                    <Posicao atual={a.posicao} antes={a.posicao_ant} />
                  </Td>
                  <Td>{num(a.impressoes)}</Td>
                  <Td>{num(a.cliques)}</Td>
                  <Td wrap>
                    <span className="text-[12px] text-muted">{a.busca ? (a.buscas > 1 ? `${a.busca} (+${a.buscas - 1})` : a.busca) : "–"}</span>
                  </Td>
                  <Td>
                    <button className="text-[11.5px] text-muted hover:text-foreground" onClick={() => alternar.mutate(a)}>
                      {a.ativa ? "Pausar" : "Voltar"}
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nova.trim().length > 2) adicionar.mutate(nova.trim());
          }}
        >
          <Input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova palavra-alvo, do jeito que o cliente busca no Google (ex.: crm para clínicas)" />
          <Button type="submit" variant="ghost" disabled={adicionar.isPending || nova.trim().length <= 2}>
            Adicionar
          </Button>
        </form>
      </Card>

      <div className="mb-[22px] grid grid-cols-1 gap-3.5 2xl:grid-cols-[1.5fr_1fr]">
        <Card className="p-5 px-[22px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">O que fazer para subir no Google e nas IAs</div>
              <div className="mt-0.5 text-[11.5px] text-muted">
                Toda segunda o sistema analisa as posições, as palavras-alvo, o site e o ChatGPT e monta as ações da semana.
                {r.plano ? ` Último plano: ${dataBR(r.plano.criado_em)}.` : ""}
              </div>
            </div>
            <Button size="sm" onClick={() => plano.mutate()} disabled={plano.isPending}>
              {plano.isPending ? "Analisando…" : r.plano ? "Gerar de novo" : "Gerar plano agora"}
            </Button>
          </div>
          {!r.plano ? (
            <div className="mt-3">
              <EmptyState>Ainda sem plano. Clique em "Gerar plano agora" (leva uns 30 segundos).</EmptyState>
            </div>
          ) : (
            <>
              {r.plano.resumo && <div className="mt-3 text-[13px] leading-relaxed">{r.plano.resumo}</div>}
              <div className="mt-3 flex flex-col gap-2.5">
                {r.plano.itens.map((it, i) => (
                  <div key={i} className="rounded-[10px] border border-border p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[13.5px] font-semibold">
                        {i + 1}. {it.titulo}
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", COR_PRIORIDADE[it.prioridade] ?? COR_PRIORIDADE.média)}>
                        {it.prioridade}
                      </span>
                    </div>
                    <div className="mt-1 text-[12.5px] text-muted">{it.porque}</div>
                    {it.como.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px]">
                        {it.como.map((c, j) => (
                          <li key={j}>{c}</li>
                        ))}
                      </ul>
                    )}
                    {(it.palavra || it.pagina) && (
                      <div className="mt-2 text-[11.5px] text-muted">
                        {it.palavra && <>Palavra: <b className="text-ink">{it.palavra}</b></>}
                        {it.palavra && it.pagina && " · "}
                        {it.pagina && <>Página: {it.pagina.replace(/^https?:\/\/(www\.)?demandhub\.com\.br/, "") || "/"}</>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Quase na 1ª página</div>
          <div className="mb-3 mt-0.5 text-[11.5px] text-muted">
            Buscas entre a posição 4 e 20. São as que mais valem o esforço: subir poucas posições já traz cliques.
          </div>
          {r.oportunidades.length === 0 ? (
            <EmptyState>{r.tem_dados ? "Nenhuma busca nessa faixa no período." : "Aparece aqui quando o Google começar a mostrar dados."}</EmptyState>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Busca</Th>
                  <Th>Posição</Th>
                  <Th>Impr.</Th>
                </tr>
              </thead>
              <tbody>
                {r.oportunidades.map((o) => (
                  <tr key={o.consulta}>
                    <Td wrap>{o.consulta}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        {dec(o.posicao)} <PaginaGoogle posicao={o.posicao} curto />
                      </span>
                    </Td>
                    <Td>{num(o.impressoes)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}

function Posicao({ atual, antes }: { atual: number | null; antes: number | null }) {
  if (atual == null) return <>–</>;
  const d = antes == null ? null : Math.round((antes - atual) * 10) / 10; // positivo = subiu
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("font-semibold", atual <= 3 ? "text-positive" : atual <= 10 ? "text-ink" : "text-muted")}>{dec(atual)}</span>
      {d != null && d !== 0 && (
        <span className={cn("text-[11px]", d > 0 ? "text-positive" : "text-negative")}>
          {d > 0 ? "▲" : "▼"} {dec(Math.abs(d))}
        </span>
      )}
    </span>
  );
}

/** Barras (valor principal) + linha (valor secundário) por dia, em SVG simples. */
function GraficoDias({ pontos }: { pontos: { dia: string; barra: number; linha: number }[] }) {
  if (pontos.length === 0) return <EmptyState>Sem dados no período.</EmptyState>;
  const W = 900;
  const H = 180;
  const maxB = Math.max(...pontos.map((p) => p.barra), 1);
  const maxL = Math.max(...pontos.map((p) => p.linha), 1);
  const w = W / pontos.length;
  const linha = pontos
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i + 0.5) * w},${H - 20 - (p.linha / maxL) * (H - 40)}`)
    .join(" ");
  const marcas = pontos.length > 14 ? Math.ceil(pontos.length / 8) : 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[190px] w-full" preserveAspectRatio="none">
      {pontos.map((p, i) => {
        const h = (p.barra / maxB) * (H - 40);
        return (
          <g key={p.dia}>
            <rect x={i * w + w * 0.18} y={H - 20 - h} width={w * 0.64} height={Math.max(h, 1)} rx={2} fill="var(--primary-tint)">
              <title>{`${dataBR(p.dia)}: ${p.barra} impressões, ${p.linha} cliques`}</title>
            </rect>
            {i % marcas === 0 && (
              <text x={(i + 0.5) * w} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {p.dia.slice(8, 10)}/{p.dia.slice(5, 7)}
              </text>
            )}
          </g>
        );
      })}
      <path d={linha} fill="none" stroke="var(--positive)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ------------------------------ Origem das visitas ------------------------------ */

function AbaOrigens({ dias }: { dias: number }) {
  const q = useOrigens(dias);
  if (q.isError) return <EmptyState>Não deu para carregar. Confira se a migração 0033 já foi rodada no banco.</EmptyState>;
  if (!q.data) return <EmptyState>Carregando…</EmptyState>;
  const r = q.data;
  const conv = pct(r.diagnosticos, r.visitas_site + r.visitas_diagnostico);

  return (
    <>
      <div className="mb-[22px] grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        <KpiCard index={0} label="Visitas no site" value={num(r.visitas_site)} delta={`${num(r.visitantes_site)} pessoas`} />
        <KpiCard index={1} label="Cliques para o diagnóstico" value={num(r.cliques_diagnostico)} delta={fmtPct(pct(r.cliques_diagnostico, r.visitas_site)) + " das visitas do site"} />
        <KpiCard index={2} label="Cliques no WhatsApp" value={num(r.cliques_whatsapp)} delta="a partir do site" />
        <KpiCard index={3} label="Visitas no diagnóstico" value={num(r.visitas_diagnostico)} />
        <KpiCard index={4} label="Diagnósticos enviados" value={num(r.diagnosticos)} delta={`${fmtPct(conv)} das visitas`} accent="positive" />
      </div>

      <Card className="mb-[22px] p-5 px-[22px]">
        <div className="text-sm font-semibold">Visitas por dia</div>
        <div className="mb-3 mt-0.5 text-[11.5px] text-muted">Barras: visitas (site + diagnóstico) · linha: diagnósticos enviados</div>
        <GraficoDias pontos={r.por_dia.map((d) => ({ dia: d.dia, barra: d.site + d.diagnostico, linha: d.envios }))} />
      </Card>

      <Card className="p-5 px-[22px]">
        <div className="text-sm font-semibold">De onde vêm as visitas</div>
        <div className="mb-3 mt-0.5 text-[11.5px] text-muted">
          Origem da primeira página vista em cada visita. Google orgânico, Instagram, ChatGPT e outras IAs aparecem separados; anúncios com UTM aparecem como "(anúncio)".
        </div>
        {r.origens.length === 0 ? (
          <EmptyState>Ainda sem visitas no período.</EmptyState>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Origem</Th>
                <Th>Visitas no site</Th>
                <Th>Visitas no diagnóstico</Th>
                <Th>Cliques p/ diagnóstico</Th>
                <Th>Cliques WhatsApp</Th>
                <Th>Diagnósticos</Th>
              </tr>
            </thead>
            <tbody>
              {r.origens.map((o) => (
                <tr key={o.origem}>
                  <Td wrap>{nomeOrigem(o.origem)}</Td>
                  <Td>{num(o.site)}</Td>
                  <Td>{num(o.diagnostico)}</Td>
                  <Td>{num(o.cliques_diag)}</Td>
                  <Td>{num(o.cliques_wa)}</Td>
                  <Td>{o.envios > 0 ? <span className="font-semibold text-positive">{o.envios}</span> : "0"}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

/* ------------------------------ Presença nas IAs ------------------------------ */

function AbaIA() {
  const q = useResumoIA();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [nova, setNova] = React.useState("");
  const [aberta, setAberta] = React.useState<string | null>(null);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["seo_ia_resumo"] });
  const checar = useMutation({
    mutationFn: (perguntaId?: string) => chamarSdr<{ checadas: number; citada_em: number }>("/api/seo", { acao: "checar_ia", pergunta_id: perguntaId }),
    onSuccess: (r) => {
      showToast(`Checagem feita: citada em ${r.citada_em} de ${r.checadas} pergunta(s).`);
      recarregar();
    },
    onError: (e) => showToast(`Não deu: ${(e as Error).message}`),
  });
  const adicionar = useMutation({
    mutationFn: async (pergunta: string) => {
      const { error } = await supabase.from("seo_ia_perguntas").insert({ pergunta });
      if (error) throw error;
    },
    onSuccess: () => {
      setNova("");
      recarregar();
    },
    onError: (e) => showToast(`Não deu: ${(e as Error).message}`),
  });
  const alternar = useMutation({
    mutationFn: async (p: PerguntaIA) => {
      const { error } = await supabase.from("seo_ia_perguntas").update({ ativa: !p.ativa }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: recarregar,
  });

  if (q.isError) return <EmptyState>Não deu para carregar. Confira se a migração 0033 já foi rodada no banco.</EmptyState>;
  if (!q.data) return <EmptyState>Carregando…</EmptyState>;
  const r = q.data;
  const ativas = r.perguntas.filter((p) => p.ativa);
  const citadasAgora = ativas.filter((p) => p.citou).length;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span>
          Toda segunda, de manhã, o sistema faz estas perguntas ao ChatGPT (com busca na internet) e registra se a DemandIA foi citada.
          {r.ultima_checagem ? ` Última checagem: ${dataBR(r.ultima_checagem)}.` : " Ainda não houve checagem."}
        </span>
        <Button size="sm" onClick={() => checar.mutate(undefined)} disabled={checar.isPending}>
          {checar.isPending ? "Perguntando ao ChatGPT…" : "Checar agora"}
        </Button>
      </div>

      <div className="mb-[22px] grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KpiCard index={0} label="Citada agora" value={`${citadasAgora} de ${ativas.length}`} delta="perguntas na última checagem" accent="positive" />
        <KpiCard index={1} label="Taxa de citação" value={fmtPct(pct(r.citacoes, r.checagens))} delta="últimas 8 semanas" />
        <KpiCard index={2} label="Checagens" value={num(r.checagens)} delta="últimas 8 semanas" />
        <KpiCard index={3} label="Sites mais usados de fonte" value={r.fontes[0]?.site ?? "–"} delta={r.fontes[0] ? `${r.fontes[0].vezes} vezes` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Perguntas monitoradas</div>
          <div className="mb-3 mt-0.5 text-[11.5px] text-muted">Clique numa pergunta para ver o que o ChatGPT respondeu da última vez</div>
          <div className="flex flex-col gap-2">
            {r.perguntas.map((p) => (
              <div key={p.id} className={cn("rounded-[10px] border border-border p-3", !p.ativa && "opacity-55")}>
                <div className="flex items-start justify-between gap-3">
                  <button className="text-left text-[13px] font-medium hover:text-primary-bright" onClick={() => setAberta(aberta === p.id ? null : p.id)}>
                    {p.pergunta}
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.citou == null ? (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">sem checagem</span>
                    ) : p.citou ? (
                      <span className="rounded-full bg-positive-tint px-2 py-0.5 text-[11px] font-semibold text-positive">citada</span>
                    ) : (
                      <span className="rounded-full bg-negative-tint px-2 py-0.5 text-[11px] font-semibold text-negative">não citada</span>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[11.5px] text-muted">
                  {p.quando ? `Checada em ${dataBR(p.quando)}` : "Ainda não checada"} · citada em {p.citou_vezes} de {p.vezes} checagem(ns) nas últimas 8 semanas
                </div>
                {aberta === p.id && (
                  <div className="mt-3 border-t border-border pt-3">
                    {p.fontes && p.fontes.length > 0 && (
                      <div className="mb-2 text-[11.5px] text-muted">Fontes usadas: {p.fontes.join(", ")}</div>
                    )}
                    <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed">{p.resposta ?? "Sem resposta guardada."}</div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => checar.mutate(p.id)} disabled={checar.isPending}>
                        Checar só esta
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => alternar.mutate(p)}>
                        {p.ativa ? "Pausar" : "Voltar a monitorar"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (nova.trim().length > 8) adicionar.mutate(nova.trim());
            }}
          >
            <Input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova pergunta, do jeito que um empresário perguntaria ao ChatGPT" />
            <Button type="submit" variant="ghost" disabled={adicionar.isPending || nova.trim().length <= 8}>
              Adicionar
            </Button>
          </form>
        </Card>

        <Card className="p-5 px-[22px]">
          <div className="text-sm font-semibold">Quem o ChatGPT usa de fonte</div>
          <div className="mb-3 mt-0.5 text-[11.5px] text-muted">Sites citados nas respostas nas últimas 8 semanas. São os concorrentes na briga por aparecer nas IAs.</div>
          {r.fontes.length === 0 ? (
            <EmptyState>Ainda sem checagens.</EmptyState>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Site</Th>
                  <Th>Vezes</Th>
                </tr>
              </thead>
              <tbody>
                {r.fontes.map((f) => (
                  <tr key={f.site}>
                    <Td wrap>
                      <span className={cn(f.site.includes("demandhub.com.br") && "font-semibold text-positive")}>{f.site}</span>
                    </Td>
                    <Td>{f.vezes}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
