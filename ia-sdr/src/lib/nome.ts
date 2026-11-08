/**
 * Nome que o WhatsApp manda (pushName) nem sempre é um nome: em 07/11 chegaram "marlucia25ester@gmail.com"
 * e "jhonatapirapora" pelo anúncio da demo. E-mail vai para o campo de e-mail; apelido de usuário não vira nome.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface NomeDoPush {
  nome: string | null;
  email: string | null;
}

export function limparNomeDoPush(push: string | null | undefined): NomeDoPush {
  const p = String(push ?? "").trim();
  if (!p) return { nome: null, email: null };
  if (EMAIL_RE.test(p)) return { nome: null, email: p.toLowerCase() };
  // Cara de @ de usuário: uma palavra só com número, ponto ou sublinhado, ou uma palavra muito longa e minúscula
  const umaPalavra = !/\s/.test(p);
  if (umaPalavra && (/[\d_.@]/.test(p) || (p.length > 12 && p === p.toLowerCase()))) return { nome: null, email: null };
  // Só emoji ou símbolo também não é nome
  if (!/\p{L}/u.test(p)) return { nome: null, email: null };
  return { nome: p, email: null };
}
