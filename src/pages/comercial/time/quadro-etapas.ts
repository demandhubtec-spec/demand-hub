/**
 * Quadro da Rita e da Duda (12/11/2026, pedido do Kelvin): igual ao time de marketing, ver quanto chegou para
 * cada uma, o que está fazendo agora, o que está em ajuste, o que foi aprovado e o que foi descartado.
 * Tudo calculado na hora a partir dos leads (a tela atualiza sozinha).
 *
 * Ritmo: o relógio da IA SDR roda a cada 10 minutos e cada uma faz 2 por rodada (POR_RODADA em ia-sdr/src/lib/rita.ts).
 */
import type { OutreachLead } from "@/hooks/useProspeccao";

export type Coluna = "fila" | "fazendo" | "pendente" | "ajuste" | "aprovado" | "descartado";
export type EtapaQuadro = "rita" | "duda";

export const POR_RODADA = 2;
export const MINUTOS_POR_RODADA = 10;

export const ROTULO: Record<EtapaQuadro, Record<Coluna, string>> = {
  rita: { fila: "Chegou, na fila", fazendo: "Fazendo agora", pendente: "Para aprovar", ajuste: "Em ajuste", aprovado: "Aprovados", descartado: "Descartados" },
  duda: { fila: "Chegou, na fila", fazendo: "Fazendo agora", pendente: "Para aprovar", ajuste: "Em ajuste", aprovado: "Aprovados", descartado: "Descartados" },
};

const tempo = (s: string | null | undefined) => (s ? Date.parse(s) || 0 : 0);

/** Duda espera até 60 minutos o robô conferir a logo antes de montar o site (mesma regra de ia-sdr). */
export function esperandoLogo(l: OutreachLead, agora = Date.now()): boolean {
  if (l.marca?.logo_checado) return false;
  const desde = tempo(l.marca?.logo_pedido_em ?? l.diagnosticos?.gerado_em ?? null);
  return !!desde && agora - desde < 60 * 60_000;
}

/** Em que coluna o lead está, na etapa da Rita ou da Duda. Nulo: ainda não chegou nessa etapa. */
export function colunaDo(l: OutreachLead, etapa: EtapaQuadro): Coluna | null {
  if (l.wa_status !== "pendente") return null; // já foi abordado: sai do quadro
  if (etapa === "rita") {
    // Descartada na Rita (antes de aprovar o diagnóstico); se foi descartada depois, na Duda, aqui conta como aprovado
    if (l.leo_status === "descartado" && l.rita_status) return l.rita_status === "aprovado" ? "aprovado" : "descartado";
    if (l.leo_status !== "aprovado") return null;
    return l.rita_status ?? "fila";
  }
  if (l.rita_status !== "aprovado") return null;
  if (l.leo_status === "descartado") return l.duda_status ? "descartado" : null;
  return l.duda_status ?? "fila";
}

export interface Quadro {
  cols: Record<Coluna, OutreachLead[]>;
  /** Tudo que chegou para ela (na fila + fazendo + entregues). */
  chegou: number;
  /** Já passou pela mão dela (para aprovar, em ajuste, aprovados, descartados). */
  entregues: number;
  /** Feitos hoje (diagnóstico ou site gerado hoje). */
  hoje: number;
  /** Na fila esperando o robô conferir a logo (só Duda). */
  esperandoLogo: number;
  /** Horas de trabalho para zerar a fila no ritmo atual. */
  horasParaZerar: number;
}

export function montarQuadro(leads: OutreachLead[], etapa: EtapaQuadro, agora = Date.now()): Quadro {
  const cols: Record<Coluna, OutreachLead[]> = { fila: [], fazendo: [], pendente: [], ajuste: [], aprovado: [], descartado: [] };
  for (const l of leads) {
    const c = colunaDo(l, etapa);
    if (c) cols[c].push(l);
  }
  // Ordem em que ela pega: Rita pela data de aprovação na lista do Léo; Duda deixa quem espera a logo para depois
  cols.fila.sort((a, b) => tempo(a.leo_decidido_em) - tempo(b.leo_decidido_em));
  let espera = 0;
  if (etapa === "duda") {
    espera = cols.fila.filter((l) => esperandoLogo(l, agora)).length;
    cols.fila.sort((a, b) => Number(esperandoLogo(a, agora)) - Number(esperandoLogo(b, agora)));
  }
  const prontos = etapa === "duda" ? cols.fila.filter((l) => !esperandoLogo(l, agora)) : cols.fila;
  const vez = prontos.slice(0, POR_RODADA);
  cols.fazendo = vez;
  cols.fila = cols.fila.filter((l) => !vez.includes(l));

  const inicioDoDia = new Date(agora);
  inicioDoDia.setHours(0, 0, 0, 0);
  const feitoEm = (l: OutreachLead) => (etapa === "rita" ? l.diagnosticos?.gerado_em : l.site_preview?.gerado_em);
  const entregues = cols.pendente.length + cols.ajuste.length + cols.aprovado.length + cols.descartado.length;
  const hoje = [...cols.pendente, ...cols.ajuste, ...cols.aprovado, ...cols.descartado].filter((l) => tempo(feitoEm(l)) >= inicioDoDia.getTime()).length;
  const aFazer = cols.fila.length + cols.fazendo.length + cols.ajuste.length;
  return {
    cols,
    chegou: entregues + cols.fila.length + cols.fazendo.length,
    entregues,
    hoje,
    esperandoLogo: espera,
    horasParaZerar: (Math.ceil(aFazer / POR_RODADA) * MINUTOS_POR_RODADA) / 60,
  };
}

/** "2 h 30 min", "40 min", "menos de 10 min". */
export function fmtDuracao(horas: number): string {
  const min = Math.round(horas * 60);
  if (min <= 0) return "nada na fila";
  if (min < 10) return "menos de 10 min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
