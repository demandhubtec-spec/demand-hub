/**
 * Ponte entre a Prospecção Ativa (tabelas outreach_*) e a IA SDR.
 *
 * Decisão do Kelvin (opção C do handoff): quando um prospect responde, a Ana assume a conversa
 * JÁ SABENDO que foi uma abordagem ativa, e continua a partir da mensagem que foi enviada.
 *
 * Só lê outreach_leads. Quem escreve lá é o motor (outreach-wa-tick) e o portal.
 */
import { db } from "./db.ts";
import { formatBR } from "./time.ts";

export interface Prospeccao {
  empresa: string | null;
  nicho: string | null;
  cidade: string | null;
  decisor: string | null;
  cargo_decisor: string | null;
  site: string | null;
  instagram: string | null;
  observacoes: string | null;
  wa_message: string | null;
  wa_sent_at: string | null;
}

const ultimos8 = (phone: string) => (phone || "").replace(/\D/g, "").slice(-8);

/** Lead da prospecção que já recebeu mensagem neste número (casando os 8 últimos dígitos). */
export async function prospeccaoDoTelefone(phone: string): Promise<Prospeccao | null> {
  const tail = ultimos8(phone);
  if (tail.length < 8) return null;
  const r = await db()
    .from("outreach_leads")
    .select("empresa,nicho,cidade,decisor,cargo_decisor,site,instagram,observacoes,wa_message,wa_sent_at")
    .like("whatsapp", `%${tail}`)
    .not("wa_sent_at", "is", null)
    .order("wa_sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (r.data as Prospeccao | null) ?? null;
}

/**
 * A mensagem que acabou de sair do nosso número foi o disparo da prospecção?
 * (o motor usa a mesma instância do WhatsApp; sem isso o SDR acharia que foi o Kelvin
 * respondendo à mão e pausaria a IA para esse contato.)
 */
export function ehDisparoDaProspeccao(p: Prospeccao | null, texto: string, agora = new Date()): boolean {
  if (!p?.wa_sent_at) return false;
  // O disparo sai em balões: cada balão é um pedaço da mensagem registrada
  if (p.wa_message && texto.trim() && p.wa_message.includes(texto.trim())) return true;
  // Rede de segurança: disparo registrado há menos de 3 minutos
  return agora.getTime() - new Date(p.wa_sent_at).getTime() < 3 * 60_000;
}

/** Bloco que entra no prompt da Ana quando o contato veio da prospecção ativa. */
export function contextoProspeccao(p: Prospeccao | null): string {
  if (!p) return "";
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? "—" : String(x));
  return `

## Contexto: este contato veio da PROSPECÇÃO ATIVA
Não foi o lead que nos procurou: nós mandamos a primeira mensagem, em nome do Kelvin, em ${p.wa_sent_at ? formatBR(new Date(p.wa_sent_at)) : "data não registrada"}.
Mensagem que ele recebeu:
"${v(p.wa_message)}"

Dados que coletamos antes (Google Maps e CNPJ): Empresa: ${v(p.empresa)} | Nicho: ${v(p.nicho)} | Cidade: ${v(p.cidade)} | Decisor: ${v(p.decisor)}${p.cargo_decisor ? ` (${p.cargo_decisor})` : ""} | Site: ${v(p.site)} | Instagram: ${v(p.instagram)}${p.observacoes ? ` | Obs.: ${p.observacoes}` : ""}

Como conduzir neste caso:
- Continue a partir dessa mensagem, como quem está dando sequência a um contato que nós iniciamos. Não pergunte "como posso ajudar?" nem aja como se ele tivesse chegado sozinho.
- A mensagem foi assinada pelo Kelvin. Na primeira resposta, apresente-se como a assistente da equipe do Kelvin e retome a proposta da mensagem.
- Se ele aceitou ouvir ("pode mandar", "sim", "qual a ideia?"), explique em 2 ou 3 frases a ideia ligada ao negócio dele (use o nicho e a cidade) e faça UMA pergunta para entender o momento da empresa. Depois siga o fluxo normal de descoberta e qualificação.
- Use os dados acima para personalizar, mas confirme com naturalidade em vez de afirmar o que não tem certeza.
- Se ele disser que não tem interesse ou pedir para sair, agradeça em uma frase, não insista e chame \`encerrar_contato\` com motivo "opt_out".`;
}
