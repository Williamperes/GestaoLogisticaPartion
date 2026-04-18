"use client";

import { Search, Bell, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/events": "Eventos & OS",
  "/inventory": "Inventário",
  "/clients": "Clientes",
  "/team": "Equipe",
  "/checkout": "Checkout",
  "/checkin": "Check-in",
};

export function TopBar() {
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
    <header className="h-14 border-b border-border flex items-center gap-4 px-6 bg-background/60 backdrop-blur-sm shrink-0">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm flex-1 min-w-0">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            <span
              className={
                crumb.active ? "text-foreground font-medium" : "text-muted-foreground"
              }
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/5 border border-border text-sm text-muted-foreground cursor-pointer hover:bg-black/8 transition-colors w-52">
        <Search className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 truncate">Buscar...</span>
        <kbd className="text-[10px] border border-border rounded px-1 py-0.5 font-mono">⌘K</kbd>
      </div>

      {/* Bell */}
      <button className="relative w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors">
        <Bell className="w-4 h-4 text-foreground/70" />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
      </button>
    </header>
  );
}
