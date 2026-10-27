/**
 * Vigia a conexão do WhatsApp da IA no Evolution GO.
 *
 * Roda junto com o agendador (/api/cron/tick, a cada 10 min). Se a VPS reiniciar ou a
 * instância cair, reconecta sozinha usando a sessão salva (POST /instance/reconnect),
 * como era feito à mão. Quando a conexão volta depois de uma queda, avisa o Kelvin
 * no WhatsApp. Se a sessão foi deslogada (precisa ler o QR de novo), não há como
 * reconectar sozinho: isso fica registrado em sdr_events.
 */
import { db, logEvent } from "./db.ts";
import { env } from "./env.ts";
import { sendText } from "./evolution.ts";

export interface WaStatus {
  connected: boolean;
  loggedIn: boolean;
  /** Evolution fora do ar (VPS desligada, erro de rede, etc.) */
  unreachable?: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STATE_KEY = "whatsapp_health";

async function evo(path: string, method: "GET" | "POST"): Promise<Response> {
  return fetch(`${env.evolutionUrl}${path}`, {
    method,
    headers: { apikey: env.evolutionInstanceToken, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
}

export function parseStatus(json: unknown): WaStatus {
  const d = (json as { data?: Record<string, unknown> })?.data ?? {};
  return { connected: d.Connected === true, loggedIn: d.LoggedIn === true };
}

export async function getStatus(): Promise<WaStatus> {
  try {
    const res = await evo("/instance/status", "GET");
    if (!res.ok) return { connected: false, loggedIn: false, error: `status ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return parseStatus(await res.json());
  } catch (e) {
    return { connected: false, loggedIn: false, unreachable: true, error: String(e) };
  }
}

export const isHealthy = (s: WaStatus) => s.connected && s.loggedIn;

interface HealthState {
  down_since: string | null;
  last_reconnect_at: string | null;
  last_status: WaStatus | null;
}

async function loadState(): Promise<HealthState> {
  const { data } = await db().from("sdr_integrations").select("value").eq("key", STATE_KEY).maybeSingle();
  const saved = (data?.value ?? {}) as Partial<HealthState>;
  return { down_since: saved.down_since ?? null, last_reconnect_at: saved.last_reconnect_at ?? null, last_status: saved.last_status ?? null };
}

async function saveState(s: HealthState) {
  await db().from("sdr_integrations").upsert({ key: STATE_KEY, value: s, updated_at: new Date().toISOString() });
}

function minutesSince(iso: string, now: Date) {
  return Math.max(1, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
}

export async function ensureWhatsAppConnected(now = new Date()) {
  const state = await loadState();
  let status = await getStatus();
  let reconnected = false;

  if (!isHealthy(status) && !status.unreachable) {
    // Sessão salva + cliente parado (ex.: depois de reiniciar a VPS): o reconnect resolve.
    try {
      const r = await evo("/instance/reconnect", "POST");
      await logEvent(null, "whatsapp_reconnect", { before: status, http: r.status, body: (await r.text()).slice(0, 300) });
    } catch (e) {
      await logEvent(null, "whatsapp_reconnect", { before: status, error: String(e) });
    }
    state.last_reconnect_at = now.toISOString();
    for (let i = 0; i < 4 && !isHealthy(status); i++) {
      await sleep(5_000);
      status = await getStatus();
    }
    reconnected = isHealthy(status);
  }

  if (isHealthy(status)) {
    const wasDown = state.down_since;
    if (wasDown || reconnected) {
      const desde = wasDown ?? now.toISOString();
      await logEvent(null, "whatsapp_up", { down_since: desde, reconnected });
      if (env.ownerPhone) {
        await sendText(
          env.ownerPhone,
          `✅ O WhatsApp da IA tinha desconectado (há ~${minutesSince(desde, now)} min) e já foi reconectado sozinho. A Ana voltou a atender normalmente.`,
        ).catch(() => {});
      }
    }
    await saveState({ down_since: null, last_reconnect_at: state.last_reconnect_at, last_status: status });
    return { ok: true, reconnected, status };
  }

  // Continua fora: registra só na primeira vez para não lotar o log.
  if (!state.down_since) {
    await logEvent(null, "whatsapp_down", {
      status,
      motivo: status.unreachable
        ? "Evolution fora do ar (VPS desligada ou sem rede)"
        : status.connected && !status.loggedIn
          ? "Sessão deslogada: precisa ler o QR Code de novo"
          : "Não reconectou na primeira tentativa; tenta de novo a cada 10 min",
    });
  }
  await saveState({ down_since: state.down_since ?? now.toISOString(), last_reconnect_at: state.last_reconnect_at, last_status: status });
  return { ok: false, reconnected: false, status };
}
