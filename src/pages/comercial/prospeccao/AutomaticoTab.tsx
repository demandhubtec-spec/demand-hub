import * as React from "react";
import { Play, Plus, Save, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  useOutreachColetas,
  useOutreachConfig,
  useOutreachLeads,
  useOutreachLog,
  useOutreachOrcamento,
  useRodarAuto,
  useUpdateConfig,
} from "@/hooks/useProspeccao";
import { fmtData } from "./shared";

/** Nichos que costumam ganhar procura entre novembro e janeiro (busca local no Google). */
const SAZONAIS: { nicho: string; termos: string[] }[] = [
  { nicho: "Estética", termos: ["clínica de estética", "harmonização facial", "depilação a laser"] },
  { nicho: "Odontologia estética", termos: ["clareamento dental", "lente de contato dental"] },
  { nicho: "Casa de verão", termos: ["limpeza de piscina", "instalação de ar condicionado", "dedetização"] },
  { nicho: "Eventos", termos: ["buffet", "fotógrafo de eventos", "decoração de festas"] },
  { nicho: "Pousadas e viagem", termos: ["pousada", "hotel", "agência de viagens"] },
  { nicho: "Salão de beleza", termos: ["salão de beleza", "barbearia"] },
  { nicho: "Hotel para pets", termos: ["hotel para cachorro", "creche canina"] },
  { nicho: "Academia", termos: ["academia"] },
];

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const REGIAO_INDAIATUBA = ["Indaiatuba", "Salto", "Itu", "Elias Fausto", "Sorocaba", "Campinas", "Itupeva", "Jundiaí", "Valinhos", "Vinhedo", "Hortolândia", "Sumaré", "Monte Mor", "Cabreúva", "Porto Feliz"];

type Filtros = { so_com_site?: boolean; so_com_instagram?: boolean; nota_min?: number; avaliacoes_min?: number; avaliacoes_max?: number };

/** Municípios de um estado (API pública do IBGE), em ordem alfabética. */
function useMunicipios(uf: string) {
  const [lista, setLista] = React.useState<string[]>([]);
  React.useEffect(() => {
    let vivo = true;
    setLista([]);
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
      .then((r) => (r.ok ? r.json() : []))
      .then((j: { nome: string }[]) => vivo && setLista(j.map((m) => m.nome)))
      .catch(() => null);
    return () => {
      vivo = false;
    };
  }, [uf]);
  return lista;
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const nichosParaTexto = (n: { nicho: string; termos: string[] }[]) => n.map((x) => `${x.nicho}: ${x.termos.join(", ")}`).join("\n");
const textoParaNichos = (t: string) =>
  t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [nicho, termos = ""] = l.split(":");
      return { nicho: nicho.trim(), termos: termos.split(",").map((x) => x.trim()).filter(Boolean) };
    })
    .filter((n) => n.nicho && n.termos.length);

/**
 * Prospecção automática: escolhe cidades e nichos; toda semana o sistema completa a fila
 * (coleta no Google Maps, busca e-mail no site, a Ana escreve a sequência) e avisa para aprovar em bloco.
 */
