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
  place_id?: string;
  email?: string | null;
  empresa: string | null;
  cadencia?: string | null;
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
  /** Funil das conversas: retorno combinado, marcadores do objetivo e retomadas. */
  status_comercial?: string | null;
  retorno_em?: string | null;
  retorno_nota?: string | null;
  diag_enviado_em?: string | null;
  responsavel_contato?: string | null;
  retomadas?: number | null;
  retomada_em?: string | null;
}

const ultimos8 = (phone: string) => (phone || "").replace(/\D/g, "").slice(-8);

/** Lead da prospecção que já recebeu mensagem neste número (casando os 8 últimos dígitos). */
export async function prospeccaoDoTelefone(phone: string): Promise<Prospeccao | null> {
  const tail = ultimos8(phone);
  if (tail.length < 8) return null;
  const r = await db()
    .from("outreach_leads")
    .select("place_id,email,empresa,cadencia,nicho,cidade,decisor,cargo_decisor,site,instagram,observacoes,wa_message,wa_sent_at,diagnostico,sequencia,toque_atual,ultimo_toque_em,site_preview,status_comercial,retorno_em,retorno_nota,diag_enviado_em,responsavel_contato,retomadas,retomada_em")
    .like("whatsapp", `%${tail}`)
    // O robô marca ultimo_toque_em ANTES de enviar e wa_sent_at só depois; a resposta automática
    // da empresa pode chegar nesse meio tempo, então vale qualquer um dos dois.
    .or("wa_sent_at.not.is.null,ultimo_toque_em.not.is.null")
    .order("ultimo_toque_em", { ascending: false, nullsFirst: false })
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
  // 1º contato com o áudio da Ana: a mensagem 1 da sequência (a análise) ainda não saiu, vira o próximo toque
  const audio = abriuComAudio(p);
  const feitos = (p.sequencia ?? []).slice(0, audio ? Math.max(p.toque_atual ?? 0, 0) : Math.max(p.toque_atual ?? 0, 1));
  const linhas = feitos.map((x) =>
    x.canal === "email" ? `- E-mail (assunto "${x.assunto ?? ""}"): "${x.texto}"` : `- WhatsApp: "${x.texto}"`,
  );
  if (audio) linhas.unshift(`- WhatsApp (1º contato: saudação e um áudio seu): "${p.wa_message}"`);
  if (!linhas.length) return p.wa_message ? `- WhatsApp: "${p.wa_message}"` : "";
  return linhas.join("\n");
}

/** O 1º contato foi "Oi" + "Tudo bem?" + áudio da Ana (o texto do áudio fica no wa_message). */
export function abriuComAudio(p: Prospeccao): boolean {
  return !!p.wa_message && p.wa_message.includes("[Áudio da Ana]");
}

