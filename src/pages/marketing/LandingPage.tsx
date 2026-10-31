import * as React from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/KpiCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Landing page · análise própria (nosso "Clarity"): visitas, funil do formulário,
 * rolagem por seção, origem, cliques e mapa de calor da /diagnostico.
 * Os dados vêm de lp_eventos (rastreador anônimo da página) pelas funções
 * lp_resumo e lp_cliques, que só respondem para o dono.
 */

const LP_URL = "https://demandhub.com.br/diagnostico?nolog=1";
const PERIODOS = [
  { dias: 1, label: "Hoje" },
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
];
const TELAS = {
  mobile: { label: "Celular", largura: 390, altura: 10600 },
  desktop: { label: "Computador", largura: 1280, altura: 7400 },
} as const;
type Tela = keyof typeof TELAS;

interface Resumo {
  visitantes: number;
  sessoes: number;
  envios: number;
  rolagem_media: number | null;
  tempo_medio_s: number | null;
  dispositivos: Record<string, number>;
  funil: { etapa: string; n: number }[];
  secoes: { secao: string; sessoes: number }[];
  origens: { origem: string; sessoes: number; envios: number }[];
  campanhas: { campanha: string; sessoes: number; envios: number }[];
  cliques: { alvo: string; n: number; raiva: number }[];
  por_dia: { dia: string; sessoes: number; envios: number }[];
}
interface Clique {
  x_pct: number | null;
  x_centro: number | null;
  y_px: number;
  rage: boolean;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const fmtPct = (v: number) => `${String(v).replace(".", ",")}%`;
const fmtTempo = (s: number | null) => (s == null ? "–" : s >= 60 ? `${Math.floor(s / 60)}min ${s % 60}s` : `${s}s`);

function useResumo(dias: number) {
  return useQuery({
    queryKey: ["lp_resumo", dias],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lp_resumo", { p_dias: dias });
      if (error) throw error;
      return data as Resumo;
    },
  });
}

function useCliques(dias: number, tela: Tela) {
  return useQuery({
    queryKey: ["lp_cliques", dias, tela],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lp_cliques", { p_dias: dias, p_dispositivo: tela });
      if (error) throw error;
      return (data ?? []) as Clique[];
    },
  });
}

