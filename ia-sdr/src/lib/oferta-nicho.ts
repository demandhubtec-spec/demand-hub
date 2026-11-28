/**
 * Oferta por nicho (27/11/2026, Kelvin): a abordagem genérica não leva ninguém para a reunião.
 * Cada nicho tem UMA dor que quase todo dono tem agora, e a nossa chamada, o motivo da reunião e a resposta
 * ao preço giram em torno dela. A reunião serve para mostrar na prática como isso se resolve; preço só depois
 * de entender a empresa.
 *
 * Usado na apresentação da Gabi/Marina no WhatsApp ({{oferta}} no Prompt System) e no prompt da ligação.
 */

export type Segmento = "educacao" | "academia" | "clinica" | "estetica" | "alimentacao" | "imobiliaria" | "construtora" | "b2b" | "generico";

export interface Oferta {
  segmento: Segmento;
  /** A dor que 99% dos donos desse nicho têm agora. */
  dor: string;
  /** O que a gente resolve, em uma frase, com a palavra do dono. */
  promessa: string;
  /** Abertura: a dor + a solução, em dois balões curtos (o primeiro é a dor). */
  chamada: string;
  /** Nome e objetivo da reunião: o que a pessoa vê na prática. */
  reuniao: string;
  /** Uma pergunta de situação para a pessoa contar a dor com as palavras dela. */
  pergunta: string;
}

