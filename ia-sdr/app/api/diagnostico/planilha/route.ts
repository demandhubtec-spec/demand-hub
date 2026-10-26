/**
 * Planilha dos cadastros da landing page, em CSV.
 * No Google Sheets: =IMPORTDATA("https://SEU-APP.vercel.app/api/diagnostico/planilha?key=ADMIN_SECRET")
 * Abrir no navegador com &download=1 baixa o arquivo .csv.
 */
import { db } from "@/src/lib/db.ts";
import { FAIXAS, PRAZOS, toCSV } from "@/src/lib/diagnostico.ts";
import { env } from "@/src/lib/env.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LEAD: Record<string, string> = {
  novo: "Novo",
  em_qualificacao: "Em conversa",
  qualificado: "Qualificado",
  desqualificado: "Fora do perfil",
  agendado: "Reunião marcada",
  humano: "Com o Kelvin",
  sem_resposta: "Sem resposta",
  opt_out: "Pediu para parar",
  cliente: "Cliente",
};

const brt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== env.adminSecret) return new Response("unauthorized", { status: 401 });

  const r = await db()
    .from("sdr_diagnosticos")
    .select("*, lead:sdr_leads(status,bant_score)")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (r.error) return new Response(`erro: ${r.error.message}`, { status: 500 });

  const rows = (r.data ?? []).map((d: any) => ({
    ...d,
    data: brt(d.created_at),
    faturamento: FAIXAS[d.faturamento_faixa]?.label ?? d.faturamento_faixa,
    prazo_txt: d.prazo ? PRAZOS[d.prazo] ?? d.prazo : "",
    whatsapp_fmt: `+${d.whatsapp}`,
    wa_link: `https://wa.me/${d.whatsapp}`,
    status_lead: STATUS_LEAD[d.lead?.status] ?? d.lead?.status ?? "",
    bant: d.lead?.bant_score != null ? `${d.lead.bant_score}/4` : "",
  }));

  const csv = toCSV(rows, [
    ["data", "Data"],
    ["nome", "Nome"],
    ["whatsapp_fmt", "WhatsApp"],
    ["email", "E-mail"],
    ["empresa", "Empresa"],
    ["segmento", "Segmento"],
    ["cargo", "Cargo"],
    ["faturamento", "Faturamento mensal"],
    ["equipe", "Equipe"],
    ["canais", "Como os clientes chegam"],
    ["invest_marketing", "Investe em marketing"],
    ["dores", "Maiores gargalos"],
    ["tempo_resposta", "Tempo de resposta"],
    ["prazo_txt", "Quando quer resolver"],
    ["desafio", "Maior desafio"],
    ["status_lead", "Status na IA"],
    ["bant", "BANT"],
    ["status", "Status do diagnóstico"],
    ["utm_source", "utm_source"],
    ["utm_medium", "utm_medium"],
    ["utm_campaign", "utm_campaign"],
    ["utm_content", "utm_content"],
    ["utm_term", "utm_term"],
    ["utm_id", "utm_id"],
    ["fbclid", "fbclid"],
    ["gclid", "gclid"],
    ["utm_primeiro_clique", "UTM do primeiro clique"],
    ["landing_url", "Página de entrada"],
    ["referrer", "Veio de"],
    ["wa_link", "Abrir conversa"],
    ["id", "ID"],
  ]);

  const headers: Record<string, string> = { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" };
  const download = !!url.searchParams.get("download");
  if (download) headers["Content-Disposition"] = `attachment; filename="diagnosticos-demandia.csv"`;
  // BOM só no download (para o Excel ler os acentos); o IMPORTDATA do Google lê UTF-8 direto
  return new Response((download ? String.fromCharCode(0xfeff) : "") + csv, { headers });
}
