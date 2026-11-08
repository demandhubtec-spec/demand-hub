/**
 * Clientes ativos da DemandIA. A Ana NÃO conversa com eles (contrato, pagamento, projeto são com o Kelvin),
 * mas a mensagem fica registrada no histórico e o Kelvin recebe um aviso no WhatsApp.
 * Diferente de bloqueados.ts: lá a mensagem nem é registrada.
 * Para adicionar: número com DDD (com ou sem 55, com ou sem o 9, com ou sem traço). Também dá para incluir
 * mais números sem mexer no código, pela variável CLIENT_PHONES na Vercel (separados por vírgula).
 */
export const NUMEROS_CLIENTES: string[] = [
  // Gustavo Pecoraro (em 07/11 perguntou do contrato e a Ana respondeu como se fosse lead)
  "19 99362-9493",
];
