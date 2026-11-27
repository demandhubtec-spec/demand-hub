/**
 * Oferta por nicho (27/11/2026, Kelvin): a abordagem genérica não leva ninguém para a reunião.
 * Cada nicho tem UMA dor que quase todo dono tem agora, e a nossa chamada, o motivo da reunião e a resposta
 * ao preço giram em torno dela. A reunião serve para mostrar na prática como isso se resolve; preço só depois
 * de entender a empresa.
 *
 * Usado na apresentação da Gabi/Marina no WhatsApp ({{oferta}} no Prompt System) e no prompt da ligação.
 */

export type Segmento = "educacao" | "academia" | "clinica" | "estetica" | "alimentacao" | "imobiliaria" | "construtora" | "generico";

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
    dor: "a turma de fevereiro precisa fechar e muito interessado pede informação e não recebe resposta a tempo (quem responde primeiro leva o aluno)",
    promessa: "cada pedido de informação respondido em segundos, com o interessado já agendando visita ou fazendo a matrícula, além de chamar de volta quem pediu informação e sumiu",
    chamada:
      "As matrículas de fevereiro estão abrindo agora, e quem pede informação de curso costuma fechar com a escola que responde primeiro.\n\nA gente resolve isso com um atendente inteligente no WhatsApp que responde na hora, tira as dúvidas do curso e já agenda a visita ou a matrícula, até fora do horário, e com a Gabi ligando para quem pediu informação e sumiu. Mais turma fechada, sem aumentar a equipe.",
    reuniao: "um plano de captação para fechar as turmas de fevereiro e março: nosso especialista mostra ao vivo o atendente respondendo como se fosse um aluno de vocês",
    pergunta: "Hoje, quando alguém pede informação de um curso fora do horário, quem responde e em quanto tempo?",
  },
  academia: {
    dor: "janeiro é o mês que mais entra aluno, e quem pergunta preço no Instagram ou no WhatsApp e não recebe resposta rápida vai para a academia do lado",
    promessa: "todo pedido de preço respondido na hora, com aula experimental agendada, e ex-aluno sendo chamado de volta",
    chamada:
      "Janeiro é o mês que mais entra aluno, e quem pergunta preço e não recebe resposta em minutos acaba indo para a academia do lado.\n\nA gente resolve isso com um atendente inteligente no WhatsApp que responde na hora, explica os planos e já agenda a aula experimental, e com uma campanha que chama de volta ex-alunos. Mais matrícula em janeiro, sem aumentar a recepção.",
    reuniao: "um plano de matrículas para janeiro: nosso especialista mostra ao vivo o atendente respondendo e agendando a aula experimental como se fosse um aluno de vocês",
    pergunta: "Hoje, quem responde quando alguém pergunta o preço pelo Instagram à noite?",
  },
  clinica: {
    dor: "o paciente chama com a clínica fechada e ninguém responde, ou esquece a consulta e não avisa, e a agenda fica com buraco",
    promessa: "o paciente que chama a qualquer hora já sai com horário marcado, confirmado e lembrado, e a agenda de janeiro fica cheia",
    chamada:
      "Sabe quando o paciente chama com a clínica fechada e ninguém responde, ou esquece a consulta e não avisa?\n\nA gente resolve isso com um atendente inteligente no WhatsApp da clínica: ele agenda, confirma e reagenda o paciente sozinho, até fora do horário, direto na agenda do especialista, e já avisa o doutor. Menos falta e agenda mais cheia.",
    reuniao: "agenda cheia em janeiro: nosso especialista mostra ao vivo o atendente marcando e confirmando uma consulta como se fosse um paciente de vocês",
    pergunta: "Hoje, quando um paciente chama depois das 18h, ele é respondido na hora ou só no dia seguinte?",
  },
  estetica: {
    dor: "a cliente chama fora do horário para agendar e ninguém responde, ou desmarca em cima da hora, e a agenda do verão fica com buraco",
    promessa: "toda cliente que chama já sai com horário marcado e confirmado, e a agenda do verão fica cheia",
    chamada:
      "Sabe quando a cliente chama fora do horário pra agendar e ninguém responde, ou desmarca em cima da hora?\n\nA gente resolve isso com um atendente inteligente no WhatsApp da clínica: ele agenda, confirma e reagenda a cliente sozinho, até fora do horário, e já avisa a profissional. Menos falta e agenda mais cheia.",
    reuniao: "agenda cheia no verão: nosso especialista mostra ao vivo o atendente agendando um procedimento como se fosse uma cliente de vocês",
    pergunta: "Hoje, quem responde as clientes que chamam à noite ou no fim de semana?",
  },
  alimentacao: {
    dor: "boa parte do lucro fica na taxa do iFood e pedido se perde na correria do WhatsApp, ainda mais em dezembro",
    promessa: "um canal próprio de pedidos e reservas, com o atendente fechando o pedido no WhatsApp, sem taxa de aplicativo",
    chamada:
      "Muito restaurante vende bem, mas deixa boa parte do lucro na taxa do iFood e perde pedido na correria do WhatsApp.\n\nA gente resolve isso com o canal próprio de vocês: cardápio digital ou aplicativo com a cara da marca, e um atendente no WhatsApp que anota o pedido sozinho. Mais pedido, cliente voltando e sem taxa.",
    reuniao: "o canal próprio de pedidos: nosso especialista mostra ao vivo o atendente fechando um pedido e quanto sobra por mês sem a taxa do app",
    pergunta: "Hoje, quanto dos pedidos de vocês vem pelo iFood e quanto vem direto pelo WhatsApp?",
  },
  imobiliaria: {
    dor: "o interessado que chega pelo portal ou pelo Facebook esfria em minutos se ninguém responde, e o corretor perde o cliente para outra imobiliária",
    promessa: "todo interessado respondido em segundos, já qualificado (compra ou aluguel, região, valor) e entregue ao corretor certo, sem ninguém se perder",
    chamada:
      "O interessado que chega pelo portal ou pelo Facebook esfria em minutos se ninguém responde, e acaba fechando com outra imobiliária.\n\nA gente resolve isso com um atendente inteligente no WhatsApp que responde na hora, entende o que a pessoa procura e já passa para o corretor certo, com tudo organizado num CRM. Nenhum lead esfria.",
    reuniao: "nenhum lead esfria: nosso especialista mostra ao vivo o atendente recebendo um interessado do portal e passando para o corretor",
    pergunta: "Hoje, quando chega um interessado pelo portal no fim de semana, em quanto tempo alguém responde?",
  },
  construtora: {
    dor: "o lead de lançamento chega frio, o comercial demora para qualificar e a base de interessados antigos fica parada",
    promessa: "lead de anúncio qualificado na hora por WhatsApp e ligação, e a base antiga reativada sem tirar o tempo dos corretores",
    chamada:
      "Lead de lançamento chega muito, mas a maior parte esfria antes do comercial conseguir qualificar, e a base de interessados antigos fica parada.\n\nA gente resolve isso com prospecção ativa com IA: um atendente que responde e qualifica cada lead na hora pelo WhatsApp, e ligações automáticas para reativar a base antiga. O corretor só fala com quem está pronto.",
    reuniao: "comercial só com lead pronto: nosso especialista mostra ao vivo a IA qualificando um lead e ligando para a base antiga",
    pergunta: "Hoje, quanto tempo o comercial leva para falar com um lead que chegou do anúncio?",
  },
  generico: {
    dor: "a empresa perde cliente porque demora para responder no WhatsApp e faz na mão o que podia rodar sozinho",
    promessa: "todo cliente respondido na hora e o trabalho repetitivo rodando sozinho",
    chamada:
      "Muita empresa perde cliente porque demora pra responder no WhatsApp e faz na mão o que podia rodar sozinho.\n\nA gente resolve isso com marketing, vendas e tecnologia sob medida: anúncio, site e um atendente inteligente no WhatsApp que responde e agenda na hora. Mais cliente e menos trabalho manual.",
    reuniao: "nosso especialista mostra ao vivo como ficaria o atendimento de vocês respondendo e agendando sozinho",
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
    `O motivo da reunião (é isso que você oferece, não "um bate-papo"): ${o.reuniao}.`,
    `Pergunta para a pessoa contar a dor com as palavras dela: "${o.pergunta}"`,
  ].join("\n");
}
