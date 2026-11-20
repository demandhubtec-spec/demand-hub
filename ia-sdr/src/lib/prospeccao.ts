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
import { nomeCurto } from "./travas.ts";

export interface Prospeccao {
  place_id?: string;
  email?: string | null;
  empresa: string | null;
  cadencia?: string | null;
  nicho: string | null;
  cidade: string | null;
  /** Endereço do Google ("Rua X, 100 - Centro, Americana - SP, 13465-000"): a cidade de verdade (18/11). */
  endereco?: string | null;
  decisor: string | null;
  cargo_decisor: string | null;
  site: string | null;
  instagram: string | null;
  observacoes: string | null;
  wa_message: string | null;
  wa_sent_at: string | null;
  diagnostico?: unknown;
  /** Raio-x digital da Rita (Instagram, site e Google): o diagnóstico de quem veio da lista do Instagram. */
  diagnosticos?: unknown;
  /** Cadência: os toques escritos pela Ana e quantos já foram feitos. */
  sequencia?: { n: number; canal: string; assunto?: string; texto: string }[] | null;
  toque_atual?: number | null;
  ultimo_toque_em?: string | null;
  /** Prévia de site grátis montada para quem não tem site próprio. */
  site_preview?: { token?: string; tipo?: string | null; site_atual?: string | null } | null;
  /** Logo e PDF do diagnóstico (robô do GitHub). */
  marca?: { pdf?: string | null } | null;
  /** Sócios pelo CNPJ (Léo): o nome do dono para citar na abordagem. */
  socios?: { nome: string; qualificacao: string | null }[] | null;
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
/**
 * Conversa que o WhatsApp abriu como LID (ex.: 209444097024108@lid): descobre o telefone real pelo
 * registro do disparo, que guarda o "Chat" devolvido pela Evolution. Sem isso, a mensagem que o Kelvin
 * manda pelo celular cai num lead novo, separado da conversa da Gabi (Vip Implantes, 13/11).
 */
export async function telefoneDoLid(jid: string): Promise<string | null> {
  if (!jid.endsWith("@lid")) return null;
  const r = await db()
    .from("outreach_log")
    .select("detail")
    .eq("event", "sent")
    .ilike("detail->>resp", `%${jid}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const to = (r.data?.detail as { to?: string } | undefined)?.to;
  return to ? to.replace(/\D/g, "") || null : null;
}

export async function prospeccaoDoTelefone(phone: string): Promise<Prospeccao | null> {
  const tail = ultimos8(phone);
  if (tail.length < 8) return null;
  const r = await db()
    .from("outreach_leads")
    .select("place_id,email,empresa,cadencia,nicho,cidade,endereco,decisor,cargo_decisor,site,instagram,observacoes,wa_message,wa_sent_at,diagnostico,diagnosticos,sequencia,toque_atual,ultimo_toque_em,site_preview,marca,socios,status_comercial,retorno_em,retorno_nota,diag_enviado_em,responsavel_contato,retomadas,retomada_em")
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

/**
 * Abordagem v2 (13/11/2026, Kelvin): o 1º contato é só "Oi, boa tarde! 😊 / Tudo bem?". Quando a pessoa
 * responde, a Gabi se apresenta; depois manda o diagnóstico (PDF) e só então puxa a reunião com 2 horários
 * do próximo dia útil. Vale para quem recebeu o 1º contato a partir de 13/11.
 */
export const FLUXO_V2_DESDE = "2026-11-13T03:00:00Z";
export function ehFluxoV2(p: Prospeccao | null | undefined): boolean {
  return !!p?.wa_sent_at && p.wa_sent_at >= FLUXO_V2_DESDE;
}

/** Nome de quem decide para a Gabi citar: decisor do Léo, ou o 1º sócio do CNPJ (primeiro nome). */
export function donoParaCitar(p: Prospeccao): string | null {
  const bruto = (p.decisor || p.socios?.[0]?.nome || "").replace(/^(dr|dra)\.?\s+/i, "").trim();
  if (!bruto) return null;
  const primeiro = bruto.split(/\s+/)[0].toLowerCase();
  return primeiro ? primeiro[0].toUpperCase() + primeiro.slice(1) : null;
}

/** O site que ela tem hoje (não vale diretório nem rede social). */
export function temSiteProprio(p: Prospeccao): boolean {
  if (p.site_preview?.tipo) return p.site_preview.tipo === "melhoria";
  const s = (p.site ?? "").toLowerCase();
  return !!s && !/(instagram|facebook|wa\.me|whatsapp|linktr|doctoralia|google\.|canva\.com|wixsite|ifood|booksy)/.test(s);
}

/** Palavras do nicho para a fala da Gabi (13/11: ar-condicionado e piscinas entraram na fila; antes tudo virava "clínica/pacientes"). */
export function palavrasDoNicho(nicho: string | null | undefined): { plural: string; singular: string; artigo: "a" | "o"; publico: string; busca: string } {
  const n = (nicho ?? "").toLowerCase();
  if (/imob|corretor/.test(n)) return { plural: "imobiliárias", singular: "imobiliária", artigo: "a", publico: "clientes", busca: "imobiliária" };
  if (/advoc|jur/.test(n)) return { plural: "escritórios", singular: "escritório", artigo: "o", publico: "clientes", busca: "advogado" };
  // 17/11: pet shop, banho e tosa, táxi pet e pet food viravam "clínicas veterinárias"
  if (/veterin|\bvet\b|clinica vet/.test(n)) return { plural: "clínicas veterinárias", singular: "clínica", artigo: "a", publico: "clientes", busca: "veterinário" };
  if (/pet|tosa|ra[cç][aã]o|aquari/.test(n)) return { plural: "pet shops", singular: "pet shop", artigo: "o", publico: "clientes", busca: "pet shop" };
  if (/agropec|agro\b|agr[ií]col/.test(n)) return { plural: "lojas agropecuárias", singular: "loja", artigo: "a", publico: "clientes", busca: "agropecuária" };
  // 16/11: lista do Instagram, quase toda de alimentação (restaurante, hamburgueria, doces, salgados, marmita)
  if (/aliment|restaur|lanch|pizz|hamburg|burger|confeit|doce|salgad|marmit|a[cç]a[ií]|gelat|sorvet|padar|caf[eé]|bar\b|churras|gastronom|comida|food|delivery|chef/.test(n))
    return { plural: "negócios de alimentação", singular: "negócio", artigo: "o", publico: "clientes", busca: "delivery" };
  if (/odonto|dent/.test(n)) return { plural: "clínicas odontológicas", singular: "clínica", artigo: "a", publico: "pacientes", busca: "dentista" };
  if (/endocrin/.test(n)) return { plural: "clínicas", singular: "clínica", artigo: "a", publico: "pacientes", busca: "endocrinologista" };
  if (/cl[ií]nic|m[eé]dic|endocrin|consult|sa[uú]de|oncolog|geriatr|nutri|fisio|psic|anest|diagn/.test(n))
    return { plural: "clínicas", singular: "clínica", artigo: "a", publico: "pacientes", busca: n.split(/[,;|]/)[0].trim() || "clínica" };
  // "Casa de verão" (ar-condicionado, piscinas) e qualquer outro: fala genérica de empresa, sem inventar nicho
  return { plural: "empresas", singular: "empresa", artigo: "a", publico: "clientes", busca: /ver[aã]o|climatiz|ar.?condic/.test(n) ? "ar-condicionado" : "o serviço de vocês" };
}

export function cidadeCurta(c: string | null | undefined): string {
  const semUf = String(c ?? "").split("/")[0].trim();
  const partes = semUf.split(",").map((x) => x.trim()).filter(Boolean);
  return partes[partes.length - 1] ?? "";
}

/**
 * Cidade de verdade do lead (18/11, Kelvin): o campo cidade guarda a cidade da BUSCA (Indaiatuba), mas a
 * Ameripan é de Americana e o Bendito Deck Bar é de BH. Vale o endereço do Google; lista do Instagram sem
 * endereço não tem cidade confiável (vazio = a fala não cita cidade).
 */
export function cidadeReal(p: Pick<Prospeccao, "cidade" | "endereco" | "place_id" | "observacoes">): string {
  const end = String(p.endereco ?? "");
  const m = end.match(/,\s*([A-Za-zÀ-ú' .-]{3,40}?)\s*-\s*[A-Z]{2}\b(?:,|\s|$)/);
  if (m) return m[1].trim();
  if (veioDoInstagram(p as Prospeccao)) return "";
  return cidadeCurta(p.cidade);
}

/** Veio da lista do Instagram (comentou em post de perfil parceiro)? */
export function veioDoInstagram(p: Prospeccao | null | undefined): boolean {
  return !!p?.place_id?.startsWith("ig_") || /^\[Lista do Instagram\]/.test(p?.observacoes ?? "");
}

/**
 * 18/11 (Kelvin): sem cidade cadastrada, a Gabi chamava todo mundo de "Indaiatuba" (Bendito Deck Bar de BH,
 * Beto Hamburgueria de SP). Agora a região sai do DDD do WhatsApp e, se nem isso, "todo o Brasil".
 */
const REGIAO_DDD: Record<string, string> = {
  "11": "São Paulo e região", "12": "Vale do Paraíba", "13": "Baixada Santista", "14": "Bauru e região", "15": "Sorocaba e região",
  "16": "Ribeirão Preto e região", "17": "São José do Rio Preto e região", "18": "Presidente Prudente e região", "19": "Campinas e região",
  "21": "Rio de Janeiro e região", "22": "região dos Lagos e norte fluminense", "24": "sul fluminense", "27": "Grande Vitória", "28": "sul do Espírito Santo",
  "31": "Belo Horizonte e região", "32": "Juiz de Fora e região", "33": "leste de Minas", "34": "Triângulo Mineiro", "35": "sul de Minas", "37": "centro-oeste de Minas", "38": "norte de Minas",
  "41": "Curitiba e região", "42": "Ponta Grossa e região", "43": "Londrina e região", "44": "Maringá e região", "45": "oeste do Paraná", "46": "sudoeste do Paraná",
  "47": "Joinville e região", "48": "Florianópolis e região", "49": "oeste de Santa Catarina",
  "51": "Porto Alegre e região", "53": "Pelotas e região", "54": "Serra Gaúcha", "55": "interior gaúcho",
  "61": "Brasília e região", "62": "Goiânia e região", "64": "sul de Goiás", "65": "Cuiabá e região", "66": "interior do Mato Grosso", "67": "Campo Grande e região",
  "71": "Salvador e região", "73": "sul da Bahia", "74": "norte da Bahia", "75": "Feira de Santana e região", "77": "oeste da Bahia", "79": "Aracaju e região",
  "81": "Recife e região", "82": "Maceió e região", "83": "João Pessoa e região", "84": "Natal e região", "85": "Fortaleza e região", "86": "Teresina e região", "87": "sertão pernambucano", "88": "interior do Ceará", "89": "sul do Piauí",
  "91": "Belém e região", "92": "Manaus e região", "93": "oeste do Pará", "94": "sudeste do Pará", "95": "Roraima", "96": "Amapá", "97": "interior do Amazonas", "98": "São Luís e região", "99": "interior do Maranhão",
  "63": "Tocantins", "68": "Acre", "69": "Rondônia",
};

export function regiaoDoTelefone(phone: string | null | undefined): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  const ddd = d.startsWith("55") && d.length >= 12 ? d.slice(2, 4) : d.length >= 10 && d.length <= 11 ? d.slice(0, 2) : "";
  return REGIAO_DDD[ddd] ?? "";
}

/** Onde o lead está, para a Gabi citar: cidade cadastrada, senão a região do DDD, senão "todo o Brasil". */
export function cidadeParaCitar(p: Pick<Prospeccao, "cidade" | "endereco" | "place_id" | "observacoes"> | null | undefined, phone?: string | null): string {
  return (p ? cidadeReal(p) : "") || regiaoDoTelefone(phone) || "todo o Brasil";
}

/** A posição do diagnóstico foi medida numa busca de outra cidade (ex.: "dedetização Indaiatuba SP" para uma empresa de São Carlos)? */
export function posicaoDeOutraCidade(p: Pick<Prospeccao, "cidade" | "diagnostico" | "endereco" | "place_id" | "observacoes"> | null | undefined): boolean {
  const termo = (p?.diagnostico as { posicao?: { tipo?: string; termo?: string } } | null | undefined)?.posicao;
  if (!termo || termo.tipo !== "busca" || !termo.termo) return false;
  // 18/11: vale a cidade do endereço (Ameripan é de Americana, mesmo coletada na busca de Indaiatuba)
  const cidade = (p ? cidadeReal(p) : "") || cidadeCurta(p?.cidade);
  const sem = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return !cidade || !sem(termo.termo).includes(sem(cidade));
}

/** Valores das {{variáveis}} do Prompt System da Gabi para este lead. */
export function varsPromptGabi(p: Prospeccao, phone?: string | null): Record<string, string> {
  const w = palavrasDoNicho(p.nicho);
  return {
    // Nome curto (16/11): "Dra. Luana Aranha - Geriatria e Clínica Médica em Campinas" vira "Dra. Luana Aranha"
    empresa: nomeCurto(p.empresa, p.cidade, p.endereco) || "a empresa",
    // 18/11: cidade do endereço do Google; senão a cadastrada (Google) ou a região do DDD; senão "todo o Brasil"
    cidade: cidadeParaCitar(p, phone),
    // Frase pronta da apresentação (18/11): restaurante ouve do cardápio digital; a cidade é a de verdade
    apresentacao: apresentacaoDoLead(p, phone),
    nicho_plural: w.plural,
    publico: w.publico,
    tipo: `${w.artigo} ${w.singular}`,
    busca: w.busca,
    dono: donoParaCitar(p) ?? "o responsável",
    especialista: "nosso especialista",
  };
}

/** A frase do "o que a gente faz" da apresentação, no jeito do segmento e com a cidade certa (ou sem cidade). */
export function apresentacaoDoLead(p: Prospeccao, phone?: string | null): string {
  const w = palavrasDoNicho(p.nicho);
  const cid = cidadeParaCitar(p, phone);
  const deOnde = cid && cid !== "todo o Brasil" ? ` de ${cid}` : "";
  // 18/11 (Kelvin): a DemandIA não é agência e não "implementa IA": desenvolve soluções inteligentes sob medida,
  // do zero, no processo de cada empresa. A frase tem que chamar a atenção do dono.
  // 19/11 (Kelvin): o cliente entendia "soluções sob medida" mas não entendia o que é. A frase agora diz, com
  // o dia a dia dele, o que a gente coloca dentro da operação.
  if (ehAlimentacao(p))
    return `A DemandIA monta o canal de vendas próprio de restaurantes${deOnde}: o cardápio digital de vocês, com a cara da marca, e um atendente no WhatsApp que anota o pedido sozinho e manda pra cozinha, sem taxa de aplicativo e sem perder pedido na correria.`;
  if (w.publico === "pacientes")
    return `A DemandIA coloca um atendente inteligente no WhatsApp de ${w.plural}${deOnde}: ele responde e agenda o paciente na hora, até fora do horário, confirma as consultas sozinho e lembra quem sumiu de voltar a marcar. Tudo sob medida, desenvolvido do zero para o jeito de cada clínica.`;
  return `A DemandIA coloca soluções inteligentes sob medida dentro da operação de ${w.plural}${deOnde}: um atendente no WhatsApp que responde e agenda na hora, até fora do horário, e o que hoje é feito na mão passa a rodar sozinho, para vender mais e gastar menos.`;
}

/** Dados do lead para a Gabi (v2). O que ela faz com eles está no Prompt System (prompt-gabi.ts / portal). */
function contextoProspeccaoV2(p: Prospeccao): string {
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? "não informado" : String(x));
  const dono = donoParaCitar(p);
  const site = temSiteProprio(p);
  const diagEnviado = !!p.diag_enviado_em;
  return `

## Dados deste lead (prospecção ativa)
Você chamou esta empresa em ${p.wa_sent_at ? formatBR(new Date(p.wa_sent_at)) : "data não registrada"}. Primeira mensagem: "${v(p.wa_message)}".
Empresa: ${v(nomeCurto(p.empresa, p.cidade, p.endereco))} (nome no Google: ${v(p.empresa)}; na conversa use o nome curto) | Nicho: ${v(p.nicho)} | Cidade: ${cidadeReal(p) || "não sabemos pelo cadastro (use a do prompt)"} | Dono/decisor: ${dono ?? "não sabemos o nome"} | Site próprio: ${site ? `TEM (${v(p.site_preview?.site_atual || p.site)})` : "NÃO TEM"} | Instagram: ${v(p.instagram)}
${p.diagnostico ? `\nDiagnóstico verificado (pode usar os números, sem inventar nada além disso):\n${JSON.stringify(p.diagnostico)}\n` : p.diagnosticos ? `\nDiagnóstico verificado (raio-x do Instagram, do site e do Google; pode usar os números, sem inventar nada além disso):\n${JSON.stringify(p.diagnosticos).slice(0, 6000)}\n` : ""}${veioDoInstagram(p) ? contextoInstagram(p) : ""}${ehAlimentacao(p) ? CONTEXTO_RESTAURANTE : ""}
Situação agora: diagnóstico ${diagEnviado ? "JÁ ENVIADO" : "ainda NÃO enviado"} · contato do dono ${p.responsavel_contato ? `já temos (${p.responsavel_contato})` : "ainda não temos"}${p.retorno_em ? ` · retorno combinado para ${formatBR(new Date(p.retorno_em))}${p.retorno_nota ? ` (${p.retorno_nota})` : ""}` : ""}.`;
}

const RE_ALIMENTACAO = /aliment|restaur|lanch|pizz|hamburg|burger|confeit|doce|salgad|marmit|a[cç]a[ií]|gelat|sorvet|padar|caf[eé]|\bbar\b|churras|gastronom|comida|food|delivery|chef|cardápio|espetaria|coxinha|buffet/i;

/** Restaurante, lanchonete, doces, delivery etc. (pelo nicho, nome ou o que sabemos do perfil). */
export function ehAlimentacao(p: Pick<Prospeccao, "nicho" | "empresa" | "observacoes">): boolean {
  // Clínica, imobiliária, advocacia etc. (a maioria do Google) nunca recebem o roteiro de restaurante (Kelvin, 17/11)
  const nicho = (p.nicho ?? "").trim();
  if (/cl[ií]nic|m[eé]dic|odont|dent|imobili|corretor|advoga|advoc|jur[ií]d|est[eé]tic|dermat|endocrin|nutri|psic|fisio|veterin|pet|contab|engenh|arquitet|escola|academia|sal[aã]o|barbear/i.test(`${nicho} ${p.empresa ?? ""}`)) return false;
  if (nicho) return RE_ALIMENTACAO.test(nicho);
  return RE_ALIMENTACAO.test(`${p.empresa ?? ""} ${p.observacoes ?? ""}`);
}

/** 17/11 (Kelvin): para alimentação, o carro-chefe é o cardápio digital próprio + IA no atendimento do pedido. */
const CONTEXTO_RESTAURANTE = `
## Este lead é de alimentação (restaurante, lanchonete, delivery, doces)
Aqui o que mais faz sentido apresentar, nesta ordem:
1. Cardápio digital próprio, feito 100% com a identidade visual da marca deles e do jeito que o processo deles funciona. Não é sistema genérico nem modelo pronto: é produzido para a marca deles. Serve para vender direto, sem depender do iFood e de outros aplicativos e sem pagar taxa por pedido.
2. Atendente inteligente no WhatsApp, ligado ao cardápio: responde na hora, tira dúvidas e fecha a comanda do pedido sozinho, sem perder pedido na correria. Tudo desenvolvido sob medida para a marca deles (fale "solução inteligente", não "IA").
3. Depois, se fizer sentido: Google Meu Negócio, site e anúncio no Google, para aparecer para quem procura comida na região.
Como usar: se o diagnóstico mostrar que eles vendem por iFood/aplicativo ou não têm cardápio próprio, puxe por aí ("vender direto, sem a taxa do aplicativo"). Fale em linguagem de restaurante (pedidos, cardápio, delivery, clientes, movimento). Apresente sem compromisso, só para conhecerem o nosso trabalho, e siga o mesmo caminho: diagnóstico gratuito e conversa de 20 minutos com o nosso especialista. Não invente preço nem prazo.`;

/**
 * Lead da lista do Instagram (16/11, Kelvin): a abordagem é pelo WhatsApp, nunca pelo Direct, com o mesmo
 * roteiro (diagnóstico, site, Instagram), na linguagem do segmento (a maioria é alimentação).
 */
function contextoInstagram(p: Prospeccao): string {
  const obs = (p.observacoes ?? "").replace(/^\[Lista do Instagram\]\s*/, "").trim();
  return `
## Este lead veio do Instagram
Encontramos esta empresa pelo Instagram (${p.instagram ?? "perfil no Instagram"}). O que sabemos: ${obs || "não informado"}.
- A conversa é pelo WhatsApp. Não cite o comentário nem o post de outro perfil, e não diga que achou a empresa no Google.
- Na apresentação, fale do Instagram primeiro ("vi o Instagram de vocês"), depois do site e do Google.
- O diagnóstico mostra o Instagram, o site e o Google. Ao mandar, comece pelo que ele mostra do Instagram (perfil, bio, link, como o cliente chega até o pedido).
- Linguagem do segmento: em alimentação, fale de pedidos, cardápio, delivery, clientes e movimento, nunca de "pacientes". Em outros segmentos, use as palavras do negócio deles.
- O resto do roteiro é o mesmo: diagnóstico gratuito, modelo de site para quem não tem site e reunião de 20 minutos com o nosso especialista.`;
}

/** Bloco que entra no prompt da Ana quando o contato veio da prospecção ativa. */
export function contextoProspeccao(p: Prospeccao | null): string {
  if (!p) return "";
  if (ehFluxoV2(p)) return contextoProspeccaoV2(p);
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? "não informado" : String(x));
  return `

## Contexto: este contato veio da PROSPECÇÃO ATIVA
Não foi o lead que nos procurou: VOCÊ mandou a primeira mensagem para ele em ${p.wa_sent_at ? formatBR(new Date(p.wa_sent_at)) : "data não registrada"}, oferecendo um diagnóstico gratuito do perfil da empresa no Google.
Mensagens que ele já recebeu de você (as que podem não ter sido lidas também contam; não repita o que já disse):
${toquesRecebidos(p) || `"${v(p.wa_message)}"`}

Dados que coletamos antes (Google Maps e CNPJ): Empresa: ${v(nomeCurto(p.empresa, p.cidade))} (nome no Google: ${v(p.empresa)}; na conversa use o nome curto) | Nicho: ${v(p.nicho)} | Cidade: ${v(p.cidade)} | Decisor: ${v(p.decisor)}${p.cargo_decisor ? ` (${p.cargo_decisor})` : ""} | Site: ${v(p.site)} | Instagram: ${v(p.instagram)}${p.observacoes ? ` | Obs.: ${p.observacoes}` : ""}
${p.diagnostico ? `\nDiagnóstico do perfil no Google que usamos na abordagem (fatos verificados; pode usar na conversa, sem inventar nada além disso):\n${JSON.stringify(p.diagnostico)}\n` : ""}${analisePendente(p)}
Objetivo desta conversa (é para isso que você trabalha): chegar até o responsável (quem cuida do marketing, do comercial ou do perfil no Google) e marcar uma conversa de 20 minutinhos ou uma ligação rápida com o nosso especialista, oferecendo o diagnóstico gratuito. Toda mensagem sua deve aproximar a conversa desse objetivo, com leveza.
Situação do objetivo agora: diagnóstico ${p.diag_enviado_em ? "já enviado" : "ainda não enviado"} · contato do responsável ${p.responsavel_contato ? `já temos (${p.responsavel_contato})` : "ainda não temos"}${p.retorno_em ? ` · retorno combinado para ${formatBR(new Date(p.retorno_em))}${p.retorno_nota ? ` (${p.retorno_nota})` : ""}` : ""}.

Como conduzir neste caso (caminho curto: valor primeiro, depois convite com horário concreto):
- Registre o progresso com \`registrar_objetivo\`: quando mandar os achados ou a análise do diagnóstico (diagnostico_enviado), e quando descobrir quem é o responsável e o contato dele (responsavel: nome e telefone ou e-mail).
- Continue a partir da sua mensagem, como quem dá sequência a um contato que você mesma iniciou. Não se apresente de novo e não pergunte "como posso ajudar?".
- Primeiro descubra com quem você fala: quem decide (dono, sócio, médico ou advogado titular, gestor do marketing ou do perfil no Google) ou a recepção/secretária. Se não der para saber, trate como recepção.

Se for QUEM DECIDE:
1. Entregue valor logo: 2 ou 3 achados concretos do diagnóstico acima, com os números, e o que cada um causa na prática (paciente/cliente indo para o concorrente). Não explique como resolver: isso é o que o especialista mostra.
2. Chame \`lead_quente\` (o especialista é avisado para ligar) e, na mesma resposta, convide para a conversa gratuita de 20 minutinhos com o nosso especialista oferecendo DOIS horários reais: chame \`ver_horarios\` e diga algo como "consigo amanhã às 10h ou quinta às 15h, qual fica melhor?". Nunca pergunte "qual o melhor dia e horário?" no vazio.
3. Se ele escolher um horário, peça o e-mail para o convite e chame \`agendar_reuniao\`. Se nenhum horário servir, ofereça outros de \`ver_horarios\` ou uma ligação rápida de 10 minutos no horário que ele disser (aí use \`combinar_retorno\` e \`lead_quente\`).
4. ZERO perguntas sobre o negócio (como os clientes chegam, indicação ou Google, se já têm alguém cuidando, faturamento, equipe). O diagnóstico já responde isso: a única pergunta é qual dos 2 horários fica melhor.
5. Se ele não responder ao convite, não troque o convite por pergunta de descoberta: a retomada volta com 2 horários novos.

Se for a RECEPÇÃO ou SECRETÁRIA (ela não marca reunião, então não qualifique nem venda para ela):
1. Pergunte, numa frase só, o nome de quem decide sobre o perfil no Google e o WhatsApp direto dessa pessoa (ou o horário em que ela está aí). Não encerre a conversa com a recepção sem ter pedido isso; se ela não passar o WhatsApp, peça ao menos o nome e o melhor horário.
2. Ofereça um resumo curtinho para ela repassar e mande 2 achados em 1 mensagem, terminando com o convite: "se fizer sentido, nosso especialista mostra o restante numa conversa de 20 minutinhos, sem custo".
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
  // 18/11: Buffet Moleka Fest e La Palma (robô com menu e "em instantes um atendente falará com você")
  /para darmos continuidade (ao|no|com o) (seu )?atendimento/,
  /responda com a opcao/,
  /em instantes (um|uma|nosso|nossa) (atendente|consultor)/,
  /atendente (falara|vai falar|ira falar|ja vai falar) com voce/,
  // 14/11: menu numérico (Prime Machado) e "recebemos a sua mensagem"
  /responda (somente |apenas )?com o numero/,
  /recebemos (a |sua |a sua )?mensage(m|ns)\W+(em breve|logo)/,
  // 14/11: Prime Machado, "Em breve alguém da nossa equipe vai te responder por aqui"
  /em breve alguem (da |de )?(nossa |sua )?(equipe|time)/,
  // 13/11: assistentes virtuais e recado de imobiliária (Bella Casa "Bellinha", RRC "deixe seu recado")
  /(sou|aqui e) (a |o )?[a-z]+,? (a |o |sua |seu )?(inteligencia artificial|assistente virtual)/,
  /(deixe|deixa) (o |seu |o seu |um )?recado/,
  // 13/11: Clínica Para Família, robô respondeu "Recebi! Já te respondo" e a Gabi conversou com ele
  /^\W*recebi\W+(ja|logo|em breve) (te |lhe )?(respondo|retorno)/,
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
 * Robô ou assistente virtual que pede recado, nome ou assunto para passar a uma pessoa (13/11: "Bellinha" da
 * Bella Casa, RRC "deixe seu recado", Lanza). Em vez de ficar muda, a Gabi deixa UM recado curto.
 */
/**
 * Robô que pede só o nome ("escreva o seu primeiro nome", "Digite só seu nome", "Como você prefere ser chamado?").
 * 17/11: a Marina respondeu "Boa tarde! 😊" e o robô da Alcatec gravou isso como o nome dela.
 */
export function roboPedeNome(texto: string): boolean {
  const t = sem(texto ?? "").replace(/[*_~]/g, "");
  return /(informe|informar|digite|escreva|me diga|me informe|nos informar) (o |so |apenas )?(seu |o seu |teu )?(primeiro )?nome\b(?! e (o )?(assunto|sobrenome))|como (voce )?(prefere ser chamad|gostaria de ser chamad|se chama)|como e (o )?seu nome/.test(t);
}

export function roboPedeRecado(texto: string): boolean {
  const t = sem(texto ?? "");
  return /(deixe|deixa|deixar) (o |seu |o seu |um |sua )?(recado|mensagem)|nome e sobrenome|qual (e )?(o )?(seu )?(nome|assunto)|para que (eu )?possa (te |lhe )?(transferir|encaminhar)|(como|em que) (podemos|posso) (te |lhe )?ajudar/.test(t);
}

/** Menu numérico de robô: devolve o número da opção que leva a uma pessoa (14/11: Prime Machado "3 Falar com Corretor"). */
export function opcaoDoMenu(texto: string): string | null {
  for (const linha of (texto ?? "").split(/\n/)) {
    const t = sem(linha).replace(/[\u20e3\ufe0f]/g, "");
    const m = t.match(/(\d{1,2})\D{0,6}(falar com|atendente|atendimento humano|corretor|comercial|outros assuntos|outras? (duvidas|informacoes)|humano|esta correto|confirmar)/);
    if (m) return m[1];
  }
  return null;
}

export function recadoParaRobo(p: Prospeccao, sdr = "Gabi"): string {
  const w = palavrasDoNicho(p.nicho);
  const tipo = `${w.artigo} ${w.singular}`;
  return `Oi! Aqui é a ${sdr}, da DemandIA 😊 O assunto é um diagnóstico gratuito de como ${tipo} aparece no Google, para o responsável. Fico no aguardo!`;
}

/**
 * Mensagem que parece resposta automática (boas-vindas do WhatsApp Business, robô com protocolo,
 * menu de opções). Não conta como resposta do lead: a cadência segue e a Ana não responde ao robô.
 */
export function pareceRespostaAutomatica(texto: string, segundosDesdeEnvio?: number | null): boolean {
  const t = sem(texto ?? "");
  if (!t.trim()) return false;
  // "Obrigada pelo contato, mas não temos interesse" é gente dizendo não (Xavier Imóveis, 04/11): nunca é robô
  if (NAO_TEM_INTERESSE.test(t)) return false;
  // 17/11: a assistente virtual do Dr. Lucas Tubino disse "Pode sim, envie o diagnóstico por aqui que eu encaminho"
  // e a Gabi ficou calada. Aceite de mandar o diagnóstico conta como resposta, mesmo vindo de assistente.
  if (/(pode|podem) (sim|enviar|mandar)|\benvie (o |a |por aqui)|pode encaminhar|encaminho (para|pra) (a |o )?(equipe|responsavel|doutor|dr)/.test(t)) return false;
  if (roboPedeNome(texto)) return true;
  if (AUTO_FORTE.some((r) => r.test(t))) return true;
  const logo = segundosDesdeEnvio !== null && segundosDesdeEnvio !== undefined && segundosDesdeEnvio >= 0 && segundosDesdeEnvio <= 90;
  return logo && AUTO_FRACO.some((r) => r.test(t));
}
