/**
 * Playbook comercial editável (portal > Comercial > Time Comercial IA > Playbook).
 * O Kelvin escreve as seções no portal; a Ana e o time seguem em todas as conversas.
 * Fica em memória por 1 minuto para não ir ao banco a cada mensagem.
 */
import { db } from "./db.ts";

export interface SecaoPlaybook {
  titulo: string;
  texto: string;
}

let cache: { em: number; texto: string } | null = null;
const TTL = 60_000;

/** Seções em texto corrido para entrar no prompt (sem markdown pesado). */
export function playbookEmTexto(secoes: SecaoPlaybook[]): string {
  return secoes
    .filter((s) => s.titulo.trim() || s.texto.trim())
    .map((s) => {
      const linhas = s.texto
        .split("\n")
        .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
        .filter(Boolean)
        .map((l) => `- ${l}`)
        .join("\n");
      return `### ${s.titulo.trim() || "Sem título"}\n${linhas}`;
    })
    .join("\n\n");
}

/** Busca o playbook (com cache de 1 minuto). Se der erro, segue com o último que tinha. */
export async function carregarPlaybook(agora = Date.now()): Promise<string> {
  if (cache && agora - cache.em < TTL) return cache.texto;
  try {
    const { data } = await db().from("comercial_playbook").select("secoes").eq("id", "principal").maybeSingle();
    const secoes = ((data as { secoes?: SecaoPlaybook[] } | null)?.secoes ?? []).filter((s) => s && typeof s.titulo === "string");
    cache = { em: agora, texto: playbookEmTexto(secoes) };
  } catch (e) {
    console.error("playbook não carregou", e);
    cache = { em: agora, texto: cache?.texto ?? "" };
  }
  return cache.texto;
}

/** Último playbook carregado (para o montador do prompt, que é síncrono). */
export function playbookAtual(): string {
  return cache?.texto ?? "";
}

/** Só para testes. */
export function limparCachePlaybook() {
  cache = null;
}
