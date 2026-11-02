/**
 * Contatos que chegam pelos anúncios de WhatsApp (clique para conversar) da DemandIA.
 *
 * Como reconhecemos:
 * - O WhatsApp manda junto os dados do anúncio (contextInfo.externalAdReply) quando a conversa
 *   começa pelo botão do anúncio.
 * - Se esses dados não vierem, a mensagem pronta do anúncio ou o botão de pergunta pronta
 *   ("Quero testar a Ana", "Faturo acima de R$ 30 mil...") também identificam.
 *
 * A origem fica registrada como evento "origem_anuncio" no lead e entra no prompt da Ana
 * em todas as respostas daquela conversa.
 */

export type Nicho = "estetica" | "odonto" | "academia";

export interface DadosAnuncio {
  titulo?: string | null;
  texto?: string | null;
  url?: string | null;
  adId?: string | null;
  ctwaClid?: string | null;
}

export interface OrigemAnuncio {
  via: "anuncio" | "mensagem_pronta";
  nicho: Nicho | null;
  /** A pessoa quer ver a Ana atendendo (pergunta de paciente/aluno ou "quero testar"). */
  teste: boolean;
  adId?: string | null;
  titulo?: string | null;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export const NICHO_LABEL: Record<Nicho, string> = {
  estetica: "clínica de estética",
  odonto: "clínica odontológica",
  academia: "academia ou estúdio",
};

/** Faturamento que o anúncio de cada nicho anuncia como corte do Acesso Antecipado. */
export const CORTE_DO_ANUNCIO: Record<Nicho, number> = {
  estetica: 30_000,
  odonto: 30_000,
  academia: 100_000,
};

export function nichoDoTexto(texto: string): Nicho | null {
  const t = norm(texto);
  if (/odonto|dentista|implante|alinhador|lente de contato dental|ortodont|canal dentario|consultorio odont/.test(t)) return "odonto";
  if (/academia|estudio|pilates|crossfit|matricula|aluno|aula experimental|personal/.test(t)) return "academia";
  if (/estetica|botox|preenchimento|harmonizacao|depilacao|limpeza de pele|bioestimulador|clinica de estetica/.test(t)) return "estetica";
  return null;
}

const PRONTAS = [
  /quero (o )?(meu )?diagnostico gratuito/,
  /quero testar a ana/,
  /faturo acima de r\$ ?\d+/,
  /como funciona (na minha clinica|com orcamento parado|em janeiro)/,
];

/** Pergunta típica de paciente ou aluno: é o dono testando a Ana, como o anúncio pede. */
const PERGUNTA_DE_TESTE = /quanto (custa|fica|e|sai)|qual (o )?(valor|preco)|tem horario|voces atendem|como funciona o plano/;

export function detectarOrigemAnuncio(texto: string | null, dados?: DadosAnuncio | null): OrigemAnuncio | null {
  const t = norm(texto ?? "");
  const temDados = !!(dados && (dados.adId || dados.titulo || dados.texto || dados.ctwaClid));
  const pronta = PRONTAS.some((r) => r.test(t));
  if (!temDados && !pronta) return null;
  const pistas = [texto ?? "", dados?.titulo ?? "", dados?.texto ?? ""].join(" ");
  return {
    via: temDados ? "anuncio" : "mensagem_pronta",
    nicho: nichoDoTexto(pistas),
    teste: /quero testar a ana/.test(t) || PERGUNTA_DE_TESTE.test(t),
    adId: dados?.adId ?? null,
    titulo: dados?.titulo ?? null,
  };
}

/** Lê os dados do anúncio de dentro da mensagem do WhatsApp (aceita os dois jeitos de escrever as chaves). */
export function dadosDoAnuncio(m: any): DadosAnuncio | null {
  const ctx =
    m?.extendedTextMessage?.contextInfo ??
    m?.extendedTextMessage?.ContextInfo ??
    m?.messageContextInfo ??
    m?.contextInfo ??
    m?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ??
    null;
  const ad = ctx?.externalAdReply ?? ctx?.ExternalAdReply ?? null;
  if (!ad || typeof ad !== "object") return null;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const dados: DadosAnuncio = {
    titulo: s(ad.title ?? ad.Title),
    texto: s(ad.body ?? ad.Body),
    url: s(ad.sourceUrl ?? ad.sourceURL ?? ad.SourceURL),
    adId: s(ad.sourceId ?? ad.sourceID ?? ad.SourceID),
    ctwaClid: s(ad.ctwaClid ?? ad.CtwaClid),
  };
  return Object.values(dados).some(Boolean) ? dados : null;
}

/** Bloco que entra no prompt da Ana quando a conversa começou por um anúncio. */
export function contextoAnuncio(o: OrigemAnuncio | null): string {
  if (!o) return "";
  const nicho = o.nicho ? NICHO_LABEL[o.nicho] : "negócio de serviço (clínica, consultório ou academia)";
  const corte = o.nicho ? CORTE_DO_ANUNCIO[o.nicho] : 30_000;
  const quem = o.nicho === "academia" ? "aluno" : "paciente";
  return `

## Este contato veio de um anúncio da DemandIA
Ele clicou num anúncio para donos de ${nicho} e caiu direto aqui no WhatsApp. O anúncio prometeu: ver você atendendo na hora, diagnóstico gratuito e Acesso Antecipado com vagas limitadas para quem fatura acima de R$ ${corte.toLocaleString("pt-BR")} por mês.
- ${o.teste ? `A primeira mensagem é um TESTE: o dono está fingindo ser ${quem} para ver como você atende. ` : ""}Se a pessoa mandar uma pergunta de ${quem} (preço, horário, como funciona) ou pedir para testar, responda primeiro como você atenderia o ${quem} dela: 1 balão curto, simpático, sem inventar preço (diga que depende da avaliação ou do plano) e já oferecendo um próximo passo concreto. Depois, em outro balão, vire para o dono: diga que é assim que você atenderia o ${quem} dele, a qualquer hora, e pergunte se o negócio é dele.
- Nas 3 primeiras trocas, descubra com naturalidade: se a pessoa é dona ou sócia, o faturamento mensal (pode ser faixa) e mais ou menos quantas mensagens chegam por dia. Registre tudo com \`registrar_qualificacao\` assim que souber.
- Se a pessoa não for dona, peça com gentileza para chamar quem decide ou para seguir a conversa com o dono.
- Fale a língua do dono: receita, agenda cheia, ${quem} que escapa para o concorrente, custo de contratar mais gente. Nunca use "lead", "funil", "SDR" ou "BANT" com ele.
- O próximo passo é o diagnóstico gratuito: a conversa com nosso especialista. Siga as regras de agendamento normais.
- Se a ferramenta disser que o faturamento está abaixo do mínimo, agradeça, diga que o Acesso Antecipado é para quem fatura acima de R$ ${corte.toLocaleString("pt-BR")} e deixe a porta aberta.`;
}
