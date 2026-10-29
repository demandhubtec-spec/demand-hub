// Edge Function: outreach-import  (substitui a planilha como porta de entrada dos leads)
// Publicada também como https://portal.demandhub.com.br/api/prospeccao/* (rewrite no vercel.json).
//
//   POST /leads       { coleta?, leads: [...] } → { recebidos, novos, duplicados }
//   GET  /orcamento                              → { mes, gasto_usd, teto_usd }
//
// Auth: Authorization: Bearer <PROSPECCAO_IMPORT_TOKEN>  (se não existir, usa OUTREACH_API_SECRET)
// Deploy SEM verificação de JWT (o agente de coleta usa o token próprio acima).
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const token = Deno.env.get("PROSPECCAO_IMPORT_TOKEN") || Deno.env.get("OUTREACH_API_SECRET") || "";
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || auth !== token) return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const path = new URL(req.url).pathname;

  if (req.method === "GET" && path.endsWith("/orcamento")) {
    const { data, error } = await db.rpc("outreach_orcamento");
    if (error) return json({ error: error.message }, 500);
    return json(data);
  }

  if (req.method === "POST" && (path.endsWith("/leads") || path.endsWith("/outreach-import"))) {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.leads)) return json({ error: "body precisa ter { leads: [...] }" }, 400);

    // Trava do orçamento do Apify (US$ 4/mês)
    if (body.coleta?.custo_usd) {
      const { data: orc } = await db.rpc("outreach_orcamento");
      const gasto = Number(orc?.gasto_usd ?? 0);
      if (gasto + Number(body.coleta.custo_usd) > Number(orc?.teto_usd ?? 4) + 0.001) {
        await db.from("outreach_log").insert({ channel: "sync", event: "error", detail: { msg: `Coleta acima do teto de US$ ${orc?.teto_usd ?? 4}: já gasto ${gasto} + ${body.coleta.custo_usd}` } });
      }
    }

    const { data, error } = await db.rpc("outreach_import_leads", { p: body });
    if (error) return json({ error: error.message }, 500);
    return json(data);
  }

  return json({ error: "not found" }, 404);
});
