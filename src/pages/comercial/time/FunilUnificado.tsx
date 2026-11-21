/**
 * Funil comercial unificado (14/11/2026, Kelvin): um funil só para Google, Instagram, LinkedIn, Ligações, Anúncios
 * e os leads cadastrados à mão (indicação, recomendação, network, evento). O filtro "Origem do lead" escolhe o que aparece.
 * Nada some dos funis antigos: rodadas, notas, "Mandar para o time", "Nova rodada", lixeira do inbound e as fichas continuam aqui.
 */
import * as React from "react";
import { ChevronDown, ChevronUp, CircleHelp, ExternalLink, Filter, MessageCircle, Plus, RotateCcw, Search, Send, Trash2, Upload, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { type Contato, useContatos, useConversa, useEtapaInbound, useLixeira } from "@/hooks/useCrm";
import { chamarSdr, type OutreachLead, useOutreachLeads, useUpdateLead } from "@/hooks/useProspeccao";
import {
  type EtapaLista,
  type ListaExtra,
  type ListaLead,
  type Temperatura,
  useApagarNotaCard,
  useAtualizarListaLead,
  useComentarCard,
  useCriarLeadManual,
  useDefinirTemperatura,
  useListaLeads,
  useNotasCards,
  useTemperaturasManuais,
} from "@/hooks/useComercial";
import { cn } from "@/lib/utils";
import { FichaLead } from "../prospeccao/FichaLead";
import { fmtData } from "../prospeccao/shared";
import { type CardItem, Quadro, SeloOrigem } from "./FunilKanban";
import { AvisosRepetidos, FichaListaLead, ImportarRodada } from "./FunilLista";
import {
  COLUNAS_UNICAS,
  type EtapaUnica,
  ORIGENS,
  ORIGEM_POR_CHAVE,
  type GrupoOrigem,
  type OrigemLead,
  daInbound,
  daLista,
  daOutbound,
  etapaInbound,
  etapaInboundParaBanco,
  etapaListaDoTime,
  etapaOutbound,
  etapaOutboundDaLista,
  nomeEntrada,
  origemDaFonte,
  paraInbound,
  paraLista,
  paraOutbound,
  passoDoTime,
  patchOutbound,
  placeIdInstagram,
} from "./funis";

const fim8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);
const GRUPOS: { g: GrupoOrigem; sub: string }[] = [
  { g: "Outbound", sub: "prospecção ativa" },
  { g: "Inbound", sub: "chegou até nós" },
  { g: "Relacionamento", sub: "indicação e contatos" },
];
const CHAVE_FILTRO = "dh.funil.origens";

/** A Gabi marca o avanço na conversa (qualificado, agendado, cliente). Se ela já foi além da etapa do card, o card acompanha. */
const ORDEM: EtapaUnica[] = ["entrada", "contato", "conversa", "qualificacao", "reuniao", "reuniao_realizada", "proposta", "ganho"];
function comAvancoDaGabi(e: EtapaUnica, sdr: Contato | undefined): EtapaUnica {
  if (!sdr || e === "perdido") return e;
  const g: EtapaUnica | null = sdr.status === "cliente" ? "ganho" : sdr.status === "agendado" ? "reuniao" : sdr.status === "qualificado" ? "qualificacao" : null;
  return g && ORDEM.indexOf(g) > ORDEM.indexOf(e) ? g : e;
}

/** Um card do funil, com o registro de onde ele veio. */
type Registro =
  | { tipo: "google"; lead: OutreachLead }
  | { tipo: "lista"; lead: ListaLead; time: OutreachLead | null }
  | { tipo: "inbound"; contato: Contato };

interface Linha {
  id: string;
  etapa: EtapaUnica;
  origem: OrigemLead;
  reg: Registro;
  item: CardItem;
}

type NotaCardItem = { id: string; card: string; texto: string; criado_em: string };

/** Temperatura do card: a escolhida à mão (18/11); senão a da conversa (sdr_leads); senão a nota da lista. */
const TEMP = { quente: "Quente", morno: "Morno", frio: "Frio" } as const;
const notaDoSdr = (sdr: { temperatura?: keyof typeof TEMP | null } | undefined) => (sdr?.temperatura ? TEMP[sdr.temperatura] : null);

function lerFiltro(): OrigemLead[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_FILTRO) ?? "null");
    if (Array.isArray(v) && v.length) return v.filter((k) => ORIGEM_POR_CHAVE[k as OrigemLead]) as OrigemLead[];
  } catch {
    /* sem armazenamento: usa todas */
  }
  return ORIGENS.map((o) => o.k);
}

