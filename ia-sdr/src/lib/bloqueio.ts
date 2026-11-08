import { NUMEROS_BLOQUEADOS } from "../config/bloqueados.ts";
import { NUMEROS_CLIENTES } from "../config/clientes.ts";
import { normalizePhone, phoneVariants } from "./diagnostico.ts";

/** Conjunto com todas as formas de cada número (com e sem o 9 extra). */
function lista(base: string[] = NUMEROS_BLOQUEADOS, envVar = "IGNORE_PHONES"): Set<string> {
  const extra = (process.env[envVar] || "").split(/[,;\n]/);
  const out = new Set<string>();
  for (const raw of [...base, ...extra]) {
    const p = normalizePhone(raw);
    if (p) for (const v of phoneVariants(p)) out.add(v);
  }
  return out;
}

/** true se algum dos números (ou JIDs) informados está na lista de bloqueio. */
export function isBlocked(...phones: Array<string | null | undefined>): boolean {
  return bate(lista(), phones);
}

/** true se o número é de um cliente ativo (a Ana registra a mensagem mas não responde). */
export function ehCliente(...phones: Array<string | null | undefined>): boolean {
  return bate(lista(NUMEROS_CLIENTES, "CLIENT_PHONES"), phones);
}

function bate(bl: Set<string>, phones: Array<string | null | undefined>): boolean {
  if (!bl.size) return false;
  for (const ph of phones) {
    if (!ph) continue;
    const digits = String(ph).split("@")[0].split(":")[0].replace(/\D/g, "");
    const p = normalizePhone(digits) ?? digits;
    if (phoneVariants(p).some((v) => bl.has(v))) return true;
  }
  return false;
}
