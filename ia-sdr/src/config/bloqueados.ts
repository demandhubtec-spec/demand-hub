/**
 * Números com quem a IA NUNCA conversa (amigos, família, parceiros, fornecedores...).
 * A IA não responde, não puxa conversa, não manda follow-up e não cria lead para eles.
 * Para adicionar: coloque o número com DDD (com ou sem 55, com ou sem o 9, com ou sem traço).
 * Também dá para incluir mais números sem mexer no código, pela variável IGNORE_PHONES
 * na Vercel (separados por vírgula).
 */
export const NUMEROS_BLOQUEADOS: string[] = [
  "11 95213-4563",
  "19 99884-4691",
  "27 99202-0434",
  "19 99478-6530",
];
