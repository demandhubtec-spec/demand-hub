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
  /**
   * primeiro = 1º contato; cadencia = toque da cadência antiga (2 a 6);
   * cutucada = "Fico no aguardo do atendimento" 1 h depois do 1º contato sem resposta (abordagem v2);
   * gabi = follow-up da Gabi (abordagem v2, 7 em até 14 dias, texto escrito pela IA na hora).
   */
  tipo: "primeiro" | "cadencia" | "cutucada" | "gabi";
  /** Só para os previstos "se ninguém responder" (cutucada e follow-ups ainda não agendados no banco). */
  seNaoResponder?: boolean;
  /** Quem manda: Gabi ou Marina (16/11). */
  sdr: "gabi" | "marina";
}

/** Igual a proximaSdr do ia-sdr: a SDR com vaga, proporcional ao teto (Gabi 30, Marina 10 → a Marina entra a cada ~4). */
function proximaSdr(feitos: { gabi: number; marina: number }, tetos: { gabi: number; marina: number }): "gabi" | "marina" | null {
  const com = (["gabi", "marina"] as const).filter((x) => tetos[x] > 0 && feitos[x] < tetos[x]);
  if (!com.length) return null;
  return [...com].sort((a, b) => feitos[a] / tetos[a] - feitos[b] / tetos[b] || (a === "gabi" ? -1 : 1))[0];
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
  const ordenada = leads
    .filter((l) => l.wa_status === "pendente" && l.whatsapp && (!exigir || l.msg_status === "aprovada"))
    .sort(ordemFila);
  // 16/11 (Kelvin): o disparo alterna Google e lista do Instagram (metade de cada por dia), igual ao servidor
  const ig = ordenada.filter((l) => l.place_id.startsWith("ig_"));
  const google = ordenada.filter((l) => !l.place_id.startsWith("ig_"));
  const fila: typeof ordenada = [];
  for (let i = 0; i < Math.max(ig.length, google.length); i++) {
    if (ig[i]) fila.push(ig[i]);
    if (google[i]) fila.push(google[i]);
  }

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
      tipo: primeiro ? "primeiro" : "cadencia",
      sdr: st.lead.agente === "marina" ? "marina" : "gabi",
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
      // Gabi e Marina dividem a mesma fila (Marina só com o disparo dela ligado). O que já saiu hoje conta como da Gabi.
      const tetos = { gabi: cfg.wa_daily_cap, marina: cfg.marina_enabled ? (cfg.marina_daily_cap ?? 10) : 0 };
      const porSdr = { gabi: nv, marina: 0 };
      while (t < fim) {
        const vencidos = ativos.filter((s) => s.canal === "whatsapp" && s.due <= t).sort((a, b) => a.due.getTime() - b.due.getTime());
        if (vencidos.length && fu < (cfg.followup_daily_cap ?? 40)) {
          registrar(vencidos[0], t, false);
          fu++;
          t = new Date(t.getTime() + passoWa);
          continue;
        }
        const quem = !sabado && fila.length ? proximaSdr(porSdr, tetos) : null;
        if (quem) {
          const l = { ...fila.shift()!, agente: quem };
          const st: Estado = { lead: l, seq: l.sequencia ?? [], toque: 0, inicio: t, ultimo: null, due: t, canal: "whatsapp", atrasado: false };
          registrar(st, t, true);
          porSdr[quem]++;
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

// ---------------------------------------------------------------------------------------------
// Abordagem v2 (13/11/2026): cutucada + follow-ups da Gabi (ia-sdr: cutucada.ts e jobs.ts/runFollowUps).
// A cadência antiga não roda mais para quem recebeu o 1º contato a partir de 13/11, então sem isso a
// aba Envios mostrava sempre 0 follow-ups.

/** Mantenha igual a ia-sdr/src/lib/prospeccao.ts (FLUXO_V2_DESDE) e ia-sdr/src/lib/followup.ts (PROSPECCAO_V2). */
export const FLUXO_V2_DESDE = "2026-11-13T03:00:00Z";
const V2_INTERVALOS = [1, 1, 2, 2, 2, 3, 3];
const V2_MAX = 7;
/** Mantenha igual a ia-sdr/src/lib/cutucada-fila.ts */
const CUTUCADA_ATE_DIAS = 5;
const STATUS_COM_FOLLOWUP = ["novo", "em_qualificacao", "qualificado"];

/** Ficha da Gabi (sdr_leads), só o que a previsão usa. */
export interface FichaGabi {
  phone: string | null;
  status: string | null;
  ai_paused: boolean | null;
  followup_attempts: number | null;
  next_followup_at: string | null;
}

const fim8 = (t?: string | null) => String(t ?? "").replace(/\D/g, "").slice(-8);

/** Primeiro horário em que a Gabi manda mensagem da prospecção v2: seg a sex 8h às 18h, sábado 8h ao meio-dia. */
export function proximoHorarioV2(d: Date): Date {
  let t = d;
  for (let i = 0; i < 15; i++) {
    const dow = diaDaSemana(t);
    const min = Math.round((t.getTime() - inicioDoDia(t).getTime()) / 60e3);
    const fecha = dow === 6 ? 12 * 60 : 18 * 60;
    if (dow !== 0 && !FERIADOS.has(ymd(t))) {
      if (min < 8 * 60) return naHora(t, 8);
      if (min < fecha) return t;
    }
    t = naHora(new Date(inicioDoDia(t).getTime() + DIA + 12 * 3600e3), 8);
  }
  return t;
}

/**
 * Prevê a cutucada e os follow-ups da Gabi da abordagem v2:
 *  - quem já tem follow-up agendado na Gabi (sdr_leads.next_followup_at): esse e os seguintes até o 7º;
 *  - quem recebeu o 1º contato e ainda não foi cutucado: a cutucada (1 h depois, no próximo horário) e os 7 follow-ups;
 *  - os 1ºs contatos previstos em `primeiros`: o mesmo, se ninguém responder.
 * Tudo supõe que a pessoa não responde; se responder, a Gabi assume e a previsão some.
 */
export function preverV2(
  leads: OutreachLead[],
  fichas: FichaGabi[],
  primeiros: EnvioPrevisto[],
  cfg: OutreachConfig,
  agora = new Date(),
): EnvioPrevisto[] {
  const out: EnvioPrevisto[] = [];
  const hoje0 = inicioDoDia(agora);
  const followupsLigados = (cfg.followup_daily_cap ?? 40) > 0;
  const porTel = new Map<string, FichaGabi>();
  for (const f of fichas) if (fim8(f.phone).length === 8) porTel.set(fim8(f.phone), f);

  const cadeia = (lead: OutreachLead, inicio: Date, tentativa: number, atrasado: boolean, seNaoResponder: boolean) => {
    if (!followupsLigados) return;
    let t = inicio;
    for (let n = tentativa; n <= V2_MAX; n++) {
      out.push({ lead, quando: t, canal: "whatsapp", toque: n, total: V2_MAX, atrasado: atrasado && n === tentativa, tipo: "gabi", seNaoResponder, sdr: lead.agente === "marina" ? "marina" : "gabi" });
      t = proximoHorarioV2(new Date(t.getTime() + V2_INTERVALOS[n % V2_INTERVALOS.length] * DIA));
    }
  };
  const cutucadaEDepois = (lead: OutreachLead, enviadoEm: Date) => {
    const quando = proximoHorarioV2(new Date(Math.max(enviadoEm.getTime() + 3600e3, agora.getTime())));
    out.push({ lead, quando, canal: "whatsapp", toque: 0, total: 1, atrasado: enviadoEm < new Date(hoje0.getTime() - DIA), tipo: "cutucada", seNaoResponder: true, sdr: lead.agente === "marina" ? "marina" : "gabi" });
    cadeia(lead, proximoHorarioV2(new Date(quando.getTime() + V2_INTERVALOS[0] * DIA)), 1, false, true);
  };

  const limite = Math.max(new Date(FLUXO_V2_DESDE).getTime(), agora.getTime() - CUTUCADA_ATE_DIAS * DIA);
  for (const l of leads) {
    if (!l.wa_sent_at || l.wa_sent_at < FLUXO_V2_DESDE || !l.whatsapp) continue;
    if (["optout", "sem_whatsapp", "erro", "ignorado"].includes(l.wa_status)) continue;
    const ficha = porTel.get(fim8(l.whatsapp));
    if (ficha?.ai_paused || ficha?.status === "opt_out") continue;
    // Já tem follow-up agendado na Gabi
    if (ficha?.next_followup_at) {
      if (!STATUS_COM_FOLLOWUP.includes(ficha.status ?? "")) continue;
      const tent = (ficha.followup_attempts ?? 0) + 1;
      if (tent > V2_MAX) continue;
      const due = new Date(ficha.next_followup_at);
      cadeia(l, proximoHorarioV2(new Date(Math.max(due.getTime(), agora.getTime()))), tent, due < hoje0, false);
      continue;
    }
    // Ainda esperando a cutucada: recebeu o "Oi" e ninguém respondeu nem foi cutucado
    const env = new Date(l.wa_sent_at);
    const ult = l.ultimo_toque_em ? new Date(l.ultimo_toque_em).getTime() : 0;
    if (l.wa_status === "enviado" && env.getTime() >= limite && ult <= env.getTime() + 60e3) cutucadaEDepois(l, env);
  }
  for (const p of primeiros) if (p.tipo === "primeiro" && p.canal === "whatsapp") cutucadaEDepois(p.lead, p.quando);
  return out;
}