/** A análise aprovada que ainda não foi enviada (quando o 1º contato foi o áudio). */
function analisePendente(p: Prospeccao): string {
  if (!abriuComAudio(p) || (p.toque_atual ?? 0) > 0) return "";
  const a = (p.sequencia ?? [])[0];
  if (!a?.texto) return "";
  return `\nA análise do perfil (aprovada) AINDA NÃO foi enviada. Se a pessoa pedir a análise, perguntar o que você viu ou demonstrar interesse, mande este conteúdo em balões curtos, adaptando só o começo para a conversa (sem se apresentar de novo):\n"${a.texto}"\n`;
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
${p.diagnostico ? `\nDiagnóstico do perfil no Google que usamos na abordagem (fatos verificados; pode usar na conversa, sem inventar nada além disso):\n${JSON.stringify(p.diagnostico)}\n` : ""}${analisePendente(p)}
Objetivo desta conversa (é para isso que você trabalha): chegar até o responsável (quem cuida do marketing, do comercial ou do perfil no Google) e marcar uma conversa de 30 minutos ou uma ligação rápida com o nosso especialista, oferecendo o diagnóstico gratuito. Toda mensagem sua deve aproximar a conversa desse objetivo, com leveza.
Situação do objetivo agora: diagnóstico ${p.diag_enviado_em ? "já enviado" : "ainda não enviado"} · contato do responsável ${p.responsavel_contato ? `já temos (${p.responsavel_contato})` : "ainda não temos"}${p.retorno_em ? ` · retorno combinado para ${formatBR(new Date(p.retorno_em))}${p.retorno_nota ? ` (${p.retorno_nota})` : ""}` : ""}.

Como conduzir neste caso (caminho curto: valor primeiro, depois convite com horário concreto):
- Registre o progresso com \`registrar_objetivo\`: quando mandar os achados ou a análise do diagnóstico (diagnostico_enviado), e quando descobrir quem é o responsável e o contato dele (responsavel: nome e telefone ou e-mail).
- Continue a partir da sua mensagem, como quem dá sequência a um contato que você mesma iniciou. Não se apresente de novo e não pergunte "como posso ajudar?".
- Primeiro descubra com quem você fala: quem decide (dono, sócio, médico ou advogado titular, gestor do marketing ou do perfil no Google) ou a recepção/secretária. Se não der para saber, trate como recepção.

Se for QUEM DECIDE:
1. Entregue valor logo: 2 ou 3 achados concretos do diagnóstico acima, com os números, e o que cada um causa na prática (paciente/cliente indo para o concorrente). Não explique como resolver: isso é o que o especialista mostra.
2. Chame \`lead_quente\` (o especialista é avisado para ligar) e, na mesma resposta, convide para a conversa gratuita de 30 minutos com o nosso especialista oferecendo DOIS horários reais: chame \`ver_horarios\` e diga algo como "consigo amanhã às 10h ou quinta às 15h, qual fica melhor?". Nunca pergunte "qual o melhor dia e horário?" no vazio.
3. Se ele escolher um horário, peça o e-mail para o convite e chame \`agendar_reuniao\`. Se nenhum horário servir, ofereça outros de \`ver_horarios\` ou uma ligação rápida de 10 minutos no horário que ele disser (aí use \`combinar_retorno\` e \`lead_quente\`).
4. ZERO perguntas sobre o negócio (como os clientes chegam, indicação ou Google, se já têm alguém cuidando, faturamento, equipe). O diagnóstico já responde isso: a única pergunta é qual dos 2 horários fica melhor.
5. Se ele não responder ao convite, não troque o convite por pergunta de descoberta: a retomada volta com 2 horários novos.

Se for a RECEPÇÃO ou SECRETÁRIA (ela não marca reunião, então não qualifique nem venda para ela):
1. Pergunte, numa frase só, o nome de quem decide sobre o perfil no Google e o WhatsApp direto dessa pessoa (ou o horário em que ela está aí). Não encerre a conversa com a recepção sem ter pedido isso; se ela não passar o WhatsApp, peça ao menos o nome e o melhor horário.
2. Ofereça um resumo curtinho para ela repassar e mande 2 achados em 1 mensagem, terminando com o convite: "se fizer sentido, nosso especialista mostra o restante numa conversa de 30 minutos, sem custo".
3. Se passarem o contato de quem decide, registre com \`registrar_objetivo\`. Se disserem quando a pessoa está (ex.: "o Adriano, só na terça depois das 10h"), chame \`combinar_retorno\` com data, hora e nome, agradeça e pare por aí.
4. Se pedirem para mandar por e-mail ou passarem um e-mail: agradeça, diga que manda a análise para esse e-mail ainda hoje e chame \`encaminhar_humano\` com tipo "enviar_email" (o e-mail e o nome de quem pediu no motivo). Depois disso, peça o nome de quem vai ler o e-mail, se ainda não souber.
5. Se disserem só "vou repassar, se tiver interesse retornamos": agradeça, pergunte o nome da pessoa que vai receber e combine que você retoma em 2 dias úteis (\`combinar_retorno\`).

Regras que valem sempre aqui:
- NUNCA diga "vou encaminhar para a nossa equipe", "alguém responde por aqui em breve" ou "vou deixar a equipe assumir". Quem procurou a empresa foi você: você continua a conversa até a reunião ou até um retorno combinado.
- Nunca repita uma pergunta que já fez. Menus, robôs e mensagens automáticas não são resposta: ignore-os. Não escolha opção de menu e não mande a mesma pergunta de novo para um robô: se o último que falou foi um robô e você já mandou sua mensagem, espere uma pessoa responder.
- Nunca diga que enviou algo que não está nesta conversa (e-mail, PDF, análise). E-mail: "mando ainda hoje", nunca "enviei".
- Se a pessoa pedir para falar depois ("me chama semana que vem", "volto de férias dia 10"), chame \`combinar_retorno\` com a data.
- NÃO pergunte faturamento, receita, número de funcionários, de onde vêm os clientes nem se já têm alguém cuidando do marketing.
${p.site_preview?.token ? `- Prévia de site gratuita: já montamos um rascunho de como ficaria o site da empresa: ${linkPrevia(p.site_preview.token)} . Se ele demonstrar interesse em site, ou aceitar a prévia oferecida, mande esse link (é presente, sem compromisso) e diga que o site completo é feito sob medida, com orçamento à parte, que o nosso especialista apresenta no diagnóstico.
` : ""}- Mensagens curtas, uma ideia por balão, sem listas com quebra de linha.
- Responda dúvidas e objeções com honestidade e de forma curta (ex.: "quanto custa?" → o diagnóstico é gratuito e o investimento só é discutido se fizer sentido depois; "já tenho agência" → o diagnóstico serve inclusive para comparar e não tem compromisso) e volte ao convite com 2 horários.
- Use os dados acima para personalizar, mas confirme com naturalidade em vez de afirmar o que não tem certeza.
- Se surgir uma pergunta ou objeção que você não sabe responder com segurança, use \`pedir_orientacao\`. Só use \`encaminhar_humano\` com tipo "pedido_de_pessoa" se a pessoa pedir para falar com alguém, ou "reclamacao" se reclamar.
- Se ele disser que não tem interesse ou pedir para sair, agradeça em uma frase, não insista e chame \`encerrar_contato\` com motivo "opt_out".`;
}

