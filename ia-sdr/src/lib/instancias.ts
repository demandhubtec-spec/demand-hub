/**
 * Números de WhatsApp (instâncias do Evolution GO) de cada SDR, lidos da tabela wa_instancias.
 * A Gabi usa as variáveis de ambiente de sempre; a Marina, o que foi criado pelo portal
 * (Comercial > Time Comercial IA > Ajustes > WhatsApp das SDRs).
 * Antes de rodar a migration 0035, tudo continua só com a Gabi.
 */
import { db } from "./db.ts";
import { phoneVariants } from "./diagnostico.ts";
import { env } from "./env.ts";
import { type Sdr, sdrValida } from "./sdrs.ts";

export interface Instancia {
  agente: Sdr;
  nome: string | null;
  token: string | null;
  numero: string | null;
}

let cache: { em: number; lista: Instancia[] } | null = null;

export function limparCacheInstancias() {
  cache = null;
}

export async function instancias(): Promise<Instancia[]> {
  if (cache && Date.now() - cache.em < 60_000) return cache.lista;
  const gabiEnv: Instancia = { agente: "gabi", nome: env.evolutionInstance || null, token: env.evolutionInstanceToken, numero: null };
  let lista: Instancia[] = [gabiEnv];
  try {
    const { data, error } = await db().from("wa_instancias").select("agente,nome,token,numero");
    if (!error && data) {
      const marina = (data as Instancia[]).find((i) => i.agente === "marina");
      const gabi = (data as Instancia[]).find((i) => i.agente === "gabi");
      lista = [{ ...gabiEnv, numero: gabi?.numero ?? null }];
      if (marina?.token) lista.push({ agente: "marina", nome: marina.nome, token: marina.token, numero: marina.numero });
    }
  } catch {
    /* tabela ainda não existe: só a Gabi */
  }
  cache = { em: Date.now(), lista };
  return lista;
}

export async function instanciaDaSdr(sdr: Sdr): Promise<Instancia | null> {
  return (await instancias()).find((i) => i.agente === sdr) ?? null;
}

/** Token da instância da SDR. Sem número conectado para ela: erro (nunca manda pelo número da outra). */
export async function tokenDaSdr(sdr: Sdr): Promise<string> {
  const i = await instanciaDaSdr(sdr);
  if (!i?.token) throw new Error(`a ${sdr === "marina" ? "Marina" : "Gabi"} ainda não tem número de WhatsApp conectado`);
  return i.token;
}

/** De qual SDR é a instância que mandou o webhook. Instância desconhecida: null. Sem nome (versões antigas): Gabi. */
export async function sdrDaInstancia(nome?: string | null, token?: string | null): Promise<Sdr | null> {
  if (!nome && !token) return "gabi";
  for (const i of await instancias()) {
    if ((nome && i.nome && nome === i.nome) || (token && i.token && token === i.token)) return i.agente;
  }
  // Sem EVOLUTION_INSTANCE configurado, a Gabi sempre aceitou qualquer instância (como antes)
  return env.evolutionInstance ? null : "gabi";
}

/** SDR responsável pelo contato (pelo telefone ou pelo JID). Contato novo ou erro: Gabi. */
export async function sdrDoContato(numeroOuJid: string): Promise<Sdr> {
  try {
    const q = db().from("sdr_leads").select("agente");
    const { data } = numeroOuJid.includes("@")
      ? await q.eq("whatsapp_jid", numeroOuJid).limit(1).maybeSingle()
      : await q.in("phone", phoneVariants(numeroOuJid)).limit(1).maybeSingle();
    return sdrValida((data as { agente?: string } | null)?.agente);
  } catch {
    return "gabi";
  }
}
