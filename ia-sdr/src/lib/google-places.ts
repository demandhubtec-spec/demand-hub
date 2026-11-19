/**
 * Coleta de empresas pela API oficial do Google (Places API New, Text Search). 18/11 (Kelvin): o Apify grátis
 * acabou; a API do Google tem cota grátis por mês. Cada chamada traz até 20 lugares; até 3 páginas por busca.
 * A chave fica na Vercel em GOOGLE_PLACES_KEY (o Kelvin coloca; o código nunca guarda chave).
 *
 * Campos pedidos (telefone e site são do nível Enterprise: 1.000 chamadas grátis por mês). Limite próprio por
 * mês (GOOGLE_PLACES_MAX_MES, padrão 900) para nunca passar da cota grátis.
 */
import { db } from "./db.ts";

export const googlePlacesKey = () => process.env.GOOGLE_PLACES_KEY || "";
export const LIMITE_MES = () => Number(process.env.GOOGLE_PLACES_MAX_MES || 900);

const CAMPOS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "places.regularOpeningHours",
  "places.photos",
  "nextPageToken",
].join(",");

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Cidade do lugar pelos componentes do endereço. */
export function cidadeDoLugar(p: any): string | null {
  const comps: any[] = Array.isArray(p?.addressComponents) ? p.addressComponents : [];
  const c = comps.find((x) => (x.types ?? []).includes("administrative_area_level_2")) ?? comps.find((x) => (x.types ?? []).includes("locality"));
  return c?.longText ?? null;
}

/** Celular no formato que o importador aceita (55 + DDD + 9 dígitos); fixo também vai, o importador descarta. */
export function telefoneDoLugar(p: any): string | null {
  const intl = String(p?.internationalPhoneNumber ?? "").replace(/\D/g, "");
  if (intl) return intl;
  const nac = String(p?.nationalPhoneNumber ?? "").replace(/\D/g, "");
  return nac ? `55${nac.replace(/^0/, "")}` : null;
}

/** Um lugar da Places API no formato de importação do portal (o mesmo do Apify). */
export function leadDoGoogle(p: any, busca: { termo: string; nicho: string | null; cidade?: string }, posicao: number, total: number) {
  return {
    place_id: p.id,
    empresa: p.displayName?.text ?? null,
    cidade: cidadeDoLugar(p) || busca.cidade || null,
    nicho: busca.nicho,
    endereco: p.formattedAddress ?? null,
    telefone: p.nationalPhoneNumber ?? null,
    whatsapp: telefoneDoLugar(p),
    email: null,
    site: p.websiteUri ?? null,
    instagram: null,
    avaliacoes: p.userRatingCount ?? null,
    nota: p.rating ?? null,
    fotos: Array.isArray(p.photos) ? p.photos.length : null,
    categoria: p.primaryTypeDisplayName?.text ?? null,
    tem_descricao: null,
    tem_horario: !!p.regularOpeningHours,
    responde_avaliacoes: null,
    termo_busca: busca.termo,
    posicao_busca: posicao,
    total_busca: total || null,
    origem: "auto",
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Chamadas à Places API feitas neste mês (registradas no outreach_log). */
export async function chamadasDoMes(agora = new Date()): Promise<number> {
  const ini = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
  const { data } = await db().from("outreach_log").select("detail").eq("channel", "auto").eq("event", "google_places").gte("created_at", ini).limit(5000);
  return ((data ?? []) as { detail: { chamadas?: number } | null }[]).reduce((s: number, r) => s + Number(r.detail?.chamadas ?? 0), 0);
}

/** Roda uma busca (até `paginas` páginas de 20). Devolve os lugares e quantas chamadas usou. */
export async function buscarNoGoogle(termo: string, paginas = 3): Promise<{ lugares: unknown[]; chamadas: number }> {
  const key = googlePlacesKey();
  if (!key) throw new Error("GOOGLE_PLACES_KEY não configurada");
  const lugares: unknown[] = [];
  let token: string | undefined;
  let chamadas = 0;
  for (let i = 0; i < paginas; i++) {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": CAMPOS },
      body: JSON.stringify({ textQuery: termo, languageCode: "pt-BR", regionCode: "BR", pageSize: 20, ...(token ? { pageToken: token } : {}) }),
    });
    chamadas++;
    if (!r.ok) throw new Error(`Places ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { places?: unknown[]; nextPageToken?: string };
    lugares.push(...(j.places ?? []));
    token = j.nextPageToken;
    if (!token) break;
    // O Google pede um respiro antes de usar o token da próxima página
    await new Promise((res) => setTimeout(res, 1500));
  }
  return { lugares, chamadas };
}

/** Converte os lugares de uma busca em leads (posição pela ordem do Google), sem os fechados de vez. */
export function leadsDaBusca(lugares: unknown[], busca: { termo: string; nicho: string | null; cidade?: string }) {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const ok = (lugares as any[]).filter((p) => p?.id && p?.displayName?.text && p.businessStatus !== "CLOSED_PERMANENTLY");
  return ok.map((p, i) => leadDoGoogle(p, busca, i + 1, ok.length));
}
