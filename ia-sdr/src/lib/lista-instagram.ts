/**
 * Lista do Instagram no fluxo do time (12/11/2026, pedido do Kelvin): a lista já vem pronta (a parte do Léo
 * foi a coleta dos comentários), então cada lead aprovado vira uma empresa da prospecção ativa e segue o
 * mesmo caminho do Google Meu Negócio: Rita (raio-x digital), Duda (relatório em PDF e site com a cara do
 * cliente), Bia e Rui (mensagens), aprovação do Kelvin e disparo da Gabi.
 *
 * Só entra quem tem WhatsApp (regra da lista). Quem já está na prospecção (mesmo WhatsApp ou mesmo perfil)
 * não entra de novo.
 */
import { db } from "./db.ts";
import { handleInstagram } from "./extras.ts";

export interface LeadListaInstagram {
  id: string;
  empresa: string;
  perfil: string | null;
  perfil_url: string | null;
  nicho: string | null;
  cidade: string | null;
  whatsapp: string | null;
  email: string | null;
  nota: string | null;
  fonte: string | null;
  comentario: string | null;
  observacoes: string | null;
  etapa: string;
}

export const fim8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);

/** WhatsApp no formato 55 + DDD + número (aceita com ou sem 55, com máscara). Nulo se não der. */
export function normalizarWhats(t: string | null | undefined): string | null {
  let d = (t ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^55\d{10,11}$/.test(d) ? d : null;
}

/** place_id da empresa que veio do Instagram (o Google não tem um para ela). */
export const placeIdInstagram = (handle: string) => `ig_${handle.toLowerCase()}`;

/** Monta a linha da prospecção ativa a partir do lead da lista do Instagram. Nulo se não tiver WhatsApp ou perfil. */
export function paraProspeccao(l: LeadListaInstagram, agora = new Date().toISOString()): Record<string, unknown> | null {
  const handle = handleInstagram(l.perfil_url) ?? handleInstagram(l.perfil);
  const whatsapp = normalizarWhats(l.whatsapp);
  if (!handle || !whatsapp) return null;
  const contexto = [
    l.comentario ? `Comentou: "${l.comentario.slice(0, 200)}"` : null,
    l.fonte ? `em post de ${l.fonte}` : null,
    l.nota ? `lead ${l.nota.toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    place_id: placeIdInstagram(handle),
    empresa: l.empresa,
    nicho: l.nicho,
    cidade: l.cidade,
    whatsapp,
    email: l.email,
    instagram: `https://www.instagram.com/${handle}/`,
    origem: "instagram",
    observacoes: [`[Lista do Instagram] ${contexto}`.trim(), l.observacoes].filter(Boolean).join("\n"),
    leo_status: "aprovado",
    leo_decidido_em: agora,
    wa_status: "pendente",
  };
}

/** Manda os leads escolhidos da lista do Instagram para o fluxo do time. */
export async function mandarParaOTime(ids: string[]): Promise<{ enviados: number; sem_whatsapp: number; ja_estavam: number; nomes: string[] }> {
  const { data, error } = await db()
    .from("comercial_lista_leads")
    .select("id,empresa,perfil,perfil_url,nicho,cidade,whatsapp,email,nota,fonte,comentario,observacoes,etapa")
    .eq("lista", "instagram")
    .in("id", ids.slice(0, 300));
  if (error) throw new Error(error.message);
  const leads = (data ?? []) as LeadListaInstagram[];

  const { data: existentes } = await db().from("outreach_leads").select("place_id,whatsapp").limit(20000);
  const jaTem = new Set<string>();
  for (const e of (existentes ?? []) as { place_id: string; whatsapp: string | null }[]) {
    jaTem.add(e.place_id);
    if (fim8(e.whatsapp)) jaTem.add(`w:${fim8(e.whatsapp)}`);
  }

  let semWhats = 0;
  let jaEstavam = 0;
  const novos: Record<string, unknown>[] = [];
  for (const l of leads) {
    const linha = paraProspeccao(l);
    if (!linha) {
      semWhats++;
      continue;
    }
    const w = `w:${fim8(linha.whatsapp as string)}`;
    if (jaTem.has(linha.place_id as string) || jaTem.has(w)) {
      jaEstavam++;
      continue;
    }
    jaTem.add(linha.place_id as string);
    jaTem.add(w);
    novos.push(linha);
  }
  if (novos.length) {
    const { error: e2 } = await db().from("outreach_leads").insert(novos);
    if (e2) throw new Error(e2.message);
    await db()
      .from("outreach_log")
      .insert({ channel: "portal", event: "config", detail: { msg: `Lista do Instagram: ${novos.length} empresa(s) mandada(s) para a Rita` } });
  }
  return { enviados: novos.length, sem_whatsapp: semWhats, ja_estavam: jaEstavam, nomes: novos.map((n) => String(n.empresa)) };
}
