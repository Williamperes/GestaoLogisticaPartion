"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { MobileSidebar } from "@/components/layout/Sidebar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { AppRole } from "@/lib/auth/roles";

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/events": "Eventos & OS",
  "/inventory": "Inventário",
  "/clients": "Clientes",
  "/team": "Equipe",
};

export function TopBar({
  userName,
  userRole,
  role,
}: {
  userName: string;
  userRole: string;
  role: AppRole | null;
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
      <MobileSidebar userName={userName} userRole={userRole} role={role} />

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

      {(role === "admin" || role === "super_admin") && <ThemeToggle />}
    </header>
  );
}