const OFERTAS: Record<Segmento, Omit<Oferta, "segmento">> = {
  educacao: {
    dor: "a turma de fevereiro precisa fechar, e quem pede informação de curso fecha com a escola que responde primeiro; muito interessado fica sem resposta e sem acompanhamento",
    promessa: "captar mais interessados, responder cada um em segundos com uma IA que tira as dúvidas e agenda a visita ou a matrícula, registrar tudo no sistema e fazer o acompanhamento (WhatsApp e ligação) até a matrícula",
    chamada:
      "As matrículas de fevereiro estão abrindo agora, e quem pede informação de curso costuma fechar com a escola que responde primeiro.\n\nA gente cuida das três pontas: traz mais interessados, uma IA responde cada um na hora e já agenda a visita ou a matrícula, e tudo fica registrado no sistema, com acompanhamento por WhatsApp e ligação até fechar. Mais turma fechada, sem aumentar a equipe.",
    reuniao: "como fechar as turmas de fevereiro e março: captação de alunos, a IA respondendo como se fosse um aluno de vocês e o acompanhamento de cada interessado no sistema",
    pergunta: "Hoje, quando alguém pede informação de um curso fora do horário, quem responde e em quanto tempo?",
  },
  academia: {
    dor: "janeiro é o mês que mais entra aluno, e quem pergunta preço e não recebe resposta rápida vai para a academia do lado; e aluno que some não é chamado de volta",
    promessa: "captar mais alunos, responder todo pedido de preço na hora com aula experimental agendada, cuidar de matrícula e rematrícula, e chamar de volta quem sumiu por WhatsApp e ligação, com tudo organizado no sistema",
    chamada:
      "Janeiro é o mês que mais entra aluno, e quem pergunta preço e não recebe resposta em minutos acaba indo para a academia do lado.\n\nA gente cuida das três pontas: traz mais interessados, uma IA responde na hora e já agenda a aula experimental, e o sistema acompanha matrícula e rematrícula, chamando de volta quem sumiu por WhatsApp e ligação. Mais aluno entrando e menos aluno saindo.",
    reuniao: "um plano de matrículas e rematrículas para janeiro: a IA agendando uma aula experimental e o sistema chamando de volta quem sumiu",
    pergunta: "Hoje, quem responde quando alguém pergunta o preço pelo Instagram à noite?",
  },
  clinica: {
    dor: "o paciente chama com a clínica fechada e ninguém responde, ou falta sem avisar, e a agenda fica com buraco",
    promessa: "captar mais pacientes, e o atendente marcar a consulta, registrar no sistema, confirmar, lembrar e reagendar sozinho, a qualquer hora",
    chamada:
      "Sabe quando o paciente chama com a clínica fechada e ninguém responde, ou esquece a consulta e não avisa?\n\nA gente cuida das três pontas: traz mais pacientes, um atendente no WhatsApp marca a consulta na hora, até fora do horário, e o sistema registra, confirma, lembra e reagenda sozinho. Agenda cheia e menos falta.",
    reuniao: "agenda cheia em janeiro: o atendente marcando, confirmando e reagendando uma consulta como se fosse um paciente de vocês, com tudo registrado no sistema",
    pergunta: "Hoje, quando um paciente chama depois das 18h, ele é respondido na hora ou só no dia seguinte?",
  },
  estetica: {
    dor: "a cliente chama fora do horário para agendar e ninguém responde, ou desmarca em cima da hora, e a agenda do verão fica com buraco",
    promessa: "captar mais clientes, e o atendente agendar, registrar, confirmar e reagendar sozinho, a qualquer hora",
    chamada:
      "Sabe quando a cliente chama fora do horário pra agendar e ninguém responde, ou desmarca em cima da hora?\n\nA gente cuida das três pontas: traz mais clientes, um atendente no WhatsApp agenda na hora, até fora do horário, e o sistema registra, confirma e reagenda sozinho. Agenda cheia no verão e menos falta.",
    reuniao: "agenda cheia no verão: o atendente agendando um procedimento como se fosse uma cliente de vocês, com confirmação e reagendamento automáticos",
    pergunta: "Hoje, quem responde as clientes que chamam à noite ou no fim de semana?",
  },
  alimentacao: {
    dor: "boa parte do lucro fica na taxa do iFood e pedido se perde na correria do WhatsApp, ainda mais em dezembro",
    promessa: "um canal próprio de pedidos e reservas: atrair mais clientes, o atendente fechar o pedido no WhatsApp e cada cliente ficar registrado para pedir de novo, sem taxa de aplicativo",
    chamada:
      "Muito restaurante vende bem, mas deixa boa parte do lucro na taxa do iFood e perde pedido na correria do WhatsApp.\n\nA gente monta o canal próprio de vocês: traz mais clientes, cardápio digital com a cara da marca, um atendente no WhatsApp que anota o pedido ou a reserva sozinho, e cada cliente fica registrado para a gente chamar de novo. Mais pedido e sem taxa.",
    reuniao: "o canal próprio de pedidos: o atendente fechando um pedido como se fosse um cliente de vocês e quanto sobra por mês sem a taxa do app (para alta gastronomia: reservas e eventos)",
    pergunta: "Hoje, quanto dos pedidos de vocês vem pelo iFood e quanto vem direto pelo WhatsApp?",
  },
  imobiliaria: {
    dor: "o interessado que chega pelos portais de imóveis (ZAP, VivaReal, OLX), pelo Facebook ou pelo Instagram esfria em minutos se fica sem resposta, e fecha com outra imobiliária",
    promessa: "captar mais interessados, responder cada um na hora, entender o que ele procura, passar ao corretor certo, registrar no CRM e fazer o acompanhamento, inclusive por ligação com IA, para ninguém ficar sem resposta",
    chamada:
      "O interessado que chega pelos portais de imóveis, como ZAP, VivaReal e OLX, ou pelo Facebook, esfria em minutos se fica sem resposta, e acaba fechando com outra imobiliária.\n\nA gente cuida das três pontas: traz mais interessados, uma IA responde na hora, entende o que a pessoa procura e passa para o corretor certo, e o CRM registra tudo e faz o acompanhamento, até por ligação. Nenhum lead esfria.",
    reuniao: "nenhum lead esfria: a IA recebendo um interessado do portal, passando para o corretor e fazendo o acompanhamento no CRM e por ligação",
    pergunta: "Hoje, quando chega um interessado pelo portal no fim de semana, em quanto tempo alguém responde?",
  },
  construtora: {
    dor: "o lead de lançamento esfria antes do comercial qualificar, e a base de interessados antigos fica parada",
    promessa: "captar leads, qualificar cada um na hora com IA no WhatsApp e por ligação, e o sistema fazer o acompanhamento, para o comercial só falar com quem está pronto",
    chamada:
      "Lead de lançamento chega muito, mas a maior parte esfria antes do comercial conseguir qualificar, e a base de interessados antigos fica parada.\n\nA gente cuida das três pontas: capta os leads, uma IA qualifica cada um na hora pelo WhatsApp e por ligação, e o sistema faz todo o acompanhamento. O comercial só fala com quem está pronto.",
    reuniao: "comercial só com lead pronto: a IA qualificando um lead ao vivo no WhatsApp e na ligação, com o acompanhamento no sistema",
    pergunta: "Hoje, quanto tempo o comercial leva para falar com um lead que chegou do anúncio?",
  },
  b2b: {
    dor: "para vender para outras empresas (lojistas, revendas, clientes corporativos), a prospecção é manual, lenta e depende do vendedor ter tempo",
    promessa: "prospecção ativa com IA: encontrar os clientes certos (lojistas, revendas, empresas), abordar por WhatsApp e ligação, qualificar e marcar na agenda do vendedor, com tudo registrado e acompanhado no sistema",
    chamada:
      "Quem vende para outras empresas sabe: prospectar lojista e cliente novo na mão é lento e depende do vendedor ter tempo.\n\nA gente faz prospecção ativa com IA: encontra os clientes certos, aborda por WhatsApp e por ligação, qualifica e já marca na agenda do vendedor, com tudo registrado e acompanhado no sistema. Mais cliente novo sem aumentar o time.",
    reuniao: "prospecção ativa com IA: como a gente encontraria e abordaria novos clientes de vocês, com a IA ligando e mandando mensagem ao vivo",
    pergunta: "Hoje, como vocês encontram e abordam novos clientes: o vendedor liga e visita, ou já tem algum processo?",
  },
  generico: {
    dor: "a empresa perde cliente porque demora para responder no WhatsApp e faz na mão o que podia rodar sozinho",
    promessa: "captar mais clientes, responder todos na hora e organizar cada contato no sistema, com acompanhamento automático",
    chamada:
      "Muita empresa perde cliente porque demora pra responder no WhatsApp e faz na mão o que podia rodar sozinho.\n\nA gente cuida das três pontas: traz mais clientes, um atendente inteligente responde e agenda na hora, e o sistema organiza e acompanha cada contato. Mais cliente e menos trabalho manual.",
    reuniao: "como ficaria o atendimento de vocês captando, respondendo e organizando os clientes sozinho",
    pergunta: "Hoje, quem responde os clientes que chamam fora do horário?",
  },
};