export function FunilUnificado({ abrirConversa }: { abrirConversa: (id: string) => void }) {
  const { data: prospeccao = [], isLoading: l1 } = useOutreachLeads();
  const { contatos, isLoading: l2 } = useContatos();
  const { data: listas = [], isLoading: l3 } = useListaLeads();
  const { data: notasCards = [] } = useNotasCards();
  const { data: tempManual } = useTemperaturasManuais();
  const updateLead = useUpdateLead();
  const atualizarLista = useAtualizarListaLead();
  const mudarInbound = useEtapaInbound();
  const lixeira = useLixeira();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [origens, setOrigens] = React.useState<OrigemLead[]>(lerFiltro);
  const [segmento, setSegmento] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [rodada, setRodada] = React.useState("");
  const [busca, setBusca] = React.useState("");
  const [aberto, setAberto] = React.useState<Linha | null>(null);
  const [fichaCompleta, setFichaCompleta] = React.useState<Registro | null>(null);
  const [novo, setNovo] = React.useState(false);
  const [importar, setImportar] = React.useState<ListaExtra | null>(null);
  const [comoFunciona, setComoFunciona] = React.useState(false);
  const [verLixeira, setVerLixeira] = React.useState(false);
  const [mandando, setMandando] = React.useState(false);

  const escolher = (v: OrigemLead[]) => {
    setOrigens(v);
    try {
      localStorage.setItem(CHAVE_FILTRO, JSON.stringify(v));
    } catch {
      /* ok */
    }
  };

  const sdrPorFone = React.useMemo(() => new Map(contatos.map((c) => [fim8(c.phone), c])), [contatos]);
  const doTimePorPlace = React.useMemo(() => new Map(prospeccao.filter((p) => p.origem === "instagram").map((p) => [p.place_id, p])), [prospeccao]);

  // Todos os cards, de todas as origens, já com a etapa única
  const linhas = React.useMemo<Linha[]>(() => {
    const out: Linha[] = [];
    for (const l of prospeccao) {
      if (l.origem === "instagram") continue; // aparece pela lista do Instagram
      const e = etapaOutbound(l);
      if (!e) continue;
      const sdr = l.whatsapp ? sdrPorFone.get(fim8(l.whatsapp)) : undefined;
      out.push({
        id: `g:${l.place_id}`,
        etapa: comAvancoDaGabi(daOutbound(e), sdr),
        origem: "google",
        reg: { tipo: "google", lead: l },
        item: {
          id: `g:${l.place_id}`,
          titulo: l.empresa,
          sub: [l.nicho, l.cidade].filter(Boolean).join(" · "),
          quando: [l.updated_at, l.wa_sent_at].filter(Boolean).sort().pop() ?? null,
          conversa: sdr?.id ?? null,
          nota: notaDoSdr(sdr),
          aviso: l.retorno_em ? `Retorno combinado: ${fmtData(l.retorno_em)}` : null,
          origem: "google",
          podeLixeira: false,
        },
      });
    }
    for (const l of listas) {
      const pid = l.lista === "instagram" ? placeIdInstagram(l.perfil_url, l.perfil) : null;
      const time = pid ? doTimePorPlace.get(pid) ?? null : null;
      const etapaLista: EtapaLista = time ? etapaListaDoTime(time) : l.etapa;
      const origem: OrigemLead = l.lista === "instagram" ? "instagram" : l.lista === "linkedin" ? "linkedin" : l.lista === "ligacoes" ? "ligacao" : origemDaFonte(l.fonte);
      const sdr = fim8(l.whatsapp) ? sdrPorFone.get(fim8(l.whatsapp)) : undefined;
      const parado =
        l.etapa === "contato" && Date.now() - new Date(l.atualizado_em).getTime() > 3 * 86400_000
          ? `sem resposta há ${Math.floor((Date.now() - new Date(l.atualizado_em).getTime()) / 86400_000)} dias`
          : null;
      out.push({
        id: `l:${l.id}`,
        etapa: comAvancoDaGabi(daLista(etapaLista), sdr),
        origem,
        reg: { tipo: "lista", lead: l, time },
        item: {
          id: `l:${l.id}`,
          titulo: l.empresa,
          sub: [l.nicho, l.cidade ?? l.rodada?.split(" · ")[0]].filter(Boolean).join(" · "),
          quando: l.atualizado_em,
          conversa: sdr?.id ?? null,
          nota: notaDoSdr(sdr),
          etiqueta:
            l.lista === "ligacoes"
              ? l.tentativas
                ? `${l.tentativas} tentativa${l.tentativas > 1 ? "s" : ""}`
                : null
              : time
                ? passoDoTime(time) ?? "Gabi"
                : l.lista === "manual"
                  ? l.comentario
                    ? `por ${l.comentario}`
                    : null
                  : l.canal,
          valor: l.etapa === "ganho" ? l.valor : null,
          aviso: parado,
          origem,
          podeLixeira: false,
        },
      });
    }
    for (const c of contatos) {
      if (c.tipo !== "inbound" || c.lixeira_em) continue;
      out.push({
        id: `i:${c.id}`,
        etapa: daInbound(etapaInbound(c)),
        origem: "anuncio",
        reg: { tipo: "inbound", contato: c },
        item: {
          id: `i:${c.id}`,
          titulo: c.nomeExibicao,
          sub: c.segmento ?? "",
          quando: c.ultimaAtividade,
          conversa: c.id,
          nota: notaDoSdr(c),
          aviso: c.last_inbound_at && (!c.last_outbound_at || c.last_inbound_at > c.last_outbound_at) ? "Esperando resposta nossa" : null,
          origem: "anuncio",
          podeLixeira: true,
        },
      });
    }
    // 18/11: a temperatura escolhida à mão vale acima da calculada, e o card mostra o último comentário
    const ultimo = new Map<string, string>();
    for (const n of notasCards) if (!ultimo.has(n.card)) ultimo.set(n.card, n.texto);
    // 21/11: a temperatura decide a etapa. Quente (mostrou interesse) vai para "Demonstrou interesse" e morno
    // (conversou e parou) fica em "Conversa iniciada"; o card mostra o resumo da conversa e de qual SDR é.
    const porId = new Map(contatos.map((c) => [c.id, c]));
    const RANK = { Quente: 0, Morno: 1, Frio: 2 } as const;
    return out
      .map((l) => {
        const t = tempManual?.get(l.id);
        const c = ultimo.get(l.id);
        const sdr = l.item.conversa ? porId.get(l.item.conversa) : undefined;
        const ctx = sdr?.contexto ?? null;
        // Temperatura só pela conversa (ou escolhida à mão); a nota de perfil da lista não conta (21/11)
        const nota = t ? TEMP[t] : ctx ? TEMP[ctx.temperatura] : notaDoSdr(sdr);
        let etapa = l.etapa;
        const fixa = ["perdido", "reuniao", "reuniao_realizada", "proposta", "ganho"].includes(etapa);
        const qualifAMao =
          (l.reg.tipo === "google" && l.reg.lead.status_comercial === "qualificacao") ||
          (l.reg.tipo === "lista" && l.reg.lead.etapa === "qualificacao") ||
          sdr?.status === "qualificado";
        const ate = (alvo: EtapaUnica) => (ORDEM.indexOf(alvo) > ORDEM.indexOf(etapa) ? alvo : etapa);
        if (!fixa && t) {
          if (t === "quente") etapa = ate("qualificacao");
          else if (t === "morno") etapa = ate("conversa");
        } else if (!fixa && ctx) {
          // Teve disparo: no mínimo "Mensagem ou ligação"
          if (etapa === "entrada") etapa = "contato";
          if (ctx.conversou === false) {
            // Ninguém de verdade respondeu (só robô): não é conversa nem interesse
            if ((etapa === "conversa" || etapa === "qualificacao") && !qualifAMao) etapa = "contato";
          } else if (ctx.temperatura === "quente") {
            etapa = ate("qualificacao");
          } else {
            if (etapa === "qualificacao" && !qualifAMao) etapa = "conversa";
            etapa = ate("conversa");
          }
        }
        return {
          ...l,
          etapa,
          item: {
            ...l.item,
            nota,
            comentario: c ?? l.item.comentario ?? null,
            resumo: sdr?.contexto?.resumo ?? null,
            etiqueta: l.item.etiqueta ?? (sdr?.contexto?.sdr ?? null),
          },
        };
      })
      .sort((a, b) => (RANK[a.item.nota ?? "Frio"] ?? 3) - (RANK[b.item.nota ?? "Frio"] ?? 3) || String(b.item.quando ?? "").localeCompare(String(a.item.quando ?? "")));
  }, [prospeccao, listas, contatos, sdrPorFone, doTimePorPlace, notasCards, tempManual]);

  const conta = React.useMemo(() => {
    const m = new Map<OrigemLead, number>();
    for (const l of linhas) m.set(l.origem, (m.get(l.origem) ?? 0) + 1);
    return m;
  }, [linhas]);

  const marcadas = new Set(origens);
  const daOrigem = linhas.filter((l) => marcadas.has(l.origem));
  const deLista = daOrigem.filter((l) => l.reg.tipo === "lista").map((l) => (l.reg as { lead: ListaLead }).lead);
  const segmentos = [...new Set(daOrigem.map((l) => (l.reg.tipo === "inbound" ? l.reg.contato.segmento : l.reg.lead.nicho)).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const rodadas = [...new Set(deLista.filter((l) => l.lista === "instagram" || l.lista === "linkedin").map((l) => l.rodada ?? "Sem rodada"))];
  // Busca por empresa, nome da pessoa, telefone ou e-mail (14/11/2026)
  const termo = busca.trim().toLowerCase();
  const digitos = busca.replace(/\D/g, "");
  const textoDe = (l: Linha) => {
    const r = l.reg;
    const partes =
      r.tipo === "google"
        ? [r.lead.empresa, r.lead.nicho, r.lead.cidade, r.lead.whatsapp, r.lead.email]
        : r.tipo === "lista"
          ? [r.lead.empresa, r.lead.perfil, r.lead.nicho, r.lead.cidade, r.lead.whatsapp, r.lead.email, r.lead.comentario]
          : [r.contato.nomeExibicao, r.contato.nome, r.contato.empresa, r.contato.segmento, r.contato.phone, r.contato.email];
    return partes.filter(Boolean).join(" ").toLowerCase();
  };
  const bateBusca = (l: Linha) => {
    if (!termo) return true;
    const t = textoDe(l);
    if (t.includes(termo)) return true;
    return digitos.length >= 4 && t.replace(/\D/g, "").includes(digitos);
  };
  const visiveis = daOrigem.filter((l) => {
    if (!bateBusca(l)) return false;
    const nicho = l.reg.tipo === "inbound" ? l.reg.contato.segmento : l.reg.lead.nicho;
    if (segmento && nicho !== segmento) return false;
    if (nota && l.item.nota !== nota) return false;
    if (rodada && (l.reg.tipo !== "lista" || (l.reg.lead.rodada ?? "Sem rodada") !== rodada)) return false;
    return true;
  });
  const porId = new Map(visiveis.map((l) => [l.id, l]));
  const entrada = nomeEntrada(origens);
  const soInbound = origens.length > 0 && origens.every((o) => ORIGEM_POR_CHAVE[o].grupo === "Inbound");
  // Lead de anúncio não passa por "Mensagem ou ligação": com o filtro só no Inbound, a coluna some
  const colunas = COLUNAS_UNICAS.filter((c) => !(soInbound && c.key === "contato")).map((c) => (c.key === "entrada" ? { ...c, ...entrada } : c));

  // Instagram: prontos para mandar ao time (mesma regra do funil antigo)
  const prontosParaOTime = marcadas.has("instagram")
    ? deLista.filter((l) => {
        if (l.lista !== "instagram" || l.etapa !== "na_lista") return false;
        const pid = placeIdInstagram(l.perfil_url, l.perfil);
        return !(pid && doTimePorPlace.get(pid)) && (l.whatsapp ?? "").replace(/\D/g, "").length >= 10;
      })
    : [];
  async function mandarParaOTime() {
    if (!prontosParaOTime.length) return;
    if (!window.confirm(`Mandar ${prontosParaOTime.length} empresa(s) do Instagram para o time? A Rita faz o raio-x, a Duda o PDF e o site, a Bia as mensagens, e nada sai sem a sua aprovação.`))
      return;
    setMandando(true);
    try {
      const r = await chamarSdr<{ enviados: number; sem_whatsapp: number; ja_estavam: number }>("/api/prospeccao/instagram", { ids: prontosParaOTime.map((l) => l.id) });
      qc.invalidateQueries({ queryKey: ["outreach"] });
      showToast(`${r.enviados} empresa(s) foram para a Rita.${r.ja_estavam ? ` ${r.ja_estavam} já estavam na prospecção.` : ""}${r.sem_whatsapp ? ` ${r.sem_whatsapp} sem WhatsApp ficaram de fora.` : ""}`);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    } finally {
      setMandando(false);
    }
  }

  const ok = (nome: string, para: string) => ({
    onSuccess: () => showToast(`${nome} → ${para}`),
    onError: (e: unknown) => showToast(`Erro: ${(e as Error).message}`),
  });

  function mover(id: string, para: EtapaUnica) {
    const l = porId.get(id);
    if (!l) return;
    const nome = colunas.find((c) => c.key === para)?.label ?? para;
    const r = l.reg;
    if (r.tipo === "google") {
      const patch = patchOutbound(r.lead, paraOutbound(para));
      if (!patch) return showToast("Essa etapa é marcada sozinha quando a mensagem ou ligação sai.");
      return updateLead.mutate({ placeId: r.lead.place_id, patch, descricao: `Funil: ${r.lead.empresa} → ${nome}` }, ok(r.lead.empresa, nome));
    }
    if (r.tipo === "lista") {
      if (r.time) {
        const destino = etapaOutboundDaLista(paraLista(para));
        const patch = destino ? patchOutbound(r.time, destino) : null;
        if (!patch) return showToast("Essa etapa é marcada sozinha quando a Gabi manda a mensagem.");
        return updateLead.mutate({ placeId: r.time.place_id, patch, descricao: `Funil Instagram: ${r.lead.empresa} → ${nome}` }, ok(r.lead.empresa, nome));
      }
      return atualizarLista.mutate({ id: r.lead.id, patch: { etapa: paraLista(para) } }, ok(r.lead.empresa, nome));
    }
    const e = paraInbound(para);
    if (!e) return showToast("Lead de anúncio já chega conversando: ele não passa por Mensagem ou ligação.");
    mudarInbound.mutate({ id: r.contato.id, etapa: etapaInboundParaBanco(e) }, ok(r.contato.nomeExibicao, nome));
  }

  const mandarLixeira = (ids: string[], para: boolean) =>
    lixeira.mutate(
      { ids, lixeira: para },
      {
        onSuccess: () => showToast(para ? (ids.length > 1 ? `${ids.length} cards foram para a lixeira` : "Card foi para a lixeira") : "Card restaurado"),
        onError: (e) => showToast(`Erro: ${(e as Error).message}`),
      },
    );
  const naLixeira = contatos.filter((c) => c.tipo === "inbound" && c.lixeira_em);

  const select = "h-9 rounded-[8px] border border-border bg-surface px-3 text-[13px]";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex h-9 w-[280px] items-center gap-2 rounded-[8px] border border-border bg-surface px-3 text-muted focus-within:border-primary">
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar empresa, pessoa, telefone ou e-mail"
            className="w-full bg-transparent text-[13px] text-ink outline-none"
          />
          {busca && (
            <button onClick={() => setBusca("")} aria-label="Limpar busca" className="hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <FiltroOrigem marcadas={origens} conta={conta} total={linhas.length} onChange={escolher} />
        {segmentos.length > 0 && (
          <select value={segmento} onChange={(e) => setSegmento(e.target.value)} className={select}>
            <option value="">Todos os segmentos</option>
            {segmentos.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
        <select value={nota} onChange={(e) => setNota(e.target.value)} className={select} title="Quente: deu sinal de interesse ou está com você. Morno: respondeu, sem sinal ainda. Frio: não respondeu, sumiu ou recusou.">
          <option value="">Todas as temperaturas</option>
          {(["Quente", "Morno", "Frio"] as const).map((t) => (
            <option key={t} value={t}>
              {t} ({daOrigem.filter((l) => l.item.nota === t).length})
            </option>
          ))}
        </select>
        {rodadas.length > 1 && (
          <select value={rodada} onChange={(e) => setRodada(e.target.value)} className={select}>
            <option value="">Todas as rodadas</option>
            {rodadas.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setComoFunciona((v) => !v)}>
            <CircleHelp /> Como funciona o funil
          </Button>
          <MenuMais
            prontos={prontosParaOTime.length}
            mandando={mandando}
            mandar={mandarParaOTime}
            importar={setImportar}
            lixeira={naLixeira.length}
            verLixeira={() => setVerLixeira((v) => !v)}
          />
          <Button size="sm" onClick={() => setNovo(true)}>
            <Plus /> Novo lead
          </Button>
        </div>
      </div>

      {comoFunciona && <ComoFunciona fechar={() => setComoFunciona(false)} />}
      {(marcadas.has("instagram") || marcadas.has("linkedin")) && (
        <>
          {marcadas.has("instagram") && <AvisosRepetidos lista="instagram" />}
          {marcadas.has("linkedin") && <AvisosRepetidos lista="linkedin" />}
        </>
      )}

      {verLixeira ? (
        <Lixeira itens={naLixeira} restaurar={(ids) => mandarLixeira(ids, false)} fechar={() => setVerLixeira(false)} />
      ) : l1 || l2 || l3 ? (
        <div className="text-[13px] text-muted">Carregando o funil…</div>
      ) : !origens.length ? (
        <EmptyState>Marque pelo menos uma origem no filtro "Origem do lead".</EmptyState>
      ) : !visiveis.length ? (
        <EmptyState>{termo ? `Nenhum lead encontrado para "${busca.trim()}" nas origens marcadas.` : "Nenhum lead com esse filtro."}</EmptyState>
      ) : (
        <Quadro
          colunas={colunas}
          itens={visiveis.map((l) => l.item)}
          etapa={(id) => porId.get(id)?.etapa ?? null}
          mover={mover}
          abrir={(id) => setAberto(porId.get(id) ?? null)}
          abrirConversa={abrirConversa}
          paraLixeira={(id) => {
            const l = porId.get(id);
            if (l?.reg.tipo === "inbound") mandarLixeira([l.reg.contato.id], true);
          }}
        />
      )}

      {aberto && (
        <Prontuario
          linha={linhas.find((l) => l.id === aberto.id) ?? aberto}
          etapaNome={colunas.find((c) => c.key === (linhas.find((l) => l.id === aberto.id) ?? aberto).etapa)?.label ?? ""}
          etapas={colunas.map((c) => ({ key: c.key, label: c.label }))}
          mover={(para) => mover(aberto.id, para)}
          sdr={aberto.item.conversa ? contatos.find((c) => c.id === aberto.item.conversa) ?? null : null}
          onClose={() => setAberto(null)}
          abrirConversa={abrirConversa}
          fichaCompleta={() => {
            setFichaCompleta(aberto.reg);
            setAberto(null);
          }}
          notas={notasCards.filter((n) => n.card === aberto.id)}
          tempManual={tempManual?.get(aberto.id) ?? null}
        />
      )}
      {fichaCompleta?.tipo === "google" && <FichaLead lead={fichaCompleta.lead} onClose={() => setFichaCompleta(null)} />}
      {fichaCompleta?.tipo === "lista" && <FichaListaLead lead={fichaCompleta.lead} onClose={() => setFichaCompleta(null)} />}
      {novo && <NovoLead onClose={() => setNovo(false)} />}
      {importar && <ImportarRodada lista={importar} onClose={() => setImportar(null)} />}
    </div>
  );
}

/* ───────────── Filtro "Origem do lead": uma caixa só, com grupos que abrem e fecham ───────────── */
function FiltroOrigem({
  marcadas,
  conta,
  total,
  onChange,
}: {
  marcadas: OrigemLead[];
  conta: Map<OrigemLead, number>;
  total: number;
  onChange: (v: OrigemLead[]) => void;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [rascunho, setRascunho] = React.useState<Set<OrigemLead>>(new Set(marcadas));
  const [fechados, setFechados] = React.useState<Set<GrupoOrigem>>(new Set());
  const caixa = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!aberto) return;
    setRascunho(new Set(marcadas));
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);
  const todas = marcadas.length === ORIGENS.length;
  const rotulo = todas ? "Todas" : marcadas.length === 1 ? ORIGEM_POR_CHAVE[marcadas[0]].nome : `${marcadas.length} origens`;
  const tudo = rascunho.size === ORIGENS.length;
  const alternar = (k: OrigemLead) =>
    setRascunho((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const caixinha = (on: boolean, meio = false) => (
    <span
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
        on || meio ? "border-primary bg-primary text-white" : "border-[#c9c5d8] bg-surface",
      )}
    >
      {on ? <span className="text-[11px] leading-none">✓</span> : meio ? <span className="h-0.5 w-2 bg-white" /> : null}
    </span>
  );
  return (
    <div className="relative" ref={caixa}>
      <Button size="sm" variant="ghost" onClick={() => setAberto((v) => !v)}>
        <Filter /> Origem do lead: {rotulo} <ChevronDown className="opacity-60" />
      </Button>
      {aberto && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[300px] rounded-[12px] border border-border bg-surface p-1.5 shadow-[0_12px_32px_rgba(18,16,31,.12)]">
          <button
            className="flex w-full items-center gap-2.5 rounded-[6px] border-b border-border px-2.5 py-2 text-[14px] font-semibold hover:bg-surface-2"
            onClick={() => setRascunho(tudo ? new Set() : new Set(ORIGENS.map((o) => o.k)))}
          >
            {caixinha(tudo, rascunho.size > 0 && !tudo)} Todas as origens
            <span className="ml-auto text-[12px] font-medium text-muted">{total}</span>
          </button>
          {GRUPOS.map(({ g, sub }) => {
            const doGrupo = ORIGENS.filter((o) => o.grupo === g);
            const fechado = fechados.has(g);
            const on = doGrupo.every((o) => rascunho.has(o.k));
            const algum = doGrupo.some((o) => rascunho.has(o.k));
            return (
              <div key={g}>
                <div className="flex items-center gap-2 px-2.5 pb-1 pt-2.5 text-[12px] font-semibold text-muted">
                  <button
                    title={on ? "Desmarcar o grupo" : "Marcar o grupo"}
                    onClick={() =>
                      setRascunho((s) => {
                        const n = new Set(s);
                        doGrupo.forEach((o) => (on ? n.delete(o.k) : n.add(o.k)));
                        return n;
                      })
                    }
                  >
                    {caixinha(on, algum && !on)}
                  </button>
                  {g} <span className="font-normal">{sub}</span>
                  <button
                    className="ml-auto"
                    onClick={() =>
                      setFechados((s) => {
                        const n = new Set(s);
                        if (n.has(g)) n.delete(g);
                        else n.add(g);
                        return n;
                      })
                    }
                  >
                    {fechado ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {!fechado &&
                  doGrupo.map((o) => (
                    <button key={o.k} className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[14px] hover:bg-surface-2" onClick={() => alternar(o.k)}>
                      {caixinha(rascunho.has(o.k))}
                      <span className="h-2 w-2 rounded-full" style={{ background: o.cor }} />
                      {o.nome}
                      <span className="ml-auto text-[12px] tabular-nums text-muted">{conta.get(o.k) ?? 0}</span>
                    </button>
                  ))}
              </div>
            );
          })}
          <div className="mt-1 flex items-center gap-2 border-t border-border px-2.5 pb-1 pt-2.5">
            <button className="text-[13px] text-primary" onClick={() => setRascunho(new Set())}>
              Limpar
            </button>
            <Button
              size="sm"
              className="ml-auto"
              disabled={!rascunho.size}
              onClick={() => {
                onChange(ORIGENS.map((o) => o.k).filter((k) => rascunho.has(k)));
                setAberto(false);
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Mais ações: as ferramentas que eram de cada funil ───────────── */
function MenuMais({
  prontos,
  mandando,
  mandar,
  importar,
  lixeira,
  verLixeira,
}: {
  prontos: number;
  mandando: boolean;
  mandar: () => void;
  importar: (l: ListaExtra) => void;
  lixeira: number;
  verLixeira: () => void;
}) {
  const [aberto, setAberto] = React.useState(false);
  const caixa = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const item = "flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-[14px] hover:bg-surface-2 disabled:opacity-50";
  return (
    <div className="relative" ref={caixa}>
      <Button size="sm" variant="ghost" onClick={() => setAberto((v) => !v)}>
        Mais ações <ChevronDown className="opacity-60" />
      </Button>
      {aberto && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[280px] rounded-[12px] border border-border bg-surface p-1.5 shadow-[0_12px_32px_rgba(18,16,31,.12)]">
          <button className={item} disabled={mandando || !prontos} onClick={() => (setAberto(false), mandar())}>
            <Send className="h-4 w-4 text-muted" /> {mandando ? "Mandando…" : `Mandar Instagram para o time (${prontos})`}
          </button>
          <button className={item} onClick={() => (setAberto(false), importar("instagram"))}>
            <Upload className="h-4 w-4 text-muted" /> Nova rodada · Instagram
          </button>
          <button className={item} onClick={() => (setAberto(false), importar("linkedin"))}>
            <Upload className="h-4 w-4 text-muted" /> Nova rodada · LinkedIn
          </button>
          <button className={item} onClick={() => (setAberto(false), verLixeira())}>
            <Trash2 className="h-4 w-4 text-muted" /> Lixeira do inbound ({lixeira})
          </button>
        </div>
      )}
    </div>
  );
}

function Lixeira({ itens, restaurar, fechar }: { itens: Contato[]; restaurar: (ids: string[]) => void; fechar: () => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="text-[16px] font-semibold">Lixeira do inbound</span>
        {itens.length > 0 && (
          <button className="text-[13px] text-primary hover:underline" onClick={() => restaurar(itens.map((c) => c.id))}>
            Restaurar todos
          </button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={fechar}>
          Voltar ao funil
        </Button>
      </div>
      {!itens.length ? (
        <EmptyState>A lixeira está vazia.</EmptyState>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {itens.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{c.nomeExibicao}</div>
                <div className="text-[12px] text-muted">na lixeira desde {fmtData(c.lixeira_em!)}</div>
              </div>
              <button className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline" onClick={() => restaurar([c.id])}>
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────── Como funciona o funil (escondido; abre pelo botão) ───────────── */
function ComoFunciona({ fechar }: { fechar: () => void }) {
  const regras: [string, string][] = [
    ["Um funil só", "Google, Instagram, LinkedIn, Ligações, Anúncios e os leads cadastrados à mão ficam no mesmo quadro. O filtro Origem do lead escolhe o que aparece."],
    ["Etapas iguais para todos", "Entrada, Mensagem ou ligação, Conversa iniciada, Qualificação, Reunião agendada, Reunião realizada, Negociação e Venda. Perdidos ficam no Mostrar perdidos."],
    ["Inbound pula uma etapa", "Quem vem de anúncio já chega conversando: entra direto e vai para Conversa iniciada, sem passar por Mensagem ou ligação."],
    ["Ligações se encaixam", "Ligações feitas contam como Mensagem ou ligação. Atendidas e Conversa contam como Conversa iniciada."],
    ["Origem em todo card", "Cada card mostra de onde veio e o grupo (Outbound, Inbound ou Relacionamento). No topo de cada etapa, a barrinha mostra a mistura de origens."],
    ["Indicadores separados", "As taxas de conversão por origem continuam na aba Indicadores."],
  ];
  return (
    <div className="mb-4 rounded-[12px] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center">
        <span className="text-[16px] font-semibold">Como funciona o funil</span>
        <button className="ml-auto text-muted hover:text-ink" onClick={fechar} aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {regras.map(([t, d]) => (
          <div key={t} className="rounded-[8px] bg-surface-2 p-3">
            <div className="text-[14px] font-semibold">{t}</div>
            <div className="mt-1 text-[13px] leading-relaxed text-muted">{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── Prontuário do lead: resumo, conversa do WhatsApp espelhada e dados ───────────── */
function Prontuario({
  linha,
  etapaNome,
  etapas,
  mover,
  sdr,
  onClose,
  abrirConversa,
  fichaCompleta,
  notas,
  tempManual,
}: {
  linha: Linha;
  etapaNome: string;
  etapas: { key: EtapaUnica; label: string }[];
  mover: (para: EtapaUnica) => void;
  sdr: Contato | null;
  onClose: () => void;
  abrirConversa: (id: string) => void;
  fichaCompleta: () => void;
  notas: NotaCardItem[];
  tempManual: Temperatura | null;
}) {
  const [aba, setAba] = React.useState<"resumo" | "conversa" | "dados">("resumo");
  const [texto, setTexto] = React.useState("");
  const comentar = useComentarCard();
  const apagarNota = useApagarNotaCard();
  const definirTemp = useDefinirTemperatura();
  const { showToast } = useToast();
  const salvarComentario = () => {
    if (!texto.trim()) return;
    comentar.mutate(
      { card: linha.id, texto },
      { onSuccess: () => setTexto(""), onError: (e) => showToast(`Não salvou o comentário: ${(e as Error).message}`) },
    );
  };
  const { data: msgs = [], isLoading } = useConversa(sdr?.id ?? null);
  const fimChat = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (aba === "conversa") fimChat.current?.scrollIntoView({ block: "end" });
  }, [aba, msgs.length]);
  const r = linha.reg;
  const it = linha.item;
  const wa = (r.tipo === "inbound" ? r.contato.phone : r.lead.whatsapp ?? "").replace(/\D/g, "");
  const resumoGabi = [sdr?.qualificacao_resumo, sdr?.necessidade_resumo].filter(Boolean).join("\n\n");
  const anotacoes = r.tipo === "lista" ? r.lead.observacoes : null;
  const ultima = msgs.length ? msgs[msgs.length - 1] : null;
  const dados: [string, React.ReactNode][] =
    r.tipo === "google"
      ? [
          ["WhatsApp", r.lead.whatsapp],
          ["Segmento", r.lead.nicho],
          ["Cidade", r.lead.cidade],
          ["Retorno combinado", r.lead.retorno_em ? fmtData(r.lead.retorno_em) : null],
        ]
      : r.tipo === "lista"
        ? [
            ["Contato", r.lead.lista === "manual" ? r.lead.perfil : null],
            ["WhatsApp", r.lead.whatsapp],
            ["E-mail", r.lead.email],
            ["Segmento", r.lead.nicho],
            ["Cidade", r.lead.cidade],
            ["Rodada", r.lead.rodada],
            ["Nota", r.lead.nota],
            [r.lead.lista === "manual" ? "Quem indicou ou onde conheceu" : "Comentário", r.lead.comentario],
            ["Entrou no funil", fmtData(r.lead.criado_em)],
          ]
        : [
            ["WhatsApp", r.contato.phone],
            ["E-mail", r.contato.email],
            ["Segmento", r.contato.segmento],
            ["Entrou", fmtData(r.contato.created_at)],
          ];
  const abaBtn = (k: typeof aba, t: string) => (
    <button
      onClick={() => setAba(k)}
      className={cn("-mb-px border-b-2 pb-2 text-[14px]", aba === k ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}
    >
      {t}
    </button>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[min(86vh,780px)] max-w-[780px] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-border px-6 pb-0 pt-5">
          <DialogTitle className="pr-8 text-[20px]">{it.titulo}</DialogTitle>
          <DialogDescription className="mt-0.5 text-[13px]">{it.sub || " "}</DialogDescription>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <SeloOrigem origem={linha.origem} />
            {/* Mover de etapa sem arrastar (útil quando achou o lead pela busca) */}
            <select
              value={linha.etapa}
              onChange={(e) => mover(e.target.value as EtapaUnica)}
              title="Mudar de etapa"
              className="h-[22px] rounded-[6px] border-0 bg-primary-tint px-2 text-[12px] font-medium text-primary"
            >
              {etapas.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.key === linha.etapa ? etapaNome : `Mover para ${e.label}`}
                </option>
              ))}
            </select>
            {/* Temperatura à mão (18/11): vale acima da calculada pela conversa */}
            <select
              value={tempManual ?? ""}
              onChange={(e) =>
                definirTemp.mutate(
                  { card: linha.id, temperatura: (e.target.value || null) as Temperatura | null },
                  { onError: (er) => showToast(`Não salvou a temperatura: ${(er as Error).message}`) },
                )
              }
              title="Temperatura do lead. Automática: calculada pela conversa no WhatsApp."
              className={cn(
                "h-[22px] rounded-[6px] border-0 px-2 text-[12px] font-medium",
                it.nota === "Quente" ? "bg-negative-tint text-negative" : it.nota === "Morno" ? "bg-attention-tint text-attention" : it.nota === "Frio" ? "bg-[#e8f1fb] text-[#2f6fe4]" : "bg-surface-2 text-muted",
              )}
            >
              <option value="">{`Automática${!tempManual && it.nota ? ` (${it.nota})` : ""}`}</option>
              <option value="quente">Quente</option>
              <option value="morno">Morno</option>
              <option value="frio">Frio</option>
            </select>
            {it.aviso && <span className="inline-flex h-[22px] items-center rounded-[6px] bg-attention-tint px-2 text-[12px] font-medium text-attention">{it.aviso}</span>}
          </div>
          <div className="mt-4 flex gap-5">
            {abaBtn("resumo", "Resumo")}
            {abaBtn("conversa", `Conversa no WhatsApp${msgs.length ? ` (${msgs.length})` : ""}`)}
            {abaBtn("dados", "Dados")}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {aba === "resumo" && (
            <div className="space-y-5">
              {/* Contexto escrito pela IA a partir da conversa (21/11): base para a ligação */}
              {sdr?.contexto && (
                <section className="rounded-[10px] border border-border bg-surface-2/50 p-3.5">
                  <div className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-muted">
                    Contexto da conversa · {sdr.contexto.sdr}
                    <span className="font-normal">atualizado {fmtData(sdr.contexto.atualizado_em)}</span>
                  </div>
                  <div className="space-y-1.5 text-[14px] leading-relaxed">
                    <div>{sdr.contexto.resumo}</div>
                    {sdr.contexto.ultima_resposta && (
                      <div>
                        <b>Última resposta</b>
                        {sdr.contexto.ultima_resposta_em ? ` (${fmtData(sdr.contexto.ultima_resposta_em)})` : ""}: "{sdr.contexto.ultima_resposta}"
                      </div>
                    )}
                    {sdr.contexto.motivo_parou && (
                      <div>
                        <b>Por que parou:</b> {sdr.contexto.motivo_parou}
                      </div>
                    )}
                    <div>
                      <b>Objetivo da ligação:</b> {sdr.contexto.objetivo_ligacao}
                    </div>
                    <div className="text-[13px] text-muted">
                      Telefone: {sdr.phone}
                    </div>
                  </div>
                </section>
              )}
              {/* Comentários do Kelvin (18/11): o que aconteceu fora do WhatsApp, próximos passos, combinados */}
              <section>
                <div className="mb-1.5 text-[12px] font-semibold text-muted">Seus comentários{notas.length ? ` (${notas.length})` : ""}</div>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) salvarComentario();
                  }}
                  rows={2}
                  placeholder="Escreva o que aconteceu ou o próximo passo (ex.: apresentei a proposta, ele vai pensar e volta segunda)"
                  className="w-full resize-y rounded-[8px] border border-border bg-white p-2.5 text-[14px] leading-relaxed outline-none focus:border-primary"
                />
                <div className="mt-1.5 flex justify-end">
                  <Button size="sm" onClick={salvarComentario} disabled={!texto.trim() || comentar.isPending}>
                    {comentar.isPending ? "Salvando…" : "Comentar"}
                  </Button>
                </div>
                {notas.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {notas.map((n) => (
                      <li key={n.id} className="group rounded-[8px] border border-border bg-surface-2 px-3 py-2 text-[14px] leading-relaxed">
                        <div className="whitespace-pre-wrap">{n.texto}</div>
                        <div className="mt-1 flex items-center text-[12px] text-muted">
                          {fmtData(n.criado_em)}
                          <button
                            onClick={() => window.confirm("Apagar este comentário?") && apagarNota.mutate(n.id)}
                            className="ml-auto opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                          >
                            Apagar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <div className="mb-1.5 text-[12px] font-semibold text-muted">
                  Resumo da conversa{sdr?.updated_at ? ` · atualizado ${fmtData(sdr.updated_at)}` : ""}
                </div>
                <div className="whitespace-pre-wrap rounded-[8px] border border-border bg-surface-2 p-3 text-[14px] leading-relaxed">
                  {resumoGabi ||
                    (msgs.length
                      ? "A Gabi ainda não fechou um resumo desta conversa. Veja a conversa completa na aba ao lado."
                      : "Ainda não teve conversa no WhatsApp com este lead.")}
                </div>
              </section>
              {ultima && (
                <section>
                  <div className="mb-1.5 text-[12px] font-semibold text-muted">Última mensagem · {fmtData(ultima.created_at)}</div>
                  <div className="text-[14px] leading-relaxed">
                    <b className="font-semibold">{ultima.direction === "in" ? "Lead" : "Gabi"}:</b> {ultima.content}
                  </div>
                </section>
              )}
              {anotacoes && (
                <section>
                  <div className="mb-1.5 text-[12px] font-semibold text-muted">Anotações</div>
                  <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{anotacoes}</div>
                </section>
              )}
              {sdr?.temperatura_motivo && (
                <section className="text-[13px] text-muted">
                  Temperatura: <b className="text-ink">{TEMP[sdr.temperatura ?? "frio"]}</b> · {sdr.temperatura_motivo}
                </section>
              )}
              {sdr && (sdr.bant_score != null || sdr.status) && (
                <section className="text-[13px] text-muted">
                  {sdr.status ? `Situação na Gabi: ${sdr.status.replace(/_/g, " ")}` : ""}
                  {sdr.bant_score != null ? ` · nota de qualificação ${sdr.bant_score}` : ""}
                </section>
              )}
            </div>
          )}
          {aba === "conversa" && (
            <div>
              {!sdr ? (
                <EmptyState>Ainda não teve conversa no WhatsApp com este lead.</EmptyState>
              ) : isLoading ? (
                <div className="text-[13px] text-muted">Carregando a conversa…</div>
              ) : !msgs.length ? (
                <EmptyState>Nenhuma mensagem ainda.</EmptyState>
              ) : (
                <div className="flex flex-col gap-1.5 rounded-[12px] bg-[#efeae2] p-3">
                  {msgs.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap rounded-[10px] border px-2.5 py-1.5 text-[13px] leading-snug",
                        m.direction === "out" ? "self-end border-[#cfe9d3] bg-[#e7f6e9]" : "self-start border-border bg-white",
                      )}
                    >
                      {m.content}
                      <div className="mt-0.5 text-right text-[12px] text-muted">{fmtData(m.created_at)}</div>
                    </div>
                  ))}
                  <div ref={fimChat} />
                </div>
              )}
              {sdr && (
                <div className="mt-3 flex items-center gap-2 text-[13px] text-muted">
                  Espelho do número da Gabi, atualiza sozinho.
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => (onClose(), abrirConversa(sdr.id))}>
                    <MessageCircle /> Responder em Conversas
                  </Button>
                </div>
              )}
            </div>
          )}
          {aba === "dados" && (
            <div>
              <dl className="space-y-2 text-[14px]">
                {dados
                  .filter(([, v]) => v != null && v !== "")
                  .map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[150px_1fr] gap-3 border-b border-border/60 pb-2">
                      <dt className="text-muted">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {wa && (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-border px-3 py-1.5 text-[13px] hover:border-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir no WhatsApp
                  </a>
                )}
                {r.tipo !== "inbound" ? (
                  <Button size="sm" variant="ghost" onClick={fichaCompleta}>
                    Ficha completa {r.tipo === "lista" ? "(anotações e valor)" : "(histórico e cadência)"}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => (onClose(), abrirConversa(r.contato.id))}>
                    Abrir em Conversas
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Novo lead (cadastro manual) ───────────── */
const ORIGENS_CADASTRO = ORIGENS.map((o) => ({ k: o.k, nome: o.nome }));
const ETAPAS_CADASTRO: { k: EtapaLista; nome: string }[] = [
  { k: "na_lista", nome: "Entrada (ainda sem contato)" },
  { k: "contato", nome: "Mensagem ou ligação" },
  { k: "conversa", nome: "Conversa iniciada" },
  { k: "qualificacao", nome: "Qualificação" },
  { k: "reuniao", nome: "Reunião agendada" },
  { k: "reuniao_realizada", nome: "Reunião realizada" },
  { k: "proposta", nome: "Negociação" },
];

function NovoLead({ onClose }: { onClose: () => void }) {
  const criar = useCriarLeadManual();
  const { showToast } = useToast();
  const [f, setF] = React.useState({
    empresa: "",
    contato: "",
    whatsapp: "",
    email: "",
    origem: "indicacao",
    quem_indicou: "",
    nicho: "",
    cidade: "",
    etapa: "conversa" as EtapaLista,
    perfil_lead: "",
    conversa: "",
  });
  const campo = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value })),
  });
  const input = "mt-1 w-full rounded-[8px] border border-border bg-surface px-3 py-2 text-[14px] text-ink";
  const rel = ORIGEM_POR_CHAVE[f.origem as OrigemLead]?.grupo === "Relacionamento";
  const pode = (f.empresa.trim() || f.contato.trim()) && !criar.isPending;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-[600px] overflow-y-auto">
        <DialogTitle>Novo lead</DialogTitle>
        <DialogDescription>Entra no funil na etapa que você escolher. A Gabi não manda nada para ele sozinha.</DialogDescription>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[13px] font-medium">
          <label>
            Nome do contato
            <input className={input} {...campo("contato")} />
          </label>
          <label>
            Empresa
            <input className={input} {...campo("empresa")} />
          </label>
          <label>
            WhatsApp
            <input className={input} inputMode="tel" placeholder="(19) 99999-9999" {...campo("whatsapp")} />
          </label>
          <label>
            E-mail
            <input className={input} type="email" {...campo("email")} />
          </label>
          <label>
            Origem do lead
            <select className={input} {...campo("origem")}>
              {GRUPOS.map(({ g }) => (
                <optgroup key={g} label={g}>
                  {ORIGENS_CADASTRO.filter((o) => ORIGEM_POR_CHAVE[o.k].grupo === g).map((o) => (
                    <option key={o.k} value={o.k}>
                      {o.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            {rel ? "Quem indicou ou onde conheceu" : "Detalhe da origem"}
            <input className={input} placeholder={rel ? "Ex.: Dra. Fernanda, evento da ACIC" : "Ex.: campanha, anúncio, lista"} {...campo("quem_indicou")} />
          </label>
          <label>
            Segmento
            <input className={input} placeholder="Ex.: Odontologia" {...campo("nicho")} />
          </label>
          <label>
            Cidade
            <input className={input} {...campo("cidade")} />
          </label>
          <label className="col-span-2">
            Etapa inicial
            <select className={input} {...campo("etapa")}>
              {ETAPAS_CADASTRO.map((e) => (
                <option key={e.k} value={e.k}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2">
            Perfil do lead
            <input className={input} placeholder="Ex.: dono, 2 unidades, quer previsibilidade de pacientes" {...campo("perfil_lead")} />
          </label>
          <label className="col-span-2">
            O que foi conversado
            <textarea className={input} rows={4} {...campo("conversa")} />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!pode}
            onClick={() =>
              criar.mutate(f, {
                onSuccess: () => {
                  showToast(`${f.empresa.trim() || f.contato.trim()} entrou no funil`);
                  onClose();
                },
                onError: (e) => {
                  const msg = (e as Error).message;
                  showToast(msg.includes("lista_check") ? "O cadastro manual ainda está sendo liberado no banco. Tente de novo em instantes." : `Erro: ${msg}`);
                },
              })
            }
          >
            {criar.isPending ? "Salvando…" : "Salvar lead"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
