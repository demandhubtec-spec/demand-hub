import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  Code2,
  Megaphone,
  Target,
  Briefcase,
  Settings,
  ChevronDown,
  ChevronLeft,
  HelpCircle,
  GitBranch,
  LifeBuoy,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { LogoMark } from "./Logo";
import { navGroups } from "./nav-config";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

const groupIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  tecnologia: Code2,
  marketing: Megaphone,
  comercial: Target,
  administrativo: Briefcase,
  config: Settings,
};

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  const location = useLocation();
  const { perfil, isColaborador, signOut } = useAuth();
  const { showToast } = useToast();
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navGroups.forEach((g) => {
      initial[g.key] = g.children.some((c) => location.pathname.startsWith(c.path));
    });
    return initial;
  });
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const [spinning, setSpinning] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function toggleGroup(key: string) {
    if (collapsed) {
      onToggleCollapse();
      setOpenGroups((prev) => ({ ...prev, [key]: true }));
      return;
    }
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const userName = perfil?.nome ?? "Kelvin";
  const userRole = isColaborador ? "Colaborador" : "Dono";
  const initial = userName.charAt(0).toUpperCase();

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-[35] bg-[rgba(5,5,8,.6)] md:hidden" onClick={onCloseMobile} />
      )}
      <aside
        className={cn(
          "fixed bottom-0 left-0 top-0 z-40 flex flex-col overflow-x-hidden border-r border-sidebar-border bg-sidebar-bg text-sidebar-text transition-[width,transform] duration-250 ease-in-out",
          collapsed ? "w-[76px]" : "w-[258px]",
          "max-md:w-[258px]",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        )}
      >
        <div className="group flex items-center gap-[11px] px-5 py-[22px]">
          <LogoMark />
          {!collapsed && (
            <div className="whitespace-nowrap font-display text-[17px] font-bold text-white transition-shadow group-hover:[text-shadow:0_0_16px_rgba(178,111,214,.8)]">
              Demand Hub
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-1.5 pt-2.5">
          <NavLink
            to="/"
            end
            onClick={onCloseMobile}
            className={({ isActive }) =>
              cn(
                "nav-sweep flex items-center gap-3 rounded-[7px] px-3 py-2.5 text-[13.5px] font-medium",
                collapsed && "justify-center",
                isActive
                  ? "bg-primary text-white shadow-[0_0_18px_rgba(178,111,214,.4)]"
                  : "hover:bg-white/[.06] hover:text-white",
              )
            }
          >
            <LayoutGrid className="h-[17px] w-[17px] shrink-0" />
            {!collapsed && <span>Dashboard geral</span>}
          </NavLink>

          {navGroups
            .filter((g) => !isColaborador || g.colaboradorPode)
            .map((group) => {
              const Icon = groupIcons[group.icon];
              const visibleChildren = group.children.filter((c) => !isColaborador || c.colaboradorPode);
              const isOpen = collapsed ? false : openGroups[group.key];
              return (
                <div key={group.key}>
                  <button
                    className={cn(
                      "nav-sweep flex w-full items-center gap-3 rounded-[7px] px-3 py-2.5 text-left text-[13.5px] font-medium hover:bg-white/[.06] hover:text-white",
                      collapsed && "justify-center",
                    )}
                    onClick={() => toggleGroup(group.key)}
                  >
                    <Icon className="h-[17px] w-[17px] shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1">{group.label}</span>
                        <ChevronDown
                          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-180")}
                        />
                      </>
                    )}
                  </button>
                  {!collapsed && (
                    <div
                      className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                      style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                    >
                      <div className="my-0.5 flex flex-col gap-px overflow-hidden pl-3.5">
                        {visibleChildren.map((child) => (
                          <NavLink
                            key={child.path}
                            to={child.path}
                            onClick={onCloseMobile}
                            className={({ isActive }) =>
                              cn(
                                "nav-sweep flex items-center gap-2 rounded-[7px] border-l py-2 pl-5 pr-3 text-[12.5px] font-medium",
                                isActive
                                  ? "border-l-primary-bright font-semibold text-primary-bright"
                                  : "border-l-sidebar-border text-[#9C97A6] hover:bg-white/5 hover:text-white",
                              )
                            }
                          >
                            {child.label}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          {!isColaborador && (
            <>
              <div className={cn("px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-wider text-[#5F5A6B]", collapsed && "hidden")}>
                Ajuda
              </div>
              <NavLink
                to="/faq"
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  cn(
                    "nav-sweep flex items-center gap-3 rounded-[7px] px-3 py-2.5 text-[13.5px] font-medium",
                    collapsed && "justify-center",
                    isActive ? "bg-primary text-white" : "hover:bg-white/[.06] hover:text-white",
                  )
                }
              >
                <HelpCircle className="h-[17px] w-[17px] shrink-0" />
                {!collapsed && <span>FAQ</span>}
              </NavLink>
              <NavLink
                to="/processos"
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  cn(
                    "nav-sweep flex items-center gap-3 rounded-[7px] px-3 py-2.5 text-[13.5px] font-medium",
                    collapsed && "justify-center",
                    isActive ? "bg-primary text-white" : "hover:bg-white/[.06] hover:text-white",
                  )
                }
              >
                <GitBranch className="h-[17px] w-[17px] shrink-0" />
                {!collapsed && <span>Processos Demand Hub</span>}
              </NavLink>
              <NavLink
                to="/ajuda"
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  cn(
                    "nav-sweep flex items-center gap-3 rounded-[7px] px-3 py-2.5 text-[13.5px] font-medium",
                    collapsed && "justify-center",
                    isActive ? "bg-primary text-white" : "hover:bg-white/[.06] hover:text-white",
                  )
                }
              >
                <LifeBuoy className="h-[17px] w-[17px] shrink-0" />
                {!collapsed && <span>Central de ajuda</span>}
              </NavLink>
            </>
          )}
        </nav>

        <div className="relative border-t border-sidebar-border p-3.5">
          {popoverOpen && (
            <div
              ref={popoverRef}
              className="absolute bottom-16 left-4 right-4 flex flex-col gap-0.5 rounded-[9px] border border-sidebar-border bg-sidebar-bg2 p-2 shadow-2xl"
            >
              <button
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-[12.5px] font-medium text-[#D8D4E0] hover:bg-white/[.07] hover:text-white"
                onClick={() => {
                  setSpinning(true);
                  showToast("Sistema atualizado");
                  setPopoverOpen(false);
                  setTimeout(() => setSpinning(false), 650);
                }}
              >
                <RefreshCw className={cn("h-[15px] w-[15px]", spinning && "animate-spin")} />
                Atualizar sistema
              </button>
              <NavLink
                to="/configuracoes/acessos"
                onClick={() => setPopoverOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-[12.5px] font-medium text-[#D8D4E0] hover:bg-white/[.07] hover:text-white"
              >
                <Settings className="h-[15px] w-[15px]" />
                Configurações
              </NavLink>
              <button
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-[12.5px] font-medium text-[#D8D4E0] hover:bg-white/[.07] hover:text-[#FF8A8C]"
                onClick={() => {
                  setPopoverOpen(false);
                  signOut();
                }}
              >
                <LogOut className="h-[15px] w-[15px]" />
                Sair
              </button>
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <button
              className="hidden h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-[#847E90] hover:bg-white/[.07] hover:text-white md:flex"
              onClick={onToggleCollapse}
              aria-label="Recolher menu"
            >
              <ChevronLeft className={cn("h-[15px] w-[15px] transition-transform", collapsed && "rotate-180")} />
            </button>
            <button
              ref={triggerRef}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 hover:bg-white/[.06]"
              onClick={() => setPopoverOpen((v) => !v)}
            >
              <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary-tint font-display text-[12.5px] font-bold text-primary-bright">
                {initial}
              </div>
              {!collapsed && (
                <div className="min-w-0 text-left leading-tight">
                  <div className="truncate text-[12.5px] font-semibold text-white">{userName}</div>
                  <div className="whitespace-nowrap text-[11px] text-[#8B8794]">{userRole}</div>
                </div>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
