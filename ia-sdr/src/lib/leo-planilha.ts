/**
 * Lista do Léo em planilha (Google Sheets): uma linha por empresa, com tudo que o Léo achou,
 * para o Kelvin analisar uma por uma antes de aprovar.
 */
import { db } from "./db.ts";
import { accessToken } from "./google.ts";
import { formatarCnpj } from "./leo-pistas.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const COLUNAS_LISTA: [string, (l: any) => string][] = [
  ["Situação na lista", (l) => ({ pendente: "Aguardando sua aprovação", aprovado: "Aprovada", descartado: "Descartada" } as Record<string, string>)[l.leo_status] ?? "Léo ainda pesquisando"],
  ["Empresa", (l) => l.empresa],
  ["Nicho", (l) => l.nicho],
  ["Cidade", (l) => l.cidade],
  ["Nota no Google", (l) => (l.nota != null ? String(l.nota).replace(".", ",") : "")],
  ["Avaliações", (l) => l.avaliacoes],
  ["WhatsApp", (l) => l.whatsapp],
  ["Telefone", (l) => l.telefone],
  ["E-mail", (l) => l.email],
  ["Site", (l) => l.site],
  ["Site achado em", (l) => ({ google: "Google", whatsapp: "Recado do WhatsApp", instagram: "Bio do Instagram" } as Record<string, string>)[l.site_fonte] ?? (l.site ? "Google" : "Não tem")],
  ["Instagram", (l) => l.instagram],
  ["LinkedIn da empresa", (l) => l.linkedin_empresa],
  ["CNPJ", (l) => (l.cnpj ? formatarCnpj(l.cnpj) : "")],
  ["Razão social", (l) => l.razao_social],
  ["Situação na Receita", (l) => l.cnpj_situacao],
  ["Atividade", (l) => l.cnae],
  ["Porte", (l) => l.porte],
  ["Dono", (l) => l.decisor],
  ["Cargo do dono", (l) => l.cargo_decisor],
  ["Sócios", (l) => (Array.isArray(l.socios) ? l.socios.map((s: any) => s.nome).join(", ") : "")],
  ["LinkedIn do dono (confira)", (l) => l.linkedin_decisor],
  ["Instagram do dono (confira)", (l) => l.dono_instagram],
  ["Telefone na Receita", (l) => l.cnpj_telefone],
  ["E-mail na Receita", (l) => l.cnpj_email],
  ["Recado do WhatsApp", (l) => l.wa_recado],
  ["Endereço", (l) => l.endereco],
];
/* eslint-enable @typescript-eslint/no-explicit-any */

export const CAMPOS_LISTA =
  "place_id,empresa,nicho,cidade,nota,avaliacoes,whatsapp,telefone,email,site,site_fonte,instagram,linkedin_empresa,cnpj,razao_social,cnpj_situacao,cnae,porte,decisor,cargo_decisor,socios,linkedin_decisor,dono_instagram,cnpj_telefone,cnpj_email,wa_recado,endereco,leo_status,enriquecimento";

/** CSV (vírgula, aspas onde precisa) com a lista. */
export function listaEmCsv(leads: Record<string, unknown>[]): string {
  const cel = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [COLUNAS_LISTA.map(([t]) => cel(t)).join(","), ...leads.map((l) => COLUNAS_LISTA.map(([, f]) => cel(f(l))).join(","))].join("\n");
}

/** Cria (ou atualiza) a planilha "Lista do Léo" no Google Drive de quem conectou. Devolve o link. */
export async function publicarPlanilhaDoLeo(): Promise<string> {
  const { data, error } = await db()
    .from("outreach_leads")
    .select(CAMPOS_LISTA)
    .eq("wa_status", "pendente")
    .not("enriquecimento", "is", null)
    .order("leo_status", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  const csv = listaEmCsv((data ?? []) as unknown as Record<string, unknown>[]);
  const token = await accessToken("planilhas");
  const { data: salvo } = await db().from("sdr_integrations").select("value").eq("key", "planilha_leo").maybeSingle();
  let id = (salvo?.value as { id?: string } | undefined)?.id ?? null;

  if (id) {
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv; charset=utf-8" },
      body: csv,
    });
    if (r.status === 404) id = null; // apagaram a planilha: cria outra
    else if (!r.ok) throw new Error(erroDoDrive(r.status, await r.text()));
  }
  if (!id) {
    const limite = "leo" + Math.random().toString(36).slice(2);
    const corpo =
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: "Lista do Léo · DemandIA", mimeType: "application/vnd.google-apps.spreadsheet" }) +
      `\r\n--${limite}\r\nContent-Type: text/csv; charset=UTF-8\r\n\r\n${csv}\r\n--${limite}--`;
    const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${limite}` },
      body: corpo,
    });
    if (!r.ok) throw new Error(erroDoDrive(r.status, await r.text()));
    id = ((await r.json()) as { id: string }).id;
    await db().from("sdr_integrations").upsert({ key: "planilha_leo", value: { id }, updated_at: new Date().toISOString() });
  }
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

function erroDoDrive(status: number, txt: string): string {
  if (/has not been used|is disabled|accessNotConfigured/i.test(txt))
    return "A API do Google Drive está desligada no projeto do Google Cloud. Ative em console.cloud.google.com > APIs e serviços > Google Drive API > Ativar, e tente de novo.";
  return `Google Drive ${status}: ${txt.slice(0, 200)}`;
}
