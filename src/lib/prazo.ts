/** Data de hoje no formato AAAA-MM-DD (fuso do navegador). */
export function hojeISO() {
  return new Date().toLocaleDateString("en-CA");
}

/** Atividade ou entrega com prazo vencido e ainda não concluída. */
export function estaAtrasada(prazo: string | null | undefined, status: string | null | undefined) {
  if (status === "concluido") return false;
  if (status === "atrasado") return true;
  return !!prazo && prazo.slice(0, 10) < hojeISO();
}

/** Dia e mês (ex.: 19/11). */
export function diaMes(iso: string | null | undefined) {
  if (!iso) return "sem prazo";
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
