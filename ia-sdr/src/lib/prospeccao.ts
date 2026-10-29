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
  diagnostico?: unknown;
}

const ultimos8 = (phone: string) => (phone || "").replace(/\D/g, "").slice(-8);

/** Lead da prospecção que já recebeu mensagem neste número (casando os 8 últimos dígitos). */
export async function prospeccaoDoTelefone(phone: string): Promise<Prospeccao | null> {
  const tail = ultimos8(phone);
  if (tail.length < 8) return null;
  const r = await db()
    .from("outreach_leads")
    .select("empresa,nicho,cidade,decisor,cargo_decisor,site,instagram,observacoes,wa_message,wa_sent_at,diagnostico")
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
Não foi o lead que nos procurou: VOCÊ mandou a primeira mensagem para ele em ${p.wa_sent_at ? formatBR(new Date(p.wa_sent_at)) : "data não registrada"}, oferecendo um diagnóstico gratuito do perfil da empresa no Google.
Mensagem que ele recebeu:
"${v(p.wa_message)}"

Dados que coletamos antes (Google Maps e CNPJ): Empresa: ${v(p.empresa)} | Nicho: ${v(p.nicho)} | Cidade: ${v(p.cidade)} | Decisor: ${v(p.decisor)}${p.cargo_decisor ? ` (${p.cargo_decisor})` : ""} | Site: ${v(p.site)} | Instagram: ${v(p.instagram)}${p.observacoes ? ` | Obs.: ${p.observacoes}` : ""}
${p.diagnostico ? `\nDiagnóstico do perfil no Google que usamos na abordagem (fatos verificados; pode usar na conversa, sem inventar nada além disso):\n${JSON.stringify(p.diagnostico)}\n` : ""}
Como conduzir neste caso:
- Continue a partir da sua mensagem, como quem dá sequência a um contato que você mesma iniciou. Não se apresente de novo e não pergunte "como posso ajudar?".
- Se ele topar o diagnóstico ("pode", "sim", "como funciona?"), explique em 2 ou 3 frases: o Kelvin analisa o perfil no Google e a presença digital da empresa frente aos concorrentes e mostra, numa conversa rápida, o que dá para melhorar para atrair mais clientes. Em seguida faça UMA pergunta para entender o momento da empresa e siga o fluxo normal de descoberta e qualificação até marcar a reunião de diagnóstico.
- Responda dúvidas e objeções com honestidade e de forma curta (ex.: "quanto custa?" → o diagnóstico é gratuito e o investimento só é discutido se fizer sentido depois; "já tenho agência" → o diagnóstico serve inclusive para comparar e não tem compromisso).
- Use os dados acima para personalizar, mas confirme com naturalidade em vez de afirmar o que não tem certeza.
- Se surgir uma pergunta ou objeção que você não sabe responder com segurança, ou se a conversa travar, chame \`encaminhar_humano\`: o Kelvin é avisado e assume.
- Se ele disser que não tem interesse ou pedir para sair, agradeça em uma frase, não insista e chame \`encerrar_contato\` com motivo "opt_out".`;
}
