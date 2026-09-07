import * as React from "react";
import { Menu, Search, Sun, Moon, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopbarProps {
  title: string;
  onOpenMobile: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

const notifications = [
  { color: "var(--negative)", title: "Atividade atrasada", sub: "Corrigir bug no formulário — Tonabê" },
  { color: "var(--primary-bright)", title: "Nova atividade atribuída", sub: "Enviar contrato — Dos Cria Tabacaria" },
  { color: "var(--primary-bright)", title: "Novo comentário", sub: 'Fabrício comentou em "Landing page de captação"' },
];

export function Topbar({ title, onOpenMobile, theme, onToggleTheme }: TopbarProps) {
  const [notifOpen, setNotifOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const bellRef = React.useRef<HTMLButtonElement>(null);
  const dateLabel = React.useMemo(
    () =>
      new Date()
        .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
        .toUpperCase(),
    [],
  );

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !bellRef.current?.contains(e.target as Node)
      ) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3.5 border-b border-border bg-surface px-[26px] py-[15px] max-md:px-4 max-md:py-3.5">
      <button
        className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-ink hover:bg-surface-2 md:hidden"
        onClick={onOpenMobile}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div>
        <div className="text-[18.5px] font-semibold">{title}</div>
        <div className="mt-px font-mono text-xs text-muted">{dateLabel}</div>
      </div>
      <div className="flex-1" />
      <div className="hidden w-[230px] items-center gap-2 rounded-[7px] border border-border bg-surface-2 px-3 py-2 text-muted md:flex">
        <Search className="h-[15px] w-[15px] shrink-0" />
        <input
          type="text"
          placeholder="Buscar clientes, projetos..."
          className="w-full border-none bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
        />
      </div>
      <button
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-muted hover:border-border hover:bg-surface-2 hover:text-ink"
        onClick={onToggleTheme}
        aria-label="Alternar tema"
      >
        {theme === "dark" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
      </button>
      <div className="relative">
        <button
          ref={bellRef}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-muted hover:border-border hover:bg-surface-2 hover:text-ink"
          onClick={() => setNotifOpen((v) => !v)}
          aria-label="Notificações"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-[5px] top-1 flex h-[15px] w-[15px] animate-pulseGlow items-center justify-center rounded-full bg-negative text-[9px] font-bold text-white">
            {notifications.length}
          </span>
        </button>
        {notifOpen && (
          <div
            ref={panelRef}
            className="absolute right-0 top-11 z-50 flex w-[290px] flex-col overflow-hidden rounded-[10px] border border-border bg-surface shadow-2xl"
          >
            <div className="border-b border-border px-4 py-[13px] text-[12.5px] font-bold">Notificações</div>
            {notifications.map((n, i) => (
              <div key={i} className="flex gap-2.5 border-b border-border px-4 py-3 last:border-b-0">
                <span
                  className={cn("mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full")}
                  style={{ background: n.color }}
                />
                <div>
                  <div className="text-[12.5px] font-semibold">{n.title}</div>
                  <div className="mt-0.5 text-[11.5px] text-muted">{n.sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
