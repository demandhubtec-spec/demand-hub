import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  Folder,
  Code2,
  Megaphone,
  Target,
  Briefcase,
  Settings,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  HelpCircle,
  GitBranch,
  LifeBuoy,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { BrandLogo, BrandMark } from "./Logo";
import { Sparkle } from "@/components/brand/HoloSymbol";

/** A estrela aparece só onde há IA (regra do manual de marca). */
const IA_PATHS = new Set(["/comercial/sdr", "/comercial/prospeccao"]);
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

/** Item principal do menu: fundo roxo suave + barra lateral quando ativo (padrão Tonabê OS). */
function topItemClass(isActive: boolean, collapsed: boolean) {
  return cn(
    "nav-sweep relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-colors",
    collapsed && "justify-center",
    isActive
      ? "bg-[rgba(110,58,255,.16)] text-white shadow-[inset_0_0_0_1px_rgba(164,123,255,.22)] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-[#A47BFF]"
      : "hover:bg-white/[.05] hover:text-white",
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="mx-auto my-2.5 h-px w-6 bg-sidebar-border" />;
  return (
    <div className="eyebrow px-3 pb-1.5 pt-4 text-[10px] text-[#6E61A0]">{children}</div>
  );
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

  function renderGroup(group: (typeof navGroups)[number]) {
              const Icon = groupIcons[group.icon];
              const visibleChildren = group.children.filter((c) => !isColaborador || c.colaboradorPode);
              const isOpen = collapsed ? false : openGroups[group.key];
              return (
                <div key={group.key}>
                  <button
                    className={cn(
                      "nav-sweep flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors hover:bg-white/[.05] hover:text-white",
                      collapsed && "justify-center",
                      group.children.some((c) => location.pathname.startsWith(c.path)) && "text-white",
                    )}
                    onClick={() => toggleGroup(group.key)}
                    title={collapsed ? group.label : undefined}
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
                                "nav-sweep flex items-center gap-2 rounded-r-[8px] border-l-2 py-2 pl-5 pr-3 text-[12.5px] font-medium transition-colors",
                                isActive
                                  ? "border-l-[#A47BFF] bg-[rgba(110,58,255,.12)] font-semibold text-white"
                                  : "border-l-sidebar-border text-[#9A8DCC] hover:bg-white/[.04] hover:text-white",
                              )
                            }
                          >
                            <span className="flex-1">{child.label}</span>
                            {IA_PATHS.has(child.path) && (
                              <Sparkle size={9} className="shrink-0 text-[#A47BFF]" />
                            )}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-[35] bg-[rgba(5,5,8,.6)] md:hidden" onClick={onCloseMobile} />
      )}
      <aside
        className={cn(
          "fixed bottom-0 left-0 top-0 z-40 flex flex-col overflow-x-hidden border-r border-sidebar-border bg-sidebar-bg text-sidebar-text transition-[width,transform] duration-250 ease-in-out",
          collapsed ? "w-[64px]" : "w-[258px]",
          "max-md:w-[258px]",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        )}
      >
        <div className={cn("group flex items-center py-[18px]", collapsed ? "flex-col gap-3 px-2" : "justify-between gap-2 px-4")}>
          <NavLink to="/" onClick={onCloseMobile} className="flex min-w-0 items-center" title="Início">
            {collapsed ? <BrandMark size={32} /> : <BrandLogo height={30} />}
          </NavLink>
          <button
            className="hidden h-[28px] w-[28px] shrink-0 items-center justify-center rounded-md text-[#847E90] hover:bg-white/[.07] hover:text-white md:flex"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Abrir menu" : "Recolher menu"}
            title={collapsed ? "Abrir menu" : "Recolher menu"}
          >
            {collapsed ? <PanelLeftOpen className="h-[17px] w-[17px]" /> : <PanelLeftClose className="h-[17px] w-[17px]" />}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-1.5 pt-2.5 [&>*]:shrink-0">
          <SectionLabel collapsed={collapsed}>Meu dia</SectionLabel>
          <NavLink
            to="/"
            end
            onClick={onCloseMobile}
            title={collapsed ? "Resumo" : undefined}
            className={({ isActive }) => topItemClass(isActive, collapsed)}
          >
            <LayoutGrid className="h-[17px] w-[17px] shrink-0" aria-label="Resumo" />
            {!collapsed && <span>Resumo</span>}
          </NavLink>

          <NavLink
            to="/projetos"
            onClick={onCloseMobile}
            title={collapsed ? "Projetos" : undefined}
            className={({ isActive }) => topItemClass(isActive, collapsed)}
          >
            <Folder className="h-[17px] w-[17px] shrink-0" />
            {!collapsed && <span>Projetos</span>}
          </NavLink>

          <SectionLabel collapsed={collapsed}>Departamentos</SectionLabel>
          {navGroups
            .filter((g) => ["tecnologia", "marketing", "comercial"].includes(g.key))
            .filter((g) => !isColaborador || g.colaboradorPode)
            .map(renderGroup)}

          <SectionLabel collapsed={collapsed}>Ajuda</SectionLabel>
          <NavLink
            to="/faq"
            onClick={onCloseMobile}
            className={({ isActive }) => topItemClass(isActive, collapsed)}
          >
            <HelpCircle className="h-[17px] w-[17px] shrink-0" />
            {!collapsed && <span>FAQ</span>}
          </NavLink>
          <NavLink
            to="/processos"
            onClick={onCloseMobile}
            className={({ isActive }) => topItemClass(isActive, collapsed)}
          >
            <GitBranch className="h-[17px] w-[17px] shrink-0" />
            {!collapsed && <span>Processos DemandIA</span>}
          </NavLink>
          <NavLink
            to="/ajuda"
            onClick={onCloseMobile}
            className={({ isActive }) => topItemClass(isActive, collapsed)}
          >
            <LifeBuoy className="h-[17px] w-[17px] shrink-0" />
            {!collapsed && <span>Central de ajuda</span>}
          </NavLink>

          {!isColaborador && (
            <>
              <SectionLabel collapsed={collapsed}>Administração</SectionLabel>
              {navGroups
                .filter((g) => ["administrativo", "config"].includes(g.key))
                .map(renderGroup)}
            </>
          )}
        </nav>

        <div className="relative border-t border-sidebar-border p-3.5">
          {popoverOpen && (
            <div
              ref={popoverRef}
              className="absolute bottom-[68px] left-4 right-4 flex flex-col gap-0.5 rounded-[9px] border border-sidebar-border bg-sidebar-bg2 p-2 shadow-2xl"
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
          {!collapsed && (
            <div className="mb-2.5 px-1 font-mono text-[10px] leading-relaxed text-[#6E61A0]">
              DemandIA · Portal
              <br />
              Todos os direitos reservados
            </div>
          )}
          <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
            <button
              ref={triggerRef}
              className={cn("flex min-w-0 items-center gap-2.5 rounded-lg p-1 hover:bg-white/[.06]", !collapsed && "flex-1")}
              title={collapsed ? userName : undefined}
              onClick={() => setPopoverOpen((v) => !v)}
            >
              <div className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-[#6E3AFF] font-display text-[13px] font-extrabold text-white shadow-[0_0_0_2px_rgba(164,123,255,.25)]">
                {initial}
              </div>
              {!collapsed && (
                <div className="min-w-0 text-left leading-tight">
                  <div className="truncate text-[12.5px] font-semibold text-white">{userName}</div>
                  <div className="whitespace-nowrap text-[11px] text-[#8E7FC4]">{userRole}</div>
                </div>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
