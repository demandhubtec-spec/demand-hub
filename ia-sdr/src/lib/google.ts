/**
 * Google Agenda via REST: OAuth (refresh token salvo no Supabase), disponibilidade e criação de evento com Meet.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { db } from "./db.ts";
import { env } from "./env.ts";
import type { Interval } from "./schedule.ts";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];
const API = "https://www.googleapis.com/calendar/v3";

export function redirectUri() {
  return `${env.appUrl}/api/google/callback`;
}

/** Qual conta Google: "google" = Agenda da IA SDR · "gmail" = envio de e-mails da prospecção */
export type GoogleKind = "google" | "gmail";

const SCOPES_BY_KIND: Record<GoogleKind, string[]> = {
  google: SCOPES,
  // send: enviar os e-mails da cadência · readonly: ver quem respondeu (e quem voltou por endereço inválido)
  gmail: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
};

function sign(payload: string) {
  return createHmac("sha256", env.adminSecret).update(payload).digest("hex").slice(0, 32);
}

/** state assinado (anti-CSRF) válido por 15 min. Formato: "<kind>.<ts>.<sig>" */
export function oauthState(kind: GoogleKind = "google"): string {
  const ts = Date.now().toString();
  return `${kind}.${ts}.${sign(kind === "google" ? ts : `${kind}:${ts}`)}`;
}

/** Devolve qual integração o state autoriza, ou null se for inválido/expirado. */
export function validOauthState(state: string | null): GoogleKind | null {
  if (!state) return null;
  const parts = state.split(".");
  const [kind, ts, sig] = parts.length === 3 ? parts : ["google", parts[0], parts[1]];
  if (kind !== "google" && kind !== "gmail") return null;
  if (!ts || !sig || Date.now() - Number(ts) > 15 * 60_000) return null;
  const expected = sign(kind === "google" ? ts : `${kind}:${ts}`);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  return kind;
}

export function authUrl(state: string, kind: GoogleKind = "google"): string {
  const p = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES_BY_KIND[kind].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      ...params,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google OAuth: ${JSON.stringify(json)}`);
  return json as { access_token: string; expires_in: number; refresh_token?: string };
}

export async function exchangeCode(code: string, kind: GoogleKind = "google") {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("O Google não devolveu refresh_token. Remova o acesso do app na conta Google e conecte de novo.");
  let email: string | null = null;
  if (kind === "gmail") {
    // Descobre qual Gmail foi conectado (será o remetente dos e-mails)
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${t.access_token}` },
    }).catch(() => null);
    email = r?.ok ? ((await r.json()) as { emailAddress?: string }).emailAddress ?? null : null;
  }
  await db().from("sdr_integrations").upsert({
    key: kind,
    value: { refresh_token: t.refresh_token, connected_at: new Date().toISOString(), ...(email ? { email } : {}) },
    updated_at: new Date().toISOString(),
  });
  cache.delete(kind);
  return { email };
}

const cache = new Map<GoogleKind, { token: string; exp: number }>();

export async function accessToken(kind: GoogleKind = "google"): Promise<string> {
  const hit = cache.get(kind);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const row = await db().from("sdr_integrations").select("value").eq("key", kind).maybeSingle();
  const refresh = (row.data?.value as { refresh_token?: string } | undefined)?.refresh_token;
  if (!refresh) {
    throw new Error(
      kind === "gmail"
        ? "Gmail não conectado. Acesse /api/google/connect?secret=ADMIN_SECRET&tipo=gmail"
        : "Google Agenda não conectado. Acesse /api/google/connect?secret=ADMIN_SECRET",
    );
  }
  const t = await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });
  cache.set(kind, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

async function gfetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
  });
  const json = res.status === 204 ? {} : await res.json();
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

export async function busyIntervals(from: Date, to: Date): Promise<Interval[]> {
  const cal = env.googleCalendarId;
  const json = await gfetch("/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      timeZone: "America/Sao_Paulo",
      items: [{ id: cal }],
    }),
  });
  const busy = (json.calendars?.[cal]?.busy ?? []) as { start: string; end: string }[];
  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

export async function createMeeting(input: {
  start: Date;
  end: Date;
  summary: string;
  description: string;
  attendees: string[];
}): Promise<{ eventId: string; meetLink: string | null; htmlLink: string }> {
  const ev = await gfetch(
    `/calendars/${encodeURIComponent(env.googleCalendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.start.toISOString(), timeZone: "America/Sao_Paulo" },
        end: { dateTime: input.end.toISOString(), timeZone: "America/Sao_Paulo" },
        attendees: input.attendees.map((email) => ({ email })),
        conferenceData: {
          createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 15 }] },
      }),
    },
  );
  const meet =
    ev.hangoutLink ??
    ev.conferenceData?.entryPoints?.find((e: { entryPointType: string }) => e.entryPointType === "video")?.uri ??
    null;
  return { eventId: ev.id, meetLink: meet, htmlLink: ev.htmlLink };
}

export async function cancelMeeting(eventId: string) {
  await gfetch(`/calendars/${encodeURIComponent(env.googleCalendarId)}/events/${eventId}?sendUpdates=all`, {
    method: "DELETE",
  });
}
