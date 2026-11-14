/**
 * Playbook comercial editável (portal > Comercial > Time Comercial IA > Playbook).
 * O Kelvin escreve as seções no portal; a Ana e o time seguem em todas as conversas.
 * Fica em memória por 1 minuto para não ir ao banco a cada mensagem.
 */
import { db } from "./db.ts";
import { ID_PROMPT_GABI, PROMPT_GABI_PADRAO } from "./prompt-gabi.ts";

export interface SecaoPlaybook {
  titulo: string;
  texto: string;
}

let cache: { em: number; texto: string; manuais: Record<string, string>; promptGabi: SecaoPlaybook[] | null } | null = null;
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
    const [{ data: linhas }, { data: ms }] = await Promise.all([
      db().from("comercial_playbook").select("id,secoes").in("id", ["principal", ID_PROMPT_GABI]),
      db().from("agentes_manuais").select("id,nome,cargo,secoes"),
    ]);
    const valida = (x: unknown): SecaoPlaybook[] =>
      (Array.isArray(x) ? x : []).filter((s): s is SecaoPlaybook => !!s && typeof s.titulo === "string" && typeof s.texto === "string");
    const linha = (id: string) => ((linhas ?? []) as { id: string; secoes: unknown }[]).find((l) => l.id === id);
    const secoes = valida(linha("principal")?.secoes);
    const pg = valida(linha(ID_PROMPT_GABI)?.secoes);
    const manuais: Record<string, string> = {};
    for (const m of (ms ?? []) as { id: string; nome: string; cargo: string; secoes: SecaoPlaybook[] }[]) {
      manuais[m.id] = `## Manual de trabalho: ${m.nome} (${m.cargo})\n${playbookEmTexto((m.secoes ?? []).filter((s) => s && typeof s.titulo === "string"))}`;
    }
    cache = { em: agora, texto: playbookEmTexto(secoes), manuais, promptGabi: pg.length ? pg : null };
  } catch (e) {
    console.error("playbook não carregou", e);
    cache = { em: agora, texto: cache?.texto ?? "", manuais: cache?.manuais ?? {}, promptGabi: cache?.promptGabi ?? null };
  }
  return cache.texto;
}

/** Prompt System da Gabi salvo no portal (ou o padrão, se ainda não salvaram nada). */
export function promptGabiAtual(): SecaoPlaybook[] {
  return cache?.promptGabi ?? PROMPT_GABI_PADRAO;
}

/** Último playbook carregado (para o montador do prompt, que é síncrono). */
export function playbookAtual(): string {
  return cache?.texto ?? "";
}

/**
 * Manuais de trabalho dos agentes (editáveis no portal), em texto para o prompt.
 * Quem fala com o lead hoje segue os manuais da Gabi (abordagem) e da Marina (qualifica e agenda);
 * a sequência é da Bia e a revisão do Rui; o site de demonstração é da Duda; o canal com o Kelvin é da Ana.
 */
export function manuaisAtuais(...ids: string[]): string {
  const m = cache?.manuais ?? {};
  return ids.map((id) => m[id]).filter(Boolean).join("\n\n");
}

/** Só para testes. */
export function limparCachePlaybook() {
  cache = null;
}
