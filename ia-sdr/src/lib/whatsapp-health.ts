/**
 * Vigia a conexão do WhatsApp da IA no Evolution GO.
 *
 * Roda junto com o agendador (/api/cron/tick, a cada 10 min). Se a VPS reiniciar ou a
 * instância cair, reconecta sozinha usando a sessão salva (POST /instance/reconnect),
 * como era feito à mão.
 *
 * Para não gerar alarme falso:
 * - Lentidão ou timeout do servidor NÃO conta como queda (só fica no log).
 * - Só reconecta depois de confirmar duas vezes, com 10s de intervalo, que está desconectado.
 * - Só avisa o Kelvin quando houve reconexão de verdade, no máximo 1 aviso a cada 24h.
 * Se a sessão foi deslogada (precisa ler o QR de novo), não há como reconectar sozinho:
 * isso fica registrado em sdr_events.
 */
import { db, logEvent } from "./db.ts";
import { env } from "./env.ts";
import { sendText } from "./evolution.ts";
import { instanciaDaSdr, tokenDaSdr } from "./instancias.ts";
import { nomeDaSdr, type Sdr } from "./sdrs.ts";

export interface WaStatus {
  connected: boolean;
  loggedIn: boolean;
  /** Evolution fora do ar (VPS desligada, erro de rede, etc.) */
  unreachable?: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STATE_KEY = "whatsapp_health";
const AVISO_INTERVALO_MS = 24 * 60 * 60 * 1000;

async function evoDe(path: string, method: "GET" | "POST", timeoutMs = 25_000, token = env.evolutionInstanceToken): Promise<Response> {
  return fetch(`${env.evolutionUrl}${path}`, {
    method,
    headers: { apikey: token, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export function parseStatus(json: unknown): WaStatus {
  const d = (json as { data?: Record<string, unknown> })?.data ?? {};
  return { connected: d.Connected === true, loggedIn: d.LoggedIn === true };
}

export async function getStatusDe(token = env.evolutionInstanceToken): Promise<WaStatus> {
  try {
    const res = await evoDe("/instance/status", "GET", 25_000, token);
    // Erro do servidor (5xx) é instabilidade do Evolution, não desconexão do WhatsApp.
    if (res.status >= 500) return { connected: false, loggedIn: false, unreachable: true, error: `status ${res.status}` };
    if (!res.ok) return { connected: false, loggedIn: false, error: `status ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return parseStatus(await res.json());
  } catch (e) {
    return { connected: false, loggedIn: false, unreachable: true, error: String(e) };
  }
}

export const isHealthy = (s: WaStatus) => s.connected && s.loggedIn;

/** Só é "desconectado" quando o servidor respondeu e disse que não está conectado. */
export const isConfirmedDown = (s: WaStatus) => !s.unreachable && !isHealthy(s);

interface HealthState {
  down_since: string | null;
  last_reconnect_at: string | null;
  last_alert_at: string | null;
  last_status: WaStatus | null;
}

async function carregarEstado(key = STATE_KEY): Promise<HealthState> {
  const { data } = await db().from("sdr_integrations").select("value").eq("key", key).maybeSingle();
  const saved = (data?.value ?? {}) as Partial<HealthState>;
  return {
    down_since: saved.down_since ?? null,
    last_reconnect_at: saved.last_reconnect_at ?? null,
    last_alert_at: saved.last_alert_at ?? null,
    last_status: saved.last_status ?? null,
  };
}

async function salvarEstado(s: HealthState, key = STATE_KEY) {
  await db().from("sdr_integrations").upsert({ key, value: s, updated_at: new Date().toISOString() });
}

/** Decide se manda aviso: só depois de reconexão real e no máximo 1 vez a cada 24h. */
export function shouldAlert(reconnected: boolean, lastAlertAt: string | null, now: Date): boolean {
  if (!reconnected) return false;
  return !lastAlertAt || now.getTime() - new Date(lastAlertAt).getTime() >= AVISO_INTERVALO_MS;
}

/** Vigia os números das duas SDRs (a Marina só depois de criada pelo portal). */
export async function ensureWhatsAppsConnected(now = new Date()) {
  const gabi = await ensureWhatsAppConnected(now, "gabi");
  const marina = (await instanciaDaSdr("marina").catch(() => null)) ? await ensureWhatsAppConnected(now, "marina").catch((e) => ({ ok: false, action: String(e) })) : null;
  return marina ? { ...gabi, marina } : gabi;
}

export async function ensureWhatsAppConnected(now = new Date(), sdr: Sdr = "gabi") {
  const token = sdr === "gabi" ? env.evolutionInstanceToken : await tokenDaSdr(sdr);
  const key = sdr === "gabi" ? STATE_KEY : `${STATE_KEY}_${sdr}`;
  const getStatus = () => getStatusDe(token);
  const loadState = () => carregarEstado(key);
  const saveState = (s: HealthState) => salvarEstado(s, key);
  const evo = (path: string, method: "GET" | "POST", timeoutMs = 25_000) => evoDe(path, method, timeoutMs, token);
  const state = await loadState();
  let status = await getStatus();

  // Servidor lento ou fora: não mexe em nada, só registra (sem aviso).
  if (status.unreachable) {
    await logEvent(null, "whatsapp_lento", { error: status.error });
    await saveState({ ...state, last_status: status });
    return { ok: false, action: "nenhuma (servidor lento)", status };
  }

  // Confirma a desconexão antes de agir: uma leitura isolada pode ser momentânea.
  if (isConfirmedDown(status)) {
    await sleep(10_000);
    status = await getStatus();
  }

  if (isHealthy(status) || !isConfirmedDown(status)) {
    if (state.down_since) await logEvent(null, "whatsapp_up", { down_since: state.down_since, reconnected: false });
    await saveState({ ...state, down_since: null, last_status: status });
    return { ok: isHealthy(status), action: "nenhuma", status };
  }

  // Desconectado de verdade (ex.: VPS reiniciou): reconecta com a sessão salva.
  if (status.connected && !status.loggedIn) {
    if (!state.down_since) await logEvent(null, "whatsapp_down", { status, motivo: "Sessão deslogada: precisa ler o QR Code de novo" });
    await saveState({ ...state, down_since: state.down_since ?? now.toISOString(), last_status: status });
    return { ok: false, action: "precisa de QR Code", status };
  }

  try {
    const r = await evo("/instance/reconnect", "POST", 30_000);
    await logEvent(null, "whatsapp_reconnect", { before: status, http: r.status, body: (await r.text()).slice(0, 300) });
  } catch (e) {
    await logEvent(null, "whatsapp_reconnect", { before: status, error: String(e) });
  }
  for (let i = 0; i < 4 && !isHealthy(status); i++) {
    await sleep(5_000);
    status = await getStatus();
  }
  const reconnected = isHealthy(status);
  const next: HealthState = { ...state, last_reconnect_at: now.toISOString(), last_status: status };

  if (reconnected) {
    await logEvent(null, "whatsapp_up", { down_since: state.down_since ?? now.toISOString(), reconnected: true });
    next.down_since = null;
    if (env.ownerPhone && shouldAlert(true, state.last_alert_at, now)) {
      const ok = await sendText(
        env.ownerPhone,
        `✅ O WhatsApp da ${nomeDaSdr(sdr)} tinha desconectado e foi reconectado sozinho. Ela segue atendendo normalmente. (Este aviso aparece no máximo 1 vez por dia.)`,
      ).then(() => true, () => false);
      if (ok) next.last_alert_at = now.toISOString();
    }
  } else {
    if (!state.down_since) await logEvent(null, "whatsapp_down", { status, motivo: "Não reconectou; tenta de novo a cada 10 min" });
    next.down_since = state.down_since ?? now.toISOString();
  }
  await saveState(next);
  return { ok: reconnected, action: "reconectou", status };
}

/** Status do número da Gabi (compatível com quem já chamava assim). */
export const getStatus = () => getStatusDe(env.evolutionInstanceToken);