// ---------------------------------------------------------------- Respostas automáticas

const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Sinais fortes de robô/atendimento automático: valem a qualquer hora. */
const AUTO_FORTE = [
  /assistente virtual/,
  /\bprotocolo\b/,
  /(mensagem|resposta|atendimento) automatic/,
  /\bdigite\b/,
  /escolha uma (das )?opc/,
  /selecione uma (das )?opc/,
  /(horario|hora) de (atendimento|funcionamento)/,
  /fora do (nosso )?horario/,
  /no momento (nao )?(estamos|podemos|conseguimos)/,
  /(retornaremos|responderemos|entraremos em contato) (o mais breve|em breve|assim que)/,
  /em breve (um|uma|nossa|nosso) (atendente|equipe|consultor)/,
  /aguarde (um momento|que (ja|logo|em breve))/,
  /acompanhando (o )?seu atendimento/,
  /se (voce )?ja (e|for) (nosso|nossa) client/,
  /qual (o )?assunto (voce )?(quer|deseja|gostaria)/,
  /(vou|vamos) (te |lhe )?transferir/,
  /transferindo (voce|seu atendimento|para)/,
  /(nosso|um) atendente (ja |logo |em breve )?(vai|ira)/,
  /nao atendemos (convenio|plano)/,
  /nao esta entre as opc/,
  /(resposta|opcao) (e |esta )?invalida/,
  /(podemos|posso|vamos) continuar (o |seu |com o seu )?atendimento/,
  /nao posso ajudar com esse assunto/,
  /(vou|vamos) encerrar (o |seu |a |sua )?(atendimento|conversa)/,
  /(conversa|atendimento) sera encerrad/,
  /ultima tentativa/,
  /de 0 a 10/,
  /(nos )?avali(e|ar|ar nos) no google/,
  /nome completo,? (e )?(o )?cpf|informe (seu |o seu )?(nome completo|cpf)/,
  /(estamos com )?alto volume (de atendimentos|de mensagens)?/,
  /nunca solicita pagamento|nao caia em golpe/,
  /contato e exclusivo para mensagens/,
  /para (comecarmos|iniciarmos|agilizar (o |seu )?atendimento)/,
  // 04/11: Ortosol, Pet Smell, Dra. Pri Benfica e Dra. Jéssica mandaram boas-vindas de robô minutos depois
  // do disparo e a Ana despejou o diagnóstico em cima do robô
  /agradece (o |seu |o seu |pelo )?contato/,
  /damos (as )?boas[- ]?vindas/,
  /se (eu )?nao (responder|atender|conseguir responder) (imediatamente|na hora|de imediato|agora)/,
  /retornarei (sua mensagem|seu contato|assim que)/,
  /caso (ainda )?nao tenha informado/,
  /^\s*(1|1\.|1\)|1 -|1-)\s.+\n\s*(2|2\.|2\)|2 -|2-)\s/m,
];

const NAO_TEM_INTERESSE = /\bnao (temos|tenho|ha|teriamos|tenhamos) (nenhum )?interesse|\bsem interesse\b|\bnao (queremos|precisamos|pretendemos contratar)/;

/** Sinais fracos (saudação genérica): só contam se chegou logo depois da nossa mensagem. */
const AUTO_FRACO = [
  /bem[- ]?vind[oa]/,
  /(em )?que (posso|podemos) (te |lhe |the )?ajudar/,
  /como (posso|podemos) (te |lhe )?ajudar/,
  /obrigad[oa] (pelo|por entrar em|por nos contatar|pela mensagem)/,
  /agradecemos (o|seu|a sua|sua) (contato|mensagem)/,
  /que bom ter voce/,
  /se precisar de algo,? (e so|pode) chamar/,
  /^\W*(so|aguarde) um (momento|instante)/,
  /qual (e )?(o )?(seu|teu) caso/,
  /precisa de atendimento/,
  /me (conta|conte|diga)\W*$/m,
];

/**
 * Mensagem que parece resposta automática (boas-vindas do WhatsApp Business, robô com protocolo,
 * menu de opções). Não conta como resposta do lead: a cadência segue e a Ana não responde ao robô.
 */
export function pareceRespostaAutomatica(texto: string, segundosDesdeEnvio?: number | null): boolean {
  const t = sem(texto ?? "");
  if (!t.trim()) return false;
  // "Obrigada pelo contato, mas não temos interesse" é gente dizendo não (Xavier Imóveis, 04/11): nunca é robô
  if (NAO_TEM_INTERESSE.test(t)) return false;
  if (AUTO_FORTE.some((r) => r.test(t))) return true;
  const logo = segundosDesdeEnvio !== null && segundosDesdeEnvio !== undefined && segundosDesdeEnvio >= 0 && segundosDesdeEnvio <= 90;
  return logo && AUTO_FRACO.some((r) => r.test(t));
}
