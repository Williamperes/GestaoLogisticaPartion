"use client";

import { Search, Bell, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { MobileSidebar } from "@/components/layout/Sidebar";

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/events": "Eventos & OS",
  "/inventory": "Inventário",
  "/clients": "Clientes",
  "/team": "Equipe",
  "/checkout": "Checkout",
  "/checkin": "Check-in",
};

export function TopBar({
  userName,
  userRole,
}: {
  userName: string;
  userRole: string;
}) {
  const pathname = usePathname();

  // build breadcrumb: ["Dashboard"] or ["Eventos & OS", "Festival Aurora 2025"]
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; active: boolean }[] = [];

  if (parts.length === 1) {
    crumbs.push({ label: routeLabels["/" + parts[0]] ?? parts[0], active: true });
  } else {
    crumbs.push({ label: routeLabels["/" + parts[0]] ?? parts[0], active: false });
    crumbs.push({ label: "Detalhe", active: true });
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/60 px-3 backdrop-blur-sm sm:gap-4 sm:px-6">
      <MobileSidebar userName={userName} userRole={userRole} />

      <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            <span
              className={
                `${crumb.active ? "font-medium text-foreground" : "text-muted-foreground"} truncate`
              }
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      <div className="hidden items-center gap-2 rounded-lg border border-border bg-black/5 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-black/8 md:flex md:w-44 lg:w-52">
        <Search className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 truncate">Buscar...</span>
        <kbd className="text-[10px] border border-border rounded px-1 py-0.5 font-mono">⌘K</kbd>
      </div>

      <button className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5">
        <Bell className="w-4 h-4 text-foreground/70" />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
      </button>
    </header>
  );
}
