import { NUMEROS_BLOQUEADOS } from "../config/bloqueados.ts";
import { normalizePhone, phoneVariants } from "./diagnostico.ts";

/** Conjunto com todas as formas de cada número bloqueado (com e sem o 9 extra). */
function lista(): Set<string> {
  const extra = (process.env.IGNORE_PHONES || "").split(/[,;\n]/);
  const out = new Set<string>();
  for (const raw of [...NUMEROS_BLOQUEADOS, ...extra]) {
    const p = normalizePhone(raw);
    if (p) for (const v of phoneVariants(p)) out.add(v);
  }
  return out;
}

/** true se algum dos números (ou JIDs) informados está na lista de bloqueio. */
export function isBlocked(...phones: Array<string | null | undefined>): boolean {
  const bl = lista();
  if (!bl.size) return false;
  for (const ph of phones) {
    if (!ph) continue;
    const digits = String(ph).split("@")[0].split(":")[0].replace(/\D/g, "");
    const p = normalizePhone(digits) ?? digits;
    if (phoneVariants(p).some((v) => bl.has(v))) return true;
  }
  return false;
}
