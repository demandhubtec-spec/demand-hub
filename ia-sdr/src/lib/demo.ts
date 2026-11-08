/**
 * Demo ao vivo da recepcionista de IA (Reels "Comenta DEMO", 04/11/2026).
 *
 * Caminho: a pessoa comenta DEMO no Reels → recebe o Direct com o botão "Testar no WhatsApp" →
 * chega aqui com a mensagem pronta "Oi! Quero testar a demo ao vivo da recepcionista de IA."
 *
 * A partir daí, por tempo limitado, quem responde é uma recepcionista de IA de clínica (de exemplo
 * ou a clínica do próprio dono, se ele contar). O dono faz papel de paciente. Quando ele pede para
 * sair, quando a recepcionista encerra ou quando o tempo acaba, a Ana volta e conduz para o
 * diagnóstico gratuito.
 *
 * Estado fica em eventos do lead: "demo_iniciada" { inicio } e "demo_encerrada" { em, motivo }.
 */
import { SDR_CONFIG } from "../config/sdr.ts";
import type { Tool } from "./llm.ts";
import type { Message } from "./db.ts";
import { formatBR } from "./time.ts";
import { env } from "./env.ts";
import { phoneVariants } from "./diagnostico.ts";

const D = SDR_CONFIG.demo;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** A mensagem pronta do botão (e variações de quem digita na mão). */
export function ehPedidoDeDemo(texto: string | null | undefined): boolean {
  const t = norm(texto ?? "");
  if (!t) return false;
  return (
    /demo ao vivo/.test(t) ||
    /(testar|ver|fazer|quero) (a |o )?(demo|demonstracao)\b/.test(t) ||
    /recepcionista de (ia|inteligencia artificial)/.test(t) ||
    /^demo[.!]*$/.test(t)
  );
}

/** O lead quer parar o teste e falar com a Ana. */
export function ehSaidaDaDemo(texto: string | null | undefined): boolean {
  const t = norm(texto ?? "").replace(/[.!?]+$/, "");
  if (!t) return false;
  return (
    /^(sair|encerrar|parar|finalizar|fim|acabou|chega)( (da|a|o|do) (demo|teste))?$/.test(t) ||
    /(sair|encerrar|parar|finalizar|terminar) (da |a |o |do )?(demo|teste)/.test(t) ||
    /falar com a ana/.test(t)
  );
}

export interface DemoIniciada {
  inicio: string;
}
export interface DemoEncerrada {
  em: string;
  motivo: string;
}

/** A demo vale enquanto não foi encerrada e não passou o tempo limite. */
export function demoAtiva(ini: DemoIniciada | null, fim: DemoEncerrada | null, agora: Date): boolean {
  if (!ini?.inicio) return false;
  const inicio = new Date(ini.inicio).getTime();
  if (Number.isNaN(inicio)) return false;
  if (fim?.em && new Date(fim.em).getTime() >= inicio) return false;
  return agora.getTime() - inicio < D.duracaoHoras * 3_600_000;
}

/**
 * Modo teste do Kelvin (04/11/2026): pelo WhatsApp pessoal dele, o que ele escreve para a Ana vira
 * orientação. Quando ele pede a demo, por 30 minutos ele conversa com a Ana como se fosse um cliente
 * (demo e virada para o diagnóstico). Depois volta a ser orientação. Só vale para o número dele.
 */
export const TESTE_DONO_MIN = 30;

/** O número é do Kelvin (dono ou número de alertas)? */
export function ehNumeroDoDono(phone: string | null | undefined, donos: string[] = [env.ownerPhone, env.alertPhone]): boolean {
  if (!phone) return false;
  return donos.filter(Boolean).some((d) => phoneVariants(d).includes(phone) || phoneVariants(phone).includes(d));
}

/** O teste do Kelvin vale por 30 minutos a partir do pedido da demo. */
export function emTesteDoDono(ini: DemoIniciada | null, agora: Date): boolean {
  if (!ini?.inicio) return false;
  const inicio = new Date(ini.inicio).getTime();
  if (Number.isNaN(inicio)) return false;
  return agora.getTime() - inicio < TESTE_DONO_MIN * 60_000;
}

/**
 * Quem pede a demo e está com a Ana pausada (ex.: follow-up esgotado num contato antigo) volta a ser
 * atendido. Não vale quando a conversa foi passada para a equipe (status "humano"), quando a pessoa
 * pediu para não receber mensagens, ou quando alguém da equipe respondeu na mão nos últimos 7 dias.
 */
