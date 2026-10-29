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
import { linkPrevia } from "./extras.ts";

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
  /** Cadência: os toques escritos pela Ana e quantos já foram feitos. */
  sequencia?: { n: number; canal: string; assunto?: string; texto: string }[] | null;
  toque_atual?: number | null;
  ultimo_toque_em?: string | null;
  /** Prévia de site grátis montada para quem não tem site próprio. */
  site_preview?: { token?: string } | null;
}

const ultimos8 = (phone: string) => (phone || "").replace(/\D/g, "").slice(-8);

/** Lead da prospecção que já recebeu mensagem neste número (casando os 8 últimos dígitos). */
export async function prospeccaoDoTelefone(phone: string): Promise<Prospeccao | null> {
  const tail = ultimos8(phone);
  if (tail.length < 8) return null;
  const r = await db()
    .from("outreach_leads")
    .select("empresa,nicho,cidade,decisor,cargo_decisor,site,instagram,observacoes,wa_message,wa_sent_at,diagnostico,sequencia,toque_atual,ultimo_toque_em,site_preview")
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
  if (!p) return false;
  const t = texto.trim();
  // O disparo sai em balões: cada balão é um pedaço de uma mensagem da cadência
  const textos = [p.wa_message, ...(p.sequencia ?? []).filter((x) => x.canal === "whatsapp").map((x) => x.texto)];
  if (t && textos.some((x) => x && x.includes(t))) return true;
  // Rede de segurança: toque registrado há menos de 3 minutos
  const ultimo = [p.wa_sent_at, p.ultimo_toque_em].filter(Boolean).map((x) => new Date(x!).getTime());
  return ultimo.some((ms) => agora.getTime() - ms < 3 * 60_000);
}

/** Mensagens da cadência que o contato já recebeu (WhatsApp e e-mail), em ordem. */
export function toquesRecebidos(p: Prospeccao): string {
  const feitos = (p.sequencia ?? []).slice(0, Math.max(p.toque_atual ?? 0, 1));
  if (!feitos.length) return p.wa_message ? `- WhatsApp: "${p.wa_message}"` : "";
  return feitos
    .map((x) => (x.canal === "email" ? `- E-mail (assunto "${x.assunto ?? ""}"): "${x.texto}"` : `- WhatsApp: "${x.texto}"`))
    .join("\n");
}

/** Bloco que entra no prompt da Ana quando o contato veio da prospecção ativa. */
export function contextoProspeccao(p: Prospeccao | null): string {
  if (!p) return "";
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? "não informado" : String(x));
  return `

## Contexto: este contato veio da PROSPECÇÃO ATIVA
Não foi o lead que nos procurou: VOCÊ mandou a primeira mensagem para ele em ${p.wa_sent_at ? formatBR(new Date(p.wa_sent_at)) : "data não registrada"}, oferecendo um diagnóstico gratuito do perfil da empresa no Google.
Mensagens que ele já recebeu de você (as que podem não ter sido lidas também contam; não repita o que já disse):
${toquesRecebidos(p) || `"${v(p.wa_message)}"`}

Dados que coletamos antes (Google Maps e CNPJ): Empresa: ${v(p.empresa)} | Nicho: ${v(p.nicho)} | Cidade: ${v(p.cidade)} | Decisor: ${v(p.decisor)}${p.cargo_decisor ? ` (${p.cargo_decisor})` : ""} | Site: ${v(p.site)} | Instagram: ${v(p.instagram)}${p.observacoes ? ` | Obs.: ${p.observacoes}` : ""}
${p.diagnostico ? `\nDiagnóstico do perfil no Google que usamos na abordagem (fatos verificados; pode usar na conversa, sem inventar nada além disso):\n${JSON.stringify(p.diagnostico)}\n` : ""}
Como conduzir neste caso:
- Continue a partir da sua mensagem, como quem dá sequência a um contato que você mesma iniciou. Não se apresente de novo e não pergunte "como posso ajudar?".
- Se ele topar o diagnóstico ("pode", "sim", "como funciona?"), explique em 2 ou 3 frases: nosso especialista em presença digital analisa o perfil no Google e a presença digital da empresa frente aos concorrentes e mostra, numa conversa rápida, o que dá para melhorar para atrair mais clientes. Em seguida faça UMA pergunta para entender o momento da empresa e siga o fluxo normal de descoberta e qualificação até marcar a reunião de diagnóstico.
- Reciprocidade: quando ele mostrar interesse, ANTES de pedir qualquer coisa, entregue uma prévia do diagnóstico em 1 ou 2 mensagens curtas: 2 ou 3 achados concretos do perfil (use o diagnóstico acima, com os números) e o que cada um causa na prática. Depois diga que no diagnóstico completo com o nosso especialista ele vê o resto e um plano, e siga para a qualificação.
- Conduza com SPIN, uma pergunta por vez: situação (como os clientes chegam hoje), problema (o que não está funcionando), implicação (o que isso custa) e necessidade (o que mudaria se resolvesse). Use as respostas dele para mostrar valor no diagnóstico.
${p.site_preview?.token ? `- Prévia de site grátis: já montamos um rascunho de como ficaria o site da empresa: ${linkPrevia(p.site_preview.token)} . Se ele demonstrar interesse em site, ou aceitar a prévia oferecida, mande esse link (é presente, sem compromisso) e diga que o site completo é feito sob medida, com orçamento à parte, que o nosso especialista apresenta no diagnóstico.
` : ""}- Responda dúvidas e objeções com honestidade e de forma curta (ex.: "quanto custa?" → o diagnóstico é gratuito e o investimento só é discutido se fizer sentido depois; "já tenho agência" → o diagnóstico serve inclusive para comparar e não tem compromisso).
- Use os dados acima para personalizar, mas confirme com naturalidade em vez de afirmar o que não tem certeza.
- Se surgir uma pergunta ou objeção que você não sabe responder com segurança, ou se a conversa travar, chame \`encaminhar_humano\`: a equipe é avisada e assume.
- Se ele disser que não tem interesse ou pedir para sair, agradeça em uma frase, não insista e chame \`encerrar_contato\` com motivo "opt_out".`;
}
