import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { cn } from "@/lib/utils";
import { navGroups } from "./nav-config";
import { useClientes } from "@/hooks/useClientes";

function buildTitleMap(): Record<string, string> {
  const map: Record<string, string> = {
    "/": "Dashboard geral",
    "/faq": "FAQ",
    "/processos": "Processos Demand Hub",
    "/ajuda": "Central de ajuda",
    "/projetos": "Projetos",
  };
  navGroups.forEach((group) => {
    group.children.forEach((child) => {
      map[child.path] = `${group.label} — ${child.label}`;
    });
  });
  return map;
}

const titleMap = buildTitleMap();

export function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [theme, setTheme] = React.useState<"dark" | "light">(() => {
    if (typeof document !== "undefined") {
      return (document.body.getAttribute("data-theme") as "dark" | "light") ?? "dark";
    }
    return "dark";
  });

  React.useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  const { data: clientes = [] } = useClientes();
  const fichaMatch = location.pathname.match(/^\/projetos\/([^/]+)/);
  const clienteFicha = fichaMatch ? clientes.find((c) => c.id === fichaMatch[1]) : undefined;
  const title = clienteFicha ? `${clienteFicha.nome} — Projetos` : (titleMap[location.pathname] ?? "Demand Hub");

  return (
    <div className="flex min-h-screen">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[margin-left] duration-250 ease-in-out",
          collapsed ? "md:ml-[76px]" : "md:ml-[258px]",
        )}
      >
        <Topbar
          title={title}
          onOpenMobile={() => setMobileOpen(true)}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        />
        <main className="max-w-[1180px] px-[26px] pb-[60px] pt-6 max-md:px-4 max-md:pb-[50px] max-md:pt-[18px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