export const DIAS_PROTEGE_HANDOFF = 7;
export function podeRetomarParaDemo(status: string | null | undefined, ultimoHandoffEm: string | null, agora: Date): boolean {
  if (status === "humano" || status === "opt_out") return false;
  if (ultimoHandoffEm) {
    const t = new Date(ultimoHandoffEm).getTime();
    if (!Number.isNaN(t) && agora.getTime() - t < DIAS_PROTEGE_HANDOFF * 86_400_000) return false;
  }
  return true;
}

/** Mensagens que fazem parte da demo atual (do pedido em diante). */
export function mensagensDaDemo(msgs: Message[], ini: DemoIniciada): Message[] {
  // 2 minutos de folga: o evento é gravado logo depois da mensagem do pedido
  const desde = new Date(ini.inicio).getTime() - 120_000;
  return msgs.filter((m) => new Date(m.created_at).getTime() >= desde);
}

/** Já passou do limite de mensagens do lead dentro da demo? */
export function demoEsgotada(msgs: Message[], ini: DemoIniciada): boolean {
  return mensagensDaDemo(msgs, ini).filter((m) => m.direction === "in").length > D.maxMensagens;
}

export const TOOL_ENCERRAR_DEMO: Tool = {
  name: "encerrar_demo",
  description:
    "Encerra a demonstração da recepcionista. Use quando o lead pedir para sair, quando a simulação já mostrou o atendimento (agendamento simulado concluído) ou quando ele perguntar da DemandIA em si (preço, como contratar, como funciona por trás). Mandar o nome e os procedimentos da clínica dele NÃO é motivo para encerrar: é para personalizar a demo. Depois disso a Ana volta a conversar com ele.",
  input_schema: {
    type: "object",
    properties: {
      motivo: { type: "string", description: "Curto. Ex.: 'agendamento simulado concluído', 'lead pediu para sair', 'falou como dono'" },
    },
    required: ["motivo"],
  },
};

/** Prompt da recepcionista durante a demo. */
export function promptDemo(agora: Date, ini: DemoIniciada, mensagensDoLead: number): string {
  const c = D.clinicaExemplo;
  const fimEm = new Date(new Date(ini.inicio).getTime() + D.duracaoHoras * 3_600_000);
  const perto = mensagensDoLead >= D.maxMensagens - 2;
  return `Você está numa DEMONSTRAÇÃO AO VIVO da ${SDR_CONFIG.empresa.nome}. O dono de uma clínica pediu para testar como seria ter uma recepcionista de inteligência artificial atendendo os pacientes dele pelo WhatsApp. Ele vai fingir ser paciente.

## Seu papel
Você é a recepcionista virtual de uma clínica. Até o dono contar como é a clínica dele, você atende como a ${c.nome}, uma ${c.tipo} de exemplo:
- Horário: ${c.horario}
- Convênio: ${c.convenio}
- Pagamento: ${c.pagamento}
- Procedimentos e valores de exemplo:
${c.procedimentos.map((p) => `  - ${p}`).join("\n")}

Se ele disser o nome da clínica dele e o que ela faz (ex.: "minha clínica é a Sorriso Vivo, odontologia, faz implante e clareamento"), a demo CONTINUA: em 1 balão curto, confirme que a partir de agora você é a recepcionista da clínica dele (com o nome dela) e convide: "pode me mandar uma mensagem como se fosse um paciente". Dali em diante atenda com o nome e os procedimentos dele. Não invente preço da clínica dele: diga que o valor é passado na avaliação e já ofereça horários.

## Abertura (só se a última mensagem for o pedido para testar a demo)
Mande 2 balões curtos e diretos (a pessoa vem de um anúncio e não pode ficar sem saber o que fazer):
1. "Demo liberada 😊 Agora eu sou a recepcionista de IA da ${c.nome}, uma clínica de exemplo. Faz de conta que você é um paciente e me manda uma mensagem."
2. Uma pergunta pronta para ele copiar, entre aspas, por exemplo: "Oi, quanto custa o botox? Tem horário no sábado?". Termine dizendo que, se preferir, ele pode mandar o nome da clínica dele e 2 ou 3 procedimentos que você atende como se fosse ela (e SAIR encerra).

## Respostas curtas no meio da demo
Se ele mandar só uma confirmação ("blz", "ok", "beleza", "show", "👍", "certo") sem perguntar nada, NÃO responda "como posso ajudar". Continue no papel e puxe o teste em 1 balão: "Pode testar 😊 Manda como se fosse paciente, tipo: 'Oi, queria marcar uma avaliação, tem horário essa semana?'".

## Como atender (o que o dono precisa sentir)
- Responda rápido, simpática e certeira, como a melhor recepcionista que ele já teve. Tire a dúvida e SEMPRE puxe para o agendamento da avaliação.
- Ofereça 2 horários concretos dos próximos dias (ex.: "quinta às 18h ou sábado às 10h"), dentro do horário de funcionamento. Hoje é ${formatBR(agora)}.
- Para "marcar", peça o nome do paciente e confirme dia e horário. Diga que é uma simulação: na demo nada vai para a agenda de verdade.
- Se ele perguntar algo fora do catálogo, responda com bom senso de recepcionista (avaliação, encaminhar à especialista), sem inventar promessa de resultado.
- Mandar o nome e os procedimentos da clínica dele faz parte da demo: personalize e siga. NÃO use \`encerrar_demo\` por isso.
- Se ele perguntar da DemandIA em si (quanto custa a recepcionista, como contratar, como funciona por trás), use \`encerrar_demo\`.
- Quando o agendamento simulado estiver confirmado, use \`encerrar_demo\`.${perto ? "\n- O teste está chegando ao limite: conclua o agendamento simulado e use `encerrar_demo`." : ""}

## Estilo
- Português do Brasil, como uma pessoa digitando no WhatsApp: frases curtas, 1 ou 2 balões (separe com uma linha em branco), no máximo 1 emoji.
- Nunca use travessão (— ou –) nem markdown (nada de **, ##, listas com -).
- Se perguntarem se você é uma IA, diga que sim: é a recepcionista de IA da demonstração da ${SDR_CONFIG.empresa.nome}.
- Não fale da DemandIA, de diagnóstico ou de reunião durante a demo. Isso é com a Ana, depois.

O teste fica liberado até ${formatBR(fimEm)}.`;
}

