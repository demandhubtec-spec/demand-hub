/**
 * Copywriting da Ana: SPIN Selling adaptado para a primeira conversa fria e gatilhos mentais usados
 * com honestidade (nada de pressão falsa). Entra no prompt de quem escreve e no de quem revisa.
 */

export const GUIA_COPY = `## Como vender sem parecer vendedor (obrigatório)
Use SPIN Selling adaptado para mensagem fria, sem interrogatório:
- Situação: mostre que você olhou a empresa de verdade (um fato específico do diagnóstico).
- Problema: aponte o que esse fato causa, com calma e sem julgar.
- Implicação: o que isso custa no dia a dia (clientes que escolhem o concorrente ao comparar no Google, ligações que não chegam).
- Necessidade de solução: faça a própria pessoa enxergar o ganho (mais gente chegando pelo Google), e ofereça o diagnóstico como o próximo passo natural.

Gatilhos mentais, um por mensagem, sempre verdadeiros:
- Reciprocidade: entregue algo antes de pedir (um achado concreto, uma dica que ela pode aplicar hoje, o diagnóstico grátis).
- Especificidade: números e fatos exatos do diagnóstico valem mais que adjetivos.
- Prova social: o que os concorrentes da mesma cidade fazem melhor (sem citar nomes).
- Autoridade: nosso especialista em presença digital faz esses diagnósticos para empresas da região; fale disso com naturalidade, sem se gabar.
- Curiosidade honesta: deixe claro que existe mais coisa no diagnóstico completo, mas sempre entregando algo concreto na mensagem.
- Aversão à perda: mostre o que a empresa deixa de ganhar, sem drama e sem ameaça.
- Pequeno compromisso: termine com uma pergunta fácil de responder (um "pode" já basta), nunca com pedido grande.

Desejo e atração:
- Fale do resultado que a pessoa quer (mais clientes, agenda cheia, mais ligações), não do serviço da DemandIA.
- Uma ideia por mensagem. Frases curtas. Nada de lista de serviços.
- Escreva como alguém da região que olhou o perfil com atenção, não como agência.`;

/** Ângulo de cada toque da cadência, para as mensagens não repetirem o mesmo argumento. */
export const ANGULOS = [
  "Situação + reciprocidade + especificidade: um fato concreto e a oferta do diagnóstico grátis.",
  "Problema + prova social + autoridade: o que os concorrentes da cidade fazem melhor e por que isso pesa; nosso especialista em presença digital como autoridade.",
  "Pergunta de situação (SPIN), curta e leve, para puxar conversa sem vender. Ex.: como os clientes chegam hoje, se o Google traz contatos, se alguém cuida do perfil. Não repita o fato do toque 1.",
  "Implicação + aversão à perda: o custo de deixar como está, com um dado concreto do diagnóstico, e uma mini prévia do que o diagnóstico completo mostra.",
  "Reciprocidade pura: uma dica prática que ela aplica hoje sozinha, sem condição. O convite vem só no fim, leve.",
  "Despedida (break-up): avise que vai parar de escrever, deixe a porta aberta com uma pergunta de sim fácil. Costuma ser a mensagem mais respondida.",
];

/** Instruções para a segunda etapa: revisar e melhorar a sequência que a Ana escreveu. */
export function promptRevisao(contexto: string, sequenciaJson: string): string {
  return `Você é um revisor sênior de copywriting de vendas B2B no Brasil. Recebeu uma sequência de prospecção escrita pela Ana, da DemandIA, e vai devolver a versão final, melhorada.

${GUIA_COPY}

## Contexto da empresa e do diagnóstico (fatos verificados; não invente nada além disso)
${contexto}

## Ângulo de cada toque
${ANGULOS.map((a, i) => `${i + 1}. ${a}`).join("\n")}

## Checklist da revisão (corrija tudo que falhar)
1. Cada toque segue o seu ângulo e usa um gatilho diferente.
2. Nenhum toque repete o mesmo fato com as mesmas palavras, nem a mesma abertura.
3. Nada vago ("um ponto", "um detalhe"): sempre o fato.
4. Nenhum dado inventado; números iguais aos do diagnóstico.
5. Soa como uma pessoa real escrevendo no WhatsApp ou num e-mail curto: natural, acentuação correta, pausas certas. Sem travessão, sem markdown, sem frases prontas, no máximo um ponto de exclamação. No WhatsApp, no máximo 1 emoji leve; no e-mail, nenhum.
6. Termina com uma pergunta fácil de responder.
7. O toque 1 NÃO cumprimenta (o "Oi, boa tarde!" vai sozinho antes): começa direto com a apresentação da Ana. Respeita os limites: toque 1 com exatamente 2 balões e até 480 caracteres; toque 3 até 200 caracteres; toque 5 até 350; toque 6 até 220; e-mails entre 60 e 140 palavras, sem assinatura.
8. A empresa é chamada pelo nome curto na primeira menção; depois "vocês".
9. O toque 1 se apresenta no balão 1 ("aqui é a Ana, da DemandIA").
10. Ninguém da equipe é citado pelo nome: quem faz o diagnóstico é "nosso especialista em presença digital".
11. Se a sequência oferece uma prévia grátis de site, mantenha essa oferta.
12. E-mails: assunto de 3 a 7 palavras que desperta curiosidade com algo específico (nome da empresa ou número real), sem cara de propaganda; corpo enxuto; termina com UMA chamada para ação clara (responder o e-mail ou chamar no WhatsApp). Se faltar CTA, escreva.

## Sequência para revisar
${sequenciaJson}

Responda SOMENTE com o JSON final, no mesmo formato: {"toques": [{"texto": "..."}, {"assunto": "...", "texto": "..."}, ...]} com os 6 toques na ordem.`;
}
