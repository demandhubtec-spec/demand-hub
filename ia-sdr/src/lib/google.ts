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

/** state assinado (anti-CSRF) válido por 15 min */
export function oauthState(): string {
  const ts = Date.now().toString();
  const sig = createHmac("sha256", env.adminSecret).update(ts).digest("hex").slice(0, 32);
  return `${ts}.${sig}`;
}

export function validOauthState(state: string | null): boolean {
  if (!state) return false;
  const [ts, sig] = state.split(".");
  if (!ts || !sig || Date.now() - Number(ts) > 15 * 60_000) return false;
  const expected = createHmac("sha256", env.adminSecret).update(ts).digest("hex").slice(0, 32);
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export function authUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
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

export async function exchangeCode(code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("O Google não devolveu refresh_token. Remova o acesso do app na conta Google e conecte de novo.");
  await db().from("sdr_integrations").upsert({
    key: "google",
    value: { refresh_token: t.refresh_token, connected_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
}

let cache: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cache && cache.exp > Date.now() + 60_000) return cache.token;
  const row = await db().from("sdr_integrations").select("value").eq("key", "google").maybeSingle();
  const refresh = (row.data?.value as { refresh_token?: string } | undefined)?.refresh_token;
  if (!refresh) throw new Error("Google Agenda não conectado. Acesse /api/google/connect?secret=ADMIN_SECRET");
  const t = await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });
  cache = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 };
  return cache.token;
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
