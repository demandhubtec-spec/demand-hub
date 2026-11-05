import type { ProjetoFase } from "@/lib/types";

/** Fases pelas quais toda entrega passa, na ordem. */
export const FASES: { value: ProjetoFase; label: string }[] = [
  { value: "implementacao", label: "Implementação" },
  { value: "teste", label: "Teste" },
  { value: "correcao", label: "Correção" },
  { value: "aprovacao", label: "Aprovação" },
  { value: "concluido", label: "Concluído" },
];

export const faseLabel: Record<string, string> = Object.fromEntries(FASES.map((f) => [f.value, f.label]));

/** Posição da fase (0 a 4). -1 = ainda não começou. */
export function faseIndice(fase: string | null | undefined) {
  return fase ? FASES.findIndex((f) => f.value === fase) : -1;
}

/** Progresso aproximado da entrega pela fase em que ela está. */
export function faseProgresso(fase: string | null | undefined) {
  const map: Record<string, number> = { implementacao: 20, teste: 50, correcao: 65, aprovacao: 85, concluido: 100 };
  return fase ? map[fase] ?? 0 : 0;
}

/** Status do projeto que acompanha a fase escolhida. */
export function statusDaFase(fase: ProjetoFase | null, statusAtual: string) {
  if (fase === "concluido") return "concluido";
  if (fase) return statusAtual === "atrasado" ? "atrasado" : "andamento";
  return statusAtual === "concluido" ? "andamento" : statusAtual;
}
