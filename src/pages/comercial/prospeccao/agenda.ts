import type { OutreachConfig, OutreachLead, Toque } from "@/hooks/useProspeccao";

/**
 * Agenda de envios: simula, dia a dia, o que o robô vai mandar, na mesma ordem e com as mesmas
 * regras do motor (outreach-wa-tick e e-mail):
 *  - WhatsApp: primeiro os follow-ups vencidos (teto followup_daily_cap), depois os primeiros contatos
 *    aprovados por prioridade e data de entrada (teto wa_daily_cap), com o intervalo médio entre envios;
 *  - sábado só de manhã e só follow-up; e-mail só em dia útil; feriados não sai nada;
 *  - cada envio agenda o próximo toque como a função outreach_avancar_cadencia (09:30 ou 14:00 do dia
 *    da cadência, nunca menos de 3 horas depois do último toque, e-mail pulado quando não há e-mail).
 * Os horários são aproximados: o intervalo real entre envios é sorteado.
 */

export interface EnvioPrevisto {
  lead: OutreachLead;
  quando: Date;
  canal: "whatsapp" | "email";
  /** 1 = primeiro contato; 2 a 6 = toques da cadência */
  toque: number;
  total: number;
  /** Estava vencido antes de hoje e ainda não saiu */
  atrasado: boolean;
}

export interface FeitosHoje {
  waNovos: number;
  waFollow: number;
  email: number;
}

/** Mantenha igual a supabase/functions/outreach-wa-tick e ia-sdr/src/lib/outreach-email.ts */
export const FERIADOS = new Set([
  "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21", "2027-05-01", "2027-05-27",
  "2027-09-07", "2027-10-12", "2027-11-02", "2027-11-15", "2027-11-20", "2027-12-25",
]);

// Brasília sem horário de verão: UTC-3 fixo
const OFF = 3 * 3600e3;
const DIA = 864e5;
/** Meia-noite de Brasília do dia de `d`. */
export const inicioDoDia = (d: Date) => {
  const l = new Date(d.getTime() - OFF);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) + OFF);
};
const naHora = (dia: Date, h: number, m = 0) => new Date(inicioDoDia(dia).getTime() + (h * 60 + m) * 60e3);
export const ymd = (d: Date) => new Date(d.getTime() - OFF).toISOString().slice(0, 10);
export const diaDaSemana = (d: Date) => new Date(d.getTime() - OFF).getUTCDay();

interface Estado {
  lead: OutreachLead;
  seq: Toque[];
  toque: number; // índice do próximo passo (= toque_atual)
  inicio: Date;
  ultimo: Date | null;
  due: Date;
  canal: "whatsapp" | "email";
  atrasado: boolean;
}

const EMAIL_RUIM = ["optout", "sem_email", "erro", "ignorado"];

/** Próximo toque depois de um envio (igual a outreach_avancar_cadencia). Null = cadência concluída. */
function avancar(st: Estado, enviadoEm: Date, cfg: OutreachConfig): Estado | null {
  let i = st.toque + 1;
  const n = Math.max(st.seq.length, 1);
  let passo: Toque | undefined;
  for (;;) {
    if (i >= n) return null;
    passo = st.seq[i];
    const canal = passo?.canal ?? "whatsapp";
    if (canal === "email" && (!st.lead.email || EMAIL_RUIM.includes(st.lead.email_status) || !cfg.email_enabled || !passo?.texto)) {
      i++;
      continue;
    }
    break;
  }
  const hora = passo?.periodo === "tarde" ? [14, 0] : [9, 30];
  const base = naHora(new Date(inicioDoDia(st.inicio).getTime() + (passo?.dia ?? 0) * DIA + 12 * 3600e3), hora[0], hora[1]);
  const due = new Date(Math.max(base.getTime(), enviadoEm.getTime() + 3 * 3600e3));
  return { ...st, toque: i, ultimo: enviadoEm, due, canal: passo?.canal === "email" ? "email" : "whatsapp", atrasado: false };
}

const ordemFila = (a: OutreachLead, b: OutreachLead) => {
  // Igual ao motor: prioridade asc (nulos por último), depois created_at asc
  const pa = a.prioridade, pb = b.prioridade;
  if (pa !== pb) {
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa < pb ? -1 : 1;
  }
  return a.created_at.localeCompare(b.created_at);
};

