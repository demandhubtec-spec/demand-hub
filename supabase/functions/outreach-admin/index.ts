// Edge Function: outreach-admin
// Chamada pela tela /comercial/prospeccao do portal, com o login do usuário.
// Só perfis "dono" passam. Ações:
//   { action: "status" }                       → instância do WhatsApp conectada?
//   { action: "send_test", number, text }      → envia uma mensagem de teste só para o número informado
// Secrets usados (já existem): EVOLUTION_API_URL, EVOLUTION_INSTANCE_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const EVO = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
const EVO_TOKEN = Deno.env.get("EVOLUTION_INSTANCE_TOKEN") ?? "";

async function evo(path: string, method: "GET" | "POST", body?: unknown) {
  return fetch(`${EVO}${path}`, {
    method,
    headers: { apikey: EVO_TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Quem está chamando? Precisa ser "dono" no portal.
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await admin.from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
  if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));

  if (body.action === "status") {
    try {
      const r = await evo("/instance/status", "GET");
      const d = ((await r.json().catch(() => ({}))) as { data?: Record<string, unknown> }).data ?? {};
      return json({ connected: d.Connected === true && d.LoggedIn !== false, loggedIn: d.LoggedIn === true });
    } catch (e) {
      return json({ connected: false, detail: String(e) });
    }
  }

  if (body.action === "send_test") {
    const number = String(body.number ?? "").replace(/\D/g, "");
    const text = String(body.text ?? "").trim();
    if (!/^55\d{10,11}$/.test(number) || !text) return json({ ok: false, error: "número ou texto inválido" }, 400);
    try {
      const { data: cfg } = await admin.from("outreach_config").select("evolution_send_path").eq("id", 1).single();
      const r = await evo(cfg?.evolution_send_path || "/send/text", "POST", { number, text });
      if (!r.ok) throw new Error(`Evolution ${r.status}: ${(await r.text()).slice(0, 200)}`);
      await admin.from("outreach_log").insert({ channel: "whatsapp", event: "sent_test", detail: { to: number, text, origem: "portal" } });
      return json({ ok: true });
    } catch (e) {
      await admin.from("outreach_log").insert({ channel: "whatsapp", event: "error", detail: { msg: `Teste para ${number}: ${String(e).slice(0, 300)}` } });
      return json({ ok: false, error: String(e) });
    }
  }

  return json({ error: "ação desconhecida" }, 400);
});