export function AutomaticoTab() {
  const { data: cfg } = useOutreachConfig();
  const { data: leads = [] } = useOutreachLeads();
  const { data: coletas = [] } = useOutreachColetas();
  const { data: orc } = useOutreachOrcamento();
  const { data: log = [] } = useOutreachLog();
  const salvar = useUpdateConfig();
  const rodar = useRodarAuto();
  const { showToast } = useToast();

  const [uf, setUf] = React.useState("SP");
  const [cidades, setCidades] = React.useState<string[]>([]);
  const [buscaCidade, setBuscaCidade] = React.useState("");
  const [publico, setPublico] = React.useState("");
  const [filtros, setFiltros] = React.useState<Filtros>({});
  const municipios = useMunicipios(uf);
  const [nichos, setNichos] = React.useState("");
  const [meta, setMeta] = React.useState(30);
  const [porBusca, setPorBusca] = React.useState(30);
  React.useEffect(() => {
    if (!cfg) return;
    setUf(cfg.auto_uf || "SP");
    setCidades(cfg.auto_cidades ?? []);
    setPublico(cfg.auto_publico ?? "");
    setFiltros(cfg.auto_filtros ?? {});
    setNichos(nichosParaTexto(cfg.auto_nichos ?? []));
    setMeta(cfg.auto_meta_dia ?? 30);
    setPorBusca(cfg.auto_lugares_por_busca ?? 30);
  }, [cfg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg) return null;
  if (cfg.auto_meta_dia === undefined) {
    return <Card className="p-4 text-[13px] text-muted">Falta rodar o SQL da prospecção automática no Supabase para liberar esta aba.</Card>;
  }

  const estoque = leads.filter((l) => l.wa_status === "pendente" && ["sem", "gerando", "rascunho", "aprovada"].includes(l.msg_status ?? "")).length;
  const metaSemana = meta * 5;
  const historico = log.filter((e) => e.channel === "auto").slice(0, 8);
  const gasto = Number(orc?.gasto_usd ?? 0);
  const teto = Number(orc?.teto_usd ?? 4);

  async function guardar() {
    try {
      await salvar.mutateAsync({
        patch: {
          auto_uf: uf,
          auto_cidades: cidades,
          auto_publico: publico.trim(),
          auto_filtros: filtros,
          auto_nichos: textoParaNichos(nichos),
          auto_meta_dia: meta,
          auto_lugares_por_busca: porBusca,
        },
        descricao: "Prospecção automática: região, nichos, público, filtros e meta atualizados",
      });
      showToast("Salvo");
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  async function ligar(v: boolean) {
    await salvar.mutateAsync({ patch: { auto_ativo: v }, descricao: v ? "Prospecção automática ligada" : "Prospecção automática desligada" });
  }

  async function rodarAgora() {
    try {
      const r = await rodar.mutateAsync();
      const iniciada = r.iniciada as string[] | undefined;
      showToast(
        iniciada?.length
          ? `Coleta iniciada: ${iniciada.length} buscas. Em alguns minutos as empresas entram na fila.`
          : r.estoque
            ? "A fila já cobre a semana. Nada a coletar agora."
            : "Rodou. Veja o histórico abaixo.",
      );
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  const sugestoes = buscaCidade.trim().length >= 2
    ? municipios.filter((m) => semAcento(m).includes(semAcento(buscaCidade.trim())) && !cidades.includes(m)).slice(0, 8)
    : [];
  const addCidade = (c: string) => {
    if (!cidades.includes(c)) setCidades([...cidades, c]);
    setBuscaCidade("");
  };
  const setFiltro = (k: keyof Filtros, v: boolean | number) => setFiltros({ ...filtros, [k]: v });
  const conversasFrias = meta * 4; // 4 toques no WhatsApp por empresa (dias 0, 2, 7 e 10)

  function addSazonal(s: { nicho: string; termos: string[] }) {
    const atual = textoParaNichos(nichos);
    if (atual.some((n) => n.nicho === s.nicho)) return;
    setNichos(nichosParaTexto([...atual, s]));
  }

  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-[13px]">
            <div className="text-[15px] font-semibold">Prospecção automática</div>
            <div className="mt-1 max-w-[640px] text-muted">
              Todo domingo à noite o sistema confere a fila da semana. Se faltar empresa, coleta no Google Maps as próximas buscas das cidades e
              nichos abaixo (aplicando os filtros), analisa o perfil no Google, o site e o Instagram, a Ana escreve a sequência e você recebe um
              aviso para aprovar a lista em bloco.
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            <Switch checked={!!cfg.auto_ativo} onCheckedChange={ligar} />
            {cfg.auto_ativo ? "Ligada" : "Desligada"}
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Indicador titulo="Fila da semana" valor={`${estoque} / ${metaSemana}`} nota={estoque >= metaSemana ? "coberta" : `faltam ${metaSemana - estoque}`} />
          <Indicador titulo="Apify no mês" valor={`US$ ${gasto.toFixed(2)}`} nota={`teto US$ ${teto}`} />
          <Indicador titulo="Última coleta" valor={cfg.auto_ultima_coleta ? fmtData(cfg.auto_ultima_coleta, false) : "nunca"} nota={cfg.auto_run_id ? "coleta rodando agora" : ""} />
          <Indicador
            titulo="Coletas antigas"
            valor={String((cfg.auto_datasets_pendentes ?? []).length)}
            nota={(cfg.auto_datasets_pendentes ?? []).length ? "aproveitadas sem custo na próxima rodada" : "nenhuma pendente"}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={rodarAgora} disabled={rodar.isPending || !!cfg.auto_run_id || !cfg.auto_ativo}>
            <Play /> {rodar.isPending ? "Rodando..." : "Rodar agora"}
          </Button>
          {!cfg.auto_ativo && <span className="self-center text-[12px] text-muted">Ligue a prospecção automática para rodar.</span>}
        </div>
      </Card>

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Primeiros contatos por dia (seg a sex)</Label>
            <Input type="number" min={5} max={60} value={meta} onChange={(e) => setMeta(Number(e.target.value))} />
            <div className="mt-1 text-[11.5px] text-muted">
              Meta da semana: {meta * 5}. Com os follow-ups, dá uns {conversasFrias} chats frios por dia no WhatsApp.
            </div>
            {conversasFrias > 160 && (
              <div className="mt-1 text-[11.5px] font-semibold text-attention">Acima de 160 chats frios por dia o risco de bloqueio sobe. Considere um segundo número.</div>
            )}
          </div>
          <div>
            <Label>Empresas por busca no Google Maps</Label>
            <Input type="number" min={10} max={60} value={porBusca} onChange={(e) => setPorBusca(Number(e.target.value))} />
            <div className="mt-1 text-[11.5px] text-muted">Cerca de US$ {(porBusca * 0.0045).toFixed(2)} por busca.</div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[120px_1fr]">
          <div>
            <Label>Estado</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UFS.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Label>Adicionar cidade</Label>
            <Input
              value={buscaCidade}
              onChange={(e) => setBuscaCidade(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sugestoes[0] && addCidade(sugestoes[0])}
              placeholder={municipios.length ? `Digite o nome (${municipios.length} cidades em ${uf})` : "Carregando cidades..."}
            />
            {sugestoes.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-[7px] border border-border bg-surface shadow-md">
                {sugestoes.map((m) => (
                  <button key={m} onClick={() => addCidade(m)} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-surface-2">
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cidades.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[12px]">
              {c}
              <button onClick={() => setCidades(cidades.filter((x) => x !== c))} aria-label={`Tirar ${c}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {cidades.length === 0 && <span className="text-[12px] text-muted">Nenhuma cidade escolhida.</span>}
        </div>
        <div className="mt-2 flex gap-3 text-[12px]">
          <button className="text-primary-bright hover:underline" onClick={() => { setUf("SP"); setCidades([...new Set([...cidades, ...REGIAO_INDAIATUBA])]); }}>
            + Região de Indaiatuba
          </button>
          {cidades.length > 0 && (
            <button className="text-muted hover:underline" onClick={() => setCidades([])}>
              Limpar cidades
            </button>
          )}
        </div>

        <div className="mt-4">
          <Label>Público-alvo</Label>
          <Textarea rows={2} value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Ex.: clínicas e escritórios que atendem particular e querem mais clientes da própria cidade" />
          <div className="mt-1 text-[11.5px] text-muted">A Ana usa isso para escolher exemplos e dores nas mensagens.</div>
        </div>

        <div className="mt-4">
          <Label>Nichos e termos de busca (um nicho por linha)</Label>
          <Textarea rows={8} value={nichos} onChange={(e) => setNichos(e.target.value)} placeholder="Odontologia: dentista, clínica odontológica" />
          <div className="mt-1 text-[11.5px] text-muted">Cada termo é buscado em cada cidade, em rodízio: a cada semana entram as próximas combinações.</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="self-center text-[11.5px] font-semibold text-muted">Fim de ano:</span>
            {SAZONAIS.map((s) => (
              <button key={s.nicho} onClick={() => addSazonal(s)} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[12px] hover:bg-surface-2">
                <Plus className="h-3 w-3" /> {s.nicho}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <Label>Filtros da coleta</Label>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-[13px]">
              <Switch checked={!!filtros.so_com_site} onCheckedChange={(v) => setFiltro("so_com_site", v)} /> Só empresas com site
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <Switch checked={!!filtros.so_com_instagram} onCheckedChange={(v) => setFiltro("so_com_instagram", v)} /> Só empresas com Instagram
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Nota mínima no Google</Label>
              <Input type="number" min={0} max={5} step={0.1} value={filtros.nota_min ?? 0} onChange={(e) => setFiltro("nota_min", Number(e.target.value))} />
            </div>
            <div>
              <Label>Mínimo de avaliações</Label>
              <Input type="number" min={0} value={filtros.avaliacoes_min ?? 0} onChange={(e) => setFiltro("avaliacoes_min", Number(e.target.value))} />
            </div>
            <div>
              <Label>Máximo de avaliações</Label>
              <Input type="number" min={0} value={filtros.avaliacoes_max ?? 0} onChange={(e) => setFiltro("avaliacoes_max", Number(e.target.value))} />
            </div>
          </div>
          <div className="mt-1 text-[11.5px] text-muted">
            0 = sem filtro. Só entra quem tem celular com WhatsApp. Toda empresa que entra passa pela análise do perfil no Google, do site e do Instagram antes da Ana escrever.
            Filtros mais fechados pedem mais buscas por semana (e gastam mais do teto).
          </div>
        </div>

        <Button className="mt-4" onClick={guardar} disabled={salvar.isPending}>
          <Save /> Salvar
        </Button>
      </Card>

      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Histórico</div>
        {historico.length === 0 && coletas.length === 0 && <div className="text-[12.5px] text-muted">Nada ainda.</div>}
        <ul className="space-y-1.5 text-[12.5px]">
          {historico.map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="w-[82px] shrink-0 font-mono text-[11px] text-muted">{fmtData(e.created_at)}</span>
              <span className={e.event === "error" ? "text-attention" : ""}>{typeof e.detail === "object" && e.detail ? String((e.detail as { msg?: string }).msg ?? "") : ""}</span>
            </li>
          ))}
        </ul>
        {coletas.length > 0 && (
          <div className="mt-3 text-[12px] text-muted">
            Coletas no total: {coletas.length} · empresas novas: {coletas.reduce((s, c) => s + (c.novos_adicionados ?? 0), 0)}
          </div>
        )}
      </Card>
    </div>
  );
}

function Indicador({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{titulo}</div>
      <div className="mt-1 text-[18px] font-semibold">{valor}</div>
      {nota && <div className="text-[11.5px] text-muted">{nota}</div>}
    </div>
  );
}