const RE_ALIM = /aliment|restaur|lanch|pizz|hamburg|burger|confeit|doce|salgad|marmit|a[cç]a[ií]|gelat|sorvet|padar|caf[eé]|\bbar\b|churras|gastronom|comida|food|delivery|chef|card[aá]pio|espetaria|coxinha/i;

/** Segmento do lead pelo nicho e pelo nome da empresa. */
export function segmentoDoLead(nicho: string | null | undefined, empresa?: string | null): Segmento {
  const n = `${nicho ?? ""} ${empresa ?? ""}`.toLowerCase();
  if (/faculdade|universidade|curso|t[eé]cnico|profissionalizante|idioma|ingl[eê]s|escola de (?:ingl|idioma|l[ií]ngua|inform|profiss)|educa[cç]/.test(n)) return "educacao";
  if (/academia|crossfit|cross fit|pilates|muscula|funcional|fitness|\bgym\b|est[uú]dio de treino|box de/.test(n)) return "academia";
  if (/construtora|incorporadora|loteament|empreendimento/.test(n)) return "construtora";
  if (/distribuidor|atacad|revenda|representa[cç][aã]o|importador|fornecedor|ind[uú]stria|f[aá]brica|b2b/.test(n)) return "b2b";
  if (/imob|corretor/.test(n)) return "imobiliaria";
  if (RE_ALIM.test(n)) return "alimentacao";
  if (/est[eé]tic|depila|harmoniza|laser|biomedic/.test(n)) return "estetica";
  if (/odonto|dent|cl[ií]nic|m[eé]dic|endocrin|consult|sa[uú]de|oncolog|geriatr|nutri|fisio|psic|oftalm|dermat/.test(n)) return "clinica";
  return "generico";
}

export function ofertaDoNicho(nicho: string | null | undefined, empresa?: string | null): Oferta {
  const segmento = segmentoDoLead(nicho, empresa);
  return { segmento, ...OFERTAS[segmento] };
}

/** Bloco que entra no Prompt System como {{oferta}}. */
export function ofertaEmTexto(o: Oferta): string {
  return [
    `A dor deste nicho (o que quase todo dono tem agora): ${o.dor}.`,
    `O que a gente resolve: ${o.promessa}.`,
    `O que a consultoria gratuita mostra na prática (é isso que você oferece, não "um bate-papo" nem "um diagnóstico"): ${o.reuniao}.`,
    `Pergunta para a pessoa contar a dor com as palavras dela: "${o.pergunta}"`,
  ].join("\n");
}