/** Bloco que entra no prompt da Ana depois que a demo acabou. */
export function contextoPosDemo(encerradaAgora: boolean): string {
  return `

## Este contato pediu para testar a demo da recepcionista de IA
Ele chegou pelo anúncio ou pelo Instagram da ${SDR_CONFIG.empresa.nome} e pediu, aqui no WhatsApp, para testar uma recepcionista de IA atendendo como se fosse uma clínica (as mensagens da recepcionista estão no histórico; pode ser que ele não tenha chegado a testar). A demo acabou e agora quem fala é você, ${SDR_CONFIG.nomeAssistente}.
${encerradaAgora ? `- Nesta resposta, faça a virada: em 1 balão, diga que a demo terminou e pergunte o que ele achou, ou se imagina isso atendendo os pacientes da clínica dele à noite e no fim de semana. Não repita a apresentação inteira.\n` : ""}- Fale a língua do dono: paciente que pergunta à noite e marca em outro lugar, agenda cheia, recepção que fecha às 19h. Nunca use "lead", "funil", "SDR" ou "BANT".
- Descubra com naturalidade se a clínica é dele (ou se ele responde pelo atendimento), o faturamento mensal (pode ser faixa) e quantas mensagens de paciente chegam por dia. Registre com \`registrar_qualificacao\`, segmento "clínica".
- O próximo passo é o diagnóstico gratuito com nosso especialista, onde ele vê como a recepcionista ficaria configurada para a clínica dele. Siga as regras de agendamento normais.
- Se ele não chegou a testar, ofereça de novo de um jeito leve: é só mandar "quero testar a demo ao vivo".
- Se ainda não sabe o nome dele, pergunte com naturalidade.`;
}

/** Minutos sem o lead testar (depois da abertura) até a recepcionista dar uma cutucada, uma vez só. */
export const CUTUCADA_MIN = 15;
/** Horas paradas depois da demo (testou ou não) até a Ana retomar no mesmo dia, uma vez só. */
export const RETOMADA_DEMO_HORAS = 2;
/** Janela do dia (Brasília) para cutucada e retomada da demo: o lead acabou de chamar, não é prospecção fria. */
export const JANELA_DEMO: [number, number] = [8, 21];

/** Texto da cutucada: a recepcionista lembra que é só mandar como paciente. */
export function textoCutucada(): string {
  return `Ainda tá por aí? 😊\n\nPode testar à vontade. Manda como se fosse paciente, por exemplo: "Oi, quanto fica uma limpeza de pele? Dá pra marcar sábado?"`;
}

/** Conta quantas mensagens o lead mandou depois do pedido da demo (sem contar o próprio pedido). */
export function mensagensDoLeadNaDemo(msgs: Message[], ini: DemoIniciada): number {
  const ms = mensagensDaDemo(msgs, ini).filter((m) => m.direction === "in");
  return Math.max(0, ms.filter((m) => !ehPedidoDeDemo(m.content)).length);
}
