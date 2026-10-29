import { cn } from "@/lib/utils";

export const waLabels: Record<string, string> = {
  pendente: "Na fila",
  enviado: "Enviado",
  erro: "Erro",
  respondeu: "Respondeu",
  optout: "Opt-out",
  sem_whatsapp: "Sem WhatsApp",
  sem_email: "Sem e-mail",
  ignorado: "Pausado",
};

export const comercialLabels: Record<string, string> = {
  novo: "Novo",
  contatado: "Contatado",
  respondeu: "Respondeu",
  reuniao: "Reunião",
  proposta: "Proposta",
  ganho: "Ganho",
  perdido: "Perdido",
  descartado: "Descartado",
};

export const FUNIL: { key: string; label: string }[] = [
  { key: "novo", label: "Novo" },
  { key: "contatado", label: "Contatado" },
  { key: "respondeu", label: "Respondeu" },
  { key: "reuniao", label: "Reunião" },
  { key: "proposta", label: "Proposta" },
  { key: "ganho", label: "Ganho" },
];

const tone: Record<string, string> = {
  pendente: "text-primary-bright bg-primary-tint",
  enviado: "text-ink bg-surface-2",
  respondeu: "text-positive bg-positive-tint",
  ganho: "text-positive bg-positive-tint",
  reuniao: "text-positive bg-positive-tint",
  proposta: "text-primary-bright bg-primary-tint",
  contatado: "text-ink bg-surface-2",
  novo: "text-muted bg-surface-2",
  erro: "text-negative bg-negative-tint",
  optout: "text-negative bg-negative-tint",
  perdido: "text-negative bg-negative-tint",
  descartado: "text-muted bg-surface-2",
  sem_whatsapp: "text-attention bg-attention-tint",
  sem_email: "text-muted bg-surface-2",
  ignorado: "text-muted bg-surface-2",
};

export function Pill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-semibold", tone[status] ?? "bg-surface-2 text-muted")}>
      {label ?? waLabels[status] ?? comercialLabels[status] ?? status}
    </span>
  );
}

export function fmtData(iso: string | null | undefined, comHora = true) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    ...(comHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function fmtTelefone(n: string | null | undefined) {
  const d = (n ?? "").replace(/\D/g, "");
  if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  return n ?? "-";
}

export function linkExterno(url: string | null | undefined) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^@/, "instagram.com/")}`;
}

export const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function janelaTexto(days: number[] = [], start = 9, end = 17) {
  const ord = [...days].sort();
  const seq = ord.length > 1 && ord.every((d, i) => i === 0 || d === ord[i - 1] + 1);
  const dias = seq ? `${DIAS[ord[0]]} a ${DIAS[ord[ord.length - 1]]}` : ord.map((d) => DIAS[d]).join(", ");
  return `${dias} · das ${start}h às ${end}h59`;
}
