/**
 * Chama o robô do GitHub (logo + PDF do relatório) quando tem trabalho para ele (12/11/2026).
 * O agendamento do próprio GitHub de 15 em 15 minutos não é confiável (ficou horas sem rodar), então o
 * relógio da IA SDR (cron/tick) dispara o robô direto pela API do GitHub.
 *
 * Precisa da variável GITHUB_ROBO_TOKEN na Vercel (token do GitHub só com permissão de "Actions" neste
 * repositório). Sem ela, não faz nada e o robô continua só no agendamento do GitHub.
 * Para não chamar à toa: só dispara se tem logo para conferir ou PDF para gerar, e no máximo a cada 10 minutos.
 */
import { db } from "./db.ts";

const REPO = "demandhubtec-spec/demand-hub";
const WORKFLOW = "relatorios-pdf.yml";
const INTERVALO_MIN = 10;

/** Mesma chave do pdf-render/rodar.mjs: muda quando o diagnóstico, a logo ou o site mudam. */
export function chaveDoPdf(l: { diag_em?: string | null; marca?: { logo?: string | null } | null; site_tk?: string | null; site_em?: string | null }): string {
  return [l.diag_em ?? "", l.marca?.logo ?? "nicho1", l.site_tk ?? "", l.site_em ?? ""].join("|");
}

/** Quantos itens o robô tem para fazer: logos para conferir e PDFs para gerar. */
export async function trabalhoDoRobo(): Promise<{ logos: number; pdfs: number }> {
  const { count: logos } = await db()
    .from("outreach_leads")
    .select("place_id", { count: "exact", head: true })
    .eq("wa_status", "pendente")
    .in("rita_status", ["pendente", "aprovado", "ajuste"])
    .is("marca->>logo_checado", null);
  const { data } = await db()
    .from("outreach_leads")
    .select("marca,diag_em:diagnosticos->>gerado_em,site_tk:site_preview->>token,site_em:site_preview->>gerado_em")
    .not("relatorio_token", "is", null)
    .in("duda_status", ["pendente", "aprovado"])
    .eq("wa_status", "pendente")
    .limit(300);
  const itens = (data ?? []) as unknown as { marca: { logo?: string | null; pdf_chave?: string | null } | null; diag_em: string | null; site_tk: string | null; site_em: string | null }[];
  const pdfs = itens.filter((l) => l.diag_em && l.marca?.pdf_chave !== chaveDoPdf(l)).length;
  return { logos: logos ?? 0, pdfs };
}

export async function dispararRoboPdf(agora = new Date()): Promise<Record<string, unknown>> {
  const token = process.env.GITHUB_ROBO_TOKEN;
  if (!token) return { skipped: "sem GITHUB_ROBO_TOKEN" };
  // O robô trabalha das 8h às 20h (Brasília), como no agendamento dele
  const hora = (agora.getUTCHours() + 21) % 24;
  if (hora < 8 || hora >= 20) return { skipped: "fora do horário" };

  const { data: ultimo } = await db()
    .from("outreach_log")
    .select("created_at")
    .eq("channel", "auto")
    .eq("event", "robo_pdf")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const desde = ultimo ? (agora.getTime() - Date.parse((ultimo as { created_at: string }).created_at)) / 60_000 : Infinity;
  if (desde < INTERVALO_MIN) return { skipped: `disparado há ${Math.round(desde)} min` };

  const fila = await trabalhoDoRobo();
  if (!fila.logos && !fila.pdfs) return { skipped: "nada na fila", ...fila };

  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }),
    signal: AbortSignal.timeout(15_000),
  });
  const ok = r.status === 204;
  await db()
    .from("outreach_log")
    .insert({ channel: "auto", event: "robo_pdf", detail: { ok, status: r.status, ...fila, erro: ok ? undefined : (await r.text()).slice(0, 200) } });
  return { disparado: ok, status: r.status, ...fila };
}