export default function LandingPage() {
  const { isColaborador } = useAuth();
  const [dias, setDias] = React.useState(7);
  const [tela, setTela] = React.useState<Tela>("mobile");
  const resumo = useResumo(dias);
  const cliques = useCliques(dias, tela);

  if (isColaborador) return <Navigate to="/" replace />;

  const r = resumo.data;
  const conv = r ? pct(r.envios, r.sessoes) : 0;
  const mobile = r ? pct(r.dispositivos.mobile ?? 0, r.sessoes) : 0;

  return (
    <section>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[21px] font-semibold">Landing page</div>
          <div className="mt-1 text-[13px] text-muted">
            Como as pessoas usam a página do diagnóstico: de onde vêm, até onde rolam, onde clicam e onde desistem.
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

      {resumo.isError && (
        <EmptyState>Não deu para carregar os dados. Confira se a migração 0016 já foi rodada no banco.</EmptyState>
      )}

      {r && (
        <>
          <div className="mb-[22px] grid grid-cols-2 gap-3.5 lg:grid-cols-5">
            <KpiCard index={0} label="Visitantes" value={String(r.visitantes)} delta={`${r.sessoes} visitas`} />
            <KpiCard index={1} label="Diagnósticos enviados" value={String(r.envios)} accent="positive" />
            <KpiCard index={2} label="Conversão" value={fmtPct(conv)} delta="envios ÷ visitas" accent="positive" />
            <KpiCard index={3} label="Rolagem média" value={r.rolagem_media == null ? "–" : `${r.rolagem_media}%`} delta={`${fmtPct(mobile)} no celular`} />
            <KpiCard index={4} label="Tempo médio" value={fmtTempo(r.tempo_medio_s)} />
          </div>

          <div className="mb-[22px] grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <Card className="p-5 px-[22px]">
              <div className="text-sm font-semibold">Funil do formulário</div>
              <div className="mb-4 mt-0.5 text-[11.5px] text-muted">Onde as pessoas param antes de enviar</div>
              <Barras
                itens={r.funil.map((f) => ({ rotulo: f.etapa, valor: f.n, nota: fmtPct(pct(f.n, r.funil[0]?.n ?? 0)) }))}
              />
            </Card>
            <Card className="p-5 px-[22px]">
              <div className="text-sm font-semibold">Até onde a página é vista</div>
              <div className="mb-4 mt-0.5 text-[11.5px] text-muted">Parte das visitas que chegou em cada seção</div>
              {r.secoes.length === 0 ? (
                <EmptyState>Ainda sem dados de rolagem.</EmptyState>
              ) : (
                <Barras itens={r.secoes.map((s) => ({ rotulo: s.secao, valor: s.sessoes, nota: fmtPct(pct(s.sessoes, r.sessoes)) }))} />
              )}
            </Card>
          </div>

          <div className="mb-[22px] grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <Card className="p-5 px-[22px]">
              <div className="text-sm font-semibold">De onde vêm as visitas</div>
              <div className="mb-4 mt-0.5 text-[11.5px] text-muted">Origem (UTM ou site de onde veio) e quanto cada uma converte</div>
              <TabelaOrigem linhas={r.origens.map((o) => ({ nome: o.origem, sessoes: o.sessoes, envios: o.envios }))} vazio="Ainda sem visitas." />
              {r.campanhas.length > 0 && (
                <>
                  <div className="mb-2 mt-5 text-[12.5px] font-semibold">Campanhas</div>
                  <TabelaOrigem linhas={r.campanhas.map((c) => ({ nome: c.campanha, sessoes: c.sessoes, envios: c.envios }))} vazio="" />
                </>
              )}
            </Card>
            <Card className="p-5 px-[22px]">
              <div className="text-sm font-semibold">O que mais recebe clique</div>
              <div className="mb-4 mt-0.5 text-[11.5px] text-muted">
                Cliques repetidos no mesmo ponto (sinal de que algo não respondeu como a pessoa esperava) aparecem em "travou"
              </div>
              {r.cliques.length === 0 ? (
                <EmptyState>Ainda sem cliques.</EmptyState>
              ) : (
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Elemento</Th>
                      <Th>Cliques</Th>
                      <Th>Travou</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.cliques.map((c) => (
                      <tr key={c.alvo}>
                        <Td wrap>{c.alvo}</Td>
                        <Td>{c.n}</Td>
                        <Td>{c.raiva > 0 ? <span className="font-semibold text-attention">{c.raiva}</span> : "0"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Card>
          </div>
        </>
      )}

      <Card className="p-5 px-[22px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Mapa de calor dos cliques</div>
            <div className="mt-0.5 text-[11.5px] text-muted">
              Quanto mais quente, mais cliques. Anéis roxos mostram cliques repetidos no mesmo lugar.
            </div>
          </div>
          <div className="flex gap-1.5 rounded-[10px] border border-border bg-surface p-1">
            {(Object.keys(TELAS) as Tela[]).map((t) => (
              <button
                key={t}
                onClick={() => setTela(t)}
                className={cn(
                  "rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  tela === t ? "bg-primary text-white" : "text-muted hover:text-foreground",
                )}
              >
                {TELAS[t].label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 text-[11.5px] text-muted">
          {cliques.data ? `${cliques.data.length} cliques no período` : "Carregando…"}
        </div>
        <MapaDeCalor tela={tela} pontos={cliques.data ?? []} />
      </Card>
    </section>
  );
}

function Barras({ itens }: { itens: { rotulo: string; valor: number; nota: string }[] }) {
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <div className="grid gap-2.5">
      {itens.map((i) => (
        <div key={i.rotulo} className="grid grid-cols-[150px_1fr_64px] items-center gap-3 text-[12.5px]">
          <span className="truncate">{i.rotulo}</span>
          <div className="h-[22px] overflow-hidden rounded-[6px] bg-primary-tint">
            <div className="h-full rounded-[6px] bg-primary" style={{ width: `${Math.max((i.valor / max) * 100, i.valor ? 2 : 0)}%` }} />
          </div>
          <span className="text-right tabular-nums text-muted">
            {i.valor} · {i.nota}
          </span>
        </div>
      ))}
    </div>
  );
}

function TabelaOrigem({ linhas, vazio }: { linhas: { nome: string; sessoes: number; envios: number }[]; vazio: string }) {
  if (linhas.length === 0) return vazio ? <EmptyState>{vazio}</EmptyState> : null;
  return (
    <TableWrap>
      <thead>
        <tr>
          <Th>Origem</Th>
          <Th>Visitas</Th>
          <Th>Envios</Th>
          <Th>Conversão</Th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.nome}>
            <Td wrap>{l.nome}</Td>
            <Td>{l.sessoes}</Td>
            <Td>{l.envios}</Td>
            <Td>{fmtPct(pct(l.envios, l.sessoes))}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

/** Página real num iframe (sem registrar visita) + camada de calor desenhada por cima. */
function MapaDeCalor({ tela, pontos }: { tela: Tela; pontos: Clique[] }) {
  const { largura, altura } = TELAS[tela];
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [escala, setEscala] = React.useState(1);

  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1, el.clientWidth / largura));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [largura]);

  React.useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.width = largura;
    cv.height = altura;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, largura, altura);
    const raio = tela === "mobile" ? 26 : 34;

    // 1) intensidade em tons de cinza (alfa acumulado)
    const coords = pontos.map((p) => ({
      x: tela === "mobile" ? ((p.x_pct ?? 50) / 100) * largura : largura / 2 + (p.x_centro ?? 0),
      y: p.y_px,
      rage: p.rage,
    }));
    for (const c of coords) {
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, raio);
      g.addColorStop(0, "rgba(0,0,0,0.22)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(c.x - raio, c.y - raio, raio * 2, raio * 2);
    }
    // 2) pinta: azul (pouco) → verde → amarelo → vermelho (muito)
    const img = ctx.getImageData(0, 0, largura, altura);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i] / 255;
      if (a === 0) continue;
      const t = Math.min(1, a * 1.6);
      const r = t < 0.5 ? 0 : Math.round(255 * Math.min(1, (t - 0.5) * 2.2));
      const gr = t < 0.5 ? Math.round(255 * t * 2) : Math.round(255 * (1 - (t - 0.5) * 1.6));
      const b = t < 0.5 ? Math.round(255 * (1 - t * 2)) : 0;
      d[i - 3] = r;
      d[i - 2] = Math.max(0, gr);
      d[i - 1] = b;
      d[i] = Math.round(Math.min(0.8, 0.25 + t * 0.6) * 255);
    }
    ctx.putImageData(img, 0, 0);
    // 3) cliques repetidos
    ctx.strokeStyle = "#A47BFF";
    ctx.lineWidth = 3;
    for (const c of coords.filter((c) => c.rage)) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [pontos, tela, largura, altura]);

  return (
    <div ref={wrapRef} className="mt-4 max-h-[78vh] overflow-y-auto overflow-x-hidden rounded-[12px] border border-border bg-black/40">
      <div className="relative mx-auto" style={{ width: largura * escala, height: altura * escala }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: largura, height: altura, transform: `scale(${escala})` }}>
          <iframe
            key={tela}
            src={LP_URL}
            title="Landing page"
            className="pointer-events-none block border-0"
            style={{ width: largura, height: altura }}
            tabIndex={-1}
          />
          <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" style={{ width: largura, height: altura }} />
        </div>
      </div>
    </div>
  );
}
