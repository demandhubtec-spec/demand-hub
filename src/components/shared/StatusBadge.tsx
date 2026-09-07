import { cn } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  prospeccao: "Prospecção",
  andamento: "Em andamento",
  "a-fazer": "A fazer",
  atrasado: "Atrasado",
  concluido: "Concluído",
  entrada: "Entrada",
  saida: "Saída",
  pendente: "Pendente assinatura",
};

const dotColor: Record<string, string> = {
  ativo: "bg-positive",
  andamento: "bg-positive",
  entrada: "bg-positive",
  pausado: "bg-muted",
  prospeccao: "bg-muted",
  "a-fazer": "bg-muted",
  pendente: "bg-muted",
  atrasado: "bg-negative",
  saida: "bg-negative",
  concluido: "bg-primary-bright",
};

const textColor: Record<string, string> = {
  ativo: "text-positive",
  andamento: "text-positive",
  entrada: "text-positive",
  pausado: "text-muted",
  prospeccao: "text-muted",
  "a-fazer": "text-muted",
  pendente: "text-muted",
  atrasado: "text-negative",
  saida: "text-negative",
  concluido: "text-primary-bright",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center text-xs font-medium", textColor[status])}>
      <span className={cn("mr-[7px] inline-block h-[7px] w-[7px] rounded-full", dotColor[status])} />
      {statusLabels[status] ?? status}
    </span>
  );
}
