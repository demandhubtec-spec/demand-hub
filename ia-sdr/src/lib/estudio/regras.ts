/**
 * Estúdio · regras puras (sem banco, sem rede): calendário, nota das referências, status e legenda.
 * Ficam aqui para os testes cobrirem sem precisar de Supabase nem da Meta.
 */

export type Formato = "estatico" | "carrossel" | "reels";
export type StatusPauta =
  | "pauta"
  | "revisar_copy"
  | "copy_aprovada"
  | "aguardando_video"
  | "revisar_arte"
  | "agendado"
  | "publicando"
  | "publicado"
  | "erro"
  | "descartado";

export interface Pilar {
  nome: string;
  descricao: string;
}
export type Mix = Partial<Record<Formato, number>>;

/** Data de Brasília (UTC-3, sem horário de verão) no formato AAAA-MM-DD. */
export function hojeBR(agora: Date): string {
  return new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Momento (UTC) de um dia + horário de Brasília. */
export function momentoBR(dia: string, horario: string): Date {
  const [h, m] = horario.split(":").map(Number);
  return new Date(`${dia}T${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:00-03:00`);
}

/** Sequência de formatos de uma semana, espalhada para não repetir o mesmo formato em dias seguidos. */
export function sequenciaDaSemana(mix: Mix): Formato[] {
  const restante: Record<Formato, number> = { carrossel: mix.carrossel ?? 0, estatico: mix.estatico ?? 0, reels: mix.reels ?? 0 };
  const total = restante.carrossel + restante.estatico + restante.reels || 1;
  const seq: Formato[] = [];
  let anterior: Formato | null = null;
  for (let i = 0; i < Math.max(total, 1); i++) {
    const ordem = (Object.keys(restante) as Formato[])
      .filter((f) => restante[f] > 0)
      .sort((a, b) => restante[b] - restante[a] || (a === anterior ? 1 : 0) - (b === anterior ? 1 : 0));
    const escolha = ordem.find((f) => f !== anterior) ?? ordem[0] ?? "carrossel";
    seq.push(escolha);
    restante[escolha] = Math.max(0, restante[escolha] - 1);
    anterior = escolha;
  }
  return seq;
}

export interface Vaga {
  dia: string;
  horario: string;
  formato: Formato;
  pilar: string;
}

/**
 * Dias que ainda não têm pauta, de amanhã até `diasAFrente`, com formato, horário e pilar sugeridos.
 * O horário alterna pela data (dia par/ímpar), então não muda quando uma pauta é apagada.
 */
export function vagasDoCalendario(opts: {
  hoje: string;
  diasAFrente: number;
  ocupados: Set<string>;
  horarios: string[];
  mix: Mix;
  pilares: Pilar[];
}): Vaga[] {
  const seq = sequenciaDaSemana(opts.mix);
  const horarios = opts.horarios.length ? opts.horarios : ["12:00"];
  const pilares = opts.pilares.length ? opts.pilares : [{ nome: "Geral", descricao: "" }];
  const out: Vaga[] = [];
  for (let i = 1; i <= opts.diasAFrente; i++) {
    const dia = somarDias(opts.hoje, i);
    if (opts.ocupados.has(dia)) continue;
    const n = Math.round(new Date(`${dia}T12:00:00Z`).getTime() / 86_400_000);
    out.push({
      dia,
      horario: horarios[n % horarios.length],
      formato: seq[n % seq.length],
      pilar: pilares[n % pilares.length].nome,
    });
  }
  return out;
}

/**
 * Nota de uma referência: engajamento em relação ao tamanho da conta (comentário vale 3 curtidas,
 * view de Reels vale 0,02), com bônus para posts recentes. Conta grande não ganha só por ser grande.
 */
export function notaReferencia(r: { curtidas?: number | null; comentarios?: number | null; views?: number | null; seguidores?: number | null; publicadoEm?: string | null }, agora: Date): number {
  const interacoes = (r.curtidas ?? 0) + 3 * (r.comentarios ?? 0) + 0.02 * (r.views ?? 0);
  const base = Math.max(r.seguidores ?? 0, 1000);
  const taxa = (interacoes / base) * 100;
  const dias = r.publicadoEm ? (agora.getTime() - new Date(r.publicadoEm).getTime()) / 86_400_000 : 30;
  const frescor = dias <= 7 ? 1.3 : dias <= 30 ? 1 : 0.6;
  return Math.round(taxa * frescor * 100) / 100;
}

export function formatoDaMidia(m: { media_type?: string; media_product_type?: string }): Formato {
  if (m.media_product_type === "REELS" || m.media_type === "VIDEO") return "reels";
  if (m.media_type === "CAROUSEL_ALBUM") return "carrossel";
  return "estatico";
}

/** Próximo status quando o Kelvin aprova. */
export function aposAprovar(status: StatusPauta, formato: Formato): StatusPauta | null {
  if (status === "revisar_copy") return "copy_aprovada";
  if (status === "revisar_arte") return "agendado";
  return null;
}

/** Status depois do Redator: reels também passa pela aprovação da copy. */
export function aposDiretor(formato: Formato): StatusPauta {
  return formato === "reels" ? "aguardando_video" : "revisar_arte";
}

/** Normaliza a palavra do gatilho: uma palavra, maiúscula, sem acento e sem símbolo. */
export function normalizarPalavra(p: string | null | undefined): string | null {
  const t = (p ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 20);
  return t.length >= 2 ? t : null;
}

/** Legenda final: texto + CTA da palavra-chave (se houver) + hashtags, dentro do limite de 2.200 do Instagram. */
export function montarLegenda(legenda: string, palavra: string | null, hashtags: string[] = []): string {
  const limpa = legenda.replace(/[—–]/g, ",").trim();
  const cta = palavra && !limpa.toUpperCase().includes(palavra) ? `\n\nComenta ${palavra} que eu te mando no Direct.` : "";
  const tags = hashtags
    .map((h) => h.replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter(Boolean)
    .slice(0, 5)
    .map((h) => `#${h}`)
    .join(" ");
  return `${limpa}${cta}${tags ? `\n\n${tags}` : ""}`.slice(0, 2200);
}

/** Tira travessão e espaços duplos de qualquer texto que vai para a arte. */
export function limparTexto(t: string | null | undefined): string {
  return (t ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
}