export function preverEnvios(leads: OutreachLead[], cfg: OutreachConfig, feitos: FeitosHoje, dias = 31, agora = new Date()): EnvioPrevisto[] {
  const out: EnvioPrevisto[] = [];
  const hoje0 = inicioDoDia(agora);

  let ativos: Estado[] = leads
    .filter((l) => l.cadencia === "ativa" && l.proximo_toque_em && l.proximo_canal)
    .map((l) => ({
      lead: l,
      seq: l.sequencia ?? [],
      toque: l.toque_atual,
      inicio: new Date(l.cadencia_inicio ?? l.wa_sent_at ?? l.created_at),
      ultimo: l.ultimo_toque_em ? new Date(l.ultimo_toque_em) : null,
      due: new Date(l.proximo_toque_em!),
      canal: l.proximo_canal!,
      atrasado: new Date(l.proximo_toque_em!) < hoje0,
    }));
  const exigir = cfg.exigir_aprovacao !== false;
  const fila = leads
    .filter((l) => l.wa_status === "pendente" && l.whatsapp && (!exigir || l.msg_status === "aprovada"))
    .sort(ordemFila);

  const passoWa = ((cfg.wa_min_interval_sec + cfg.wa_max_interval_sec) / 2 + 30) * 1000;
  const passoEmail = ((cfg.email_min_interval_sec + Math.max(cfg.email_max_interval_sec, cfg.email_min_interval_sec)) / 2 + 30) * 1000;

  const registrar = (st: Estado, quando: Date, primeiro: boolean) => {
    out.push({
      lead: st.lead,
      quando,
      canal: st.canal,
      toque: primeiro ? 1 : st.toque + 1,
      total: Math.max(st.seq.length, 1),
      atrasado: st.atrasado,
    });
    const prox = avancar(st, quando, cfg);
    ativos = ativos.filter((x) => x !== st);
    if (prox) ativos.push(prox);
  };

  for (let k = 0; k < dias; k++) {
    const dia = new Date(hoje0.getTime() + k * DIA + 12 * 3600e3);
    const dow = diaDaSemana(dia);
    if (!cfg.send_days.includes(dow) || FERIADOS.has(ymd(dia))) continue;
    const sabado = dow === 6;
    const ehHoje = k === 0;

    // WhatsApp
    if (cfg.wa_enabled) {
      let t = new Date(Math.max(naHora(dia, cfg.send_start_hour).getTime(), ehHoje ? agora.getTime() : 0));
      const fim = sabado ? naHora(dia, 12) : naHora(dia, cfg.send_end_hour + 1);
      let fu = ehHoje ? feitos.waFollow : 0;
      let nv = ehHoje ? feitos.waNovos : 0;
      while (t < fim) {
        const vencidos = ativos.filter((s) => s.canal === "whatsapp" && s.due <= t).sort((a, b) => a.due.getTime() - b.due.getTime());
        if (vencidos.length && fu < (cfg.followup_daily_cap ?? 40)) {
          registrar(vencidos[0], t, false);
          fu++;
          t = new Date(t.getTime() + passoWa);
          continue;
        }
        if (!sabado && nv < cfg.wa_daily_cap && fila.length) {
          const l = fila.shift()!;
          const st: Estado = { lead: l, seq: l.sequencia ?? [], toque: 0, inicio: t, ultimo: null, due: t, canal: "whatsapp", atrasado: false };
          registrar(st, t, true);
          nv++;
          t = new Date(t.getTime() + passoWa);
          continue;
        }
        if (fu >= (cfg.followup_daily_cap ?? 40)) break;
        const prox = ativos.filter((s) => s.canal === "whatsapp" && s.due > t && s.due < fim).sort((a, b) => a.due.getTime() - b.due.getTime())[0];
        if (!prox) break;
        t = prox.due;
      }
    }

    // E-mail (só dia útil)
    if (cfg.email_enabled && !sabado) {
      let t = new Date(Math.max(naHora(dia, cfg.send_start_hour).getTime(), ehHoje ? agora.getTime() : 0));
      const fim = naHora(dia, cfg.send_end_hour + 1);
      let em = ehHoje ? feitos.email : 0;
      while (t < fim && em < cfg.email_daily_cap) {
        const vencidos = ativos.filter((s) => s.canal === "email" && s.due <= t).sort((a, b) => a.due.getTime() - b.due.getTime());
        if (vencidos.length) {
          registrar(vencidos[0], t, false);
          em++;
          t = new Date(t.getTime() + passoEmail);
          continue;
        }
        const prox = ativos.filter((s) => s.canal === "email" && s.due > t && s.due < fim).sort((a, b) => a.due.getTime() - b.due.getTime())[0];
        if (!prox) break;
        t = prox.due;
      }
    }
  }
  return out.sort((a, b) => a.quando.getTime() - b.quando.getTime());
}
