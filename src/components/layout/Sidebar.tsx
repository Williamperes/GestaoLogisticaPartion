"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CalendarDays,
  Package,
  Users,
  UserRound,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Settings,
  Menu,
  ScanLine,
  Wrench,
  Handshake,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "@/app/(auth)/actions";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/lib/auth/roles";

type NavRole = AppRole;

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles: readonly NavRole[];
}

interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

const ALL: readonly NavRole[] = ["super_admin", "admin", "operations", "warehouse", "finance"];
const NON_WAREHOUSE: readonly NavRole[] = ["super_admin", "admin", "operations", "finance"];
const ADMIN_OPS: readonly NavRole[] = ["super_admin", "admin", "operations"];
const ADMIN_ONLY: readonly NavRole[] = ["super_admin", "admin"];
const WAREHOUSE_ONLY: readonly NavRole[] = ["warehouse"];
const EVENTS_ROLES: readonly NavRole[] = ["super_admin", "admin", "operations", "finance", "employee"];
const MAINTENANCE_ROLES: readonly NavRole[] = ["super_admin", "admin", "operations", "warehouse", "employee"];

const navGroups: readonly NavGroup[] = [
  {
    label: "Operações",
    items: [
      { href: "/scan", icon: ScanLine, label: "Bipar OS", roles: WAREHOUSE_ONLY },
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: NON_WAREHOUSE },
      { href: "/events", icon: CalendarDays, label: "Eventos & OS", roles: EVENTS_ROLES },
      { href: "/inventory", icon: Package, label: "Inventário", roles: ADMIN_OPS },
      { href: "/maintenance", icon: Wrench, label: "Manutenção", roles: MAINTENANCE_ROLES },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: "/clients", icon: Users, label: "Clientes", roles: ADMIN_OPS },
      { href: "/team", icon: UserRound, label: "Equipe", roles: ADMIN_OPS },
      { href: "/subrentals", icon: Handshake, label: "Sublocações", roles: NON_WAREHOUSE },
    ],
  },
];

function filterGroups(role: AppRole | null): NavGroup[] {
  if (!role) return [];
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

function canSeeSettings(role: AppRole | null) {
  return role !== null && ADMIN_ONLY.includes(role);
}

function SidebarContent({
  userName,
  userRole,
  role,
  collapsed,
  onToggleCollapsed,
  onItemSelect,
  mobile = false,
}: {
  userName: string;
  userRole: string;
  role: AppRole | null;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onItemSelect?: () => void;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const visibleGroups = filterGroups(role);
  const showSettings = canSeeSettings(role);

  const containerClasses = mobile
    ? "relative flex h-full flex-col overflow-hidden bg-sidebar"
    : "relative flex h-dvh flex-col overflow-hidden border-r border-sidebar-border bg-sidebar";

  return (
    <motion.aside
      animate={mobile ? undefined : { width: collapsed ? 64 : 220 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={containerClasses}
    >
      <div className="flex h-14 items-center justify-center border-b border-sidebar-border px-3 shrink-0">
        <AnimatePresence>
          {collapsed ? (
            <motion.div
              key="small-logo"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.15 }}
            >
              <Image
                src="/small-logo.png"
                alt="Partion"
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
                priority
              />
            </motion.div>
          ) : (
            <motion.div
              key="logo"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="flex w-full items-center justify-center"
            >
              <Image
                src="/logo.png"
                alt="Partion"
                width={140}
                height={36}
                className="h-8 w-auto object-contain"
                priority
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Tooltip>
                      <TooltipTrigger
                        render={(props) => (
                          <Link href={item.href} onClick={onItemSelect} {...(props as React.ComponentPropsWithoutRef<"a">)} />
                        )}
                        className={cn(
                          "flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                          active
                            ? "bg-amber-500/10 text-amber-600"
                            : "text-sidebar-foreground/70 hover:bg-black/5 hover:text-sidebar-foreground"
                        )}
                      >
                        <item.icon
                          className={cn("w-4.5 h-4.5 shrink-0", active ? "text-amber-600" : "")}
                        />
                        <AnimatePresence>
                          {!collapsed && (
                            <motion.span
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.1 }}
                              className="truncate flex-1"
                            >
                              {item.label}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </TooltipTrigger>
                      {!mobile && collapsed && (
                        <TooltipContent side="right" className="text-xs">
                          {item.label}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-2 pb-4 space-y-0.5">
        {showSettings && (
          <Tooltip>
            <TooltipTrigger
              render={(props) => (
                <Link
                  href="/settings"
                  onClick={onItemSelect}
                  {...(props as React.ComponentPropsWithoutRef<"a">)}
                />
              )}
              className={cn(
                "flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-all",
                pathname === "/settings" || pathname.startsWith("/settings/")
                  ? "bg-amber-500/10 text-amber-600"
                  : "text-sidebar-foreground/60 hover:bg-black/5 hover:text-sidebar-foreground"
              )}
            >
              <Settings
                className={cn(
                  "w-4.5 h-4.5 shrink-0",
                  (pathname === "/settings" || pathname.startsWith("/settings/")) && "text-amber-600"
                )}
              />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    Configurações
                  </motion.span>
                )}
              </AnimatePresence>
            </TooltipTrigger>
            {!mobile && collapsed && <TooltipContent side="right">Configurações</TooltipContent>}
          </Tooltip>
        )}

        <form action={signOut} className="mt-2">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-black/5 transition-all"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-amber-500 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-black">
                {userName
                  .split(" ")
                  .map((part) => part[0] ?? "")
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-w-0"
                >
                  <p className="text-xs font-medium text-foreground truncate">{userName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{userRole}</p>
                </motion.div>
              )}
            </AnimatePresence>
            {!collapsed && <LogOut className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          </button>
        </form>
      </div>

      {!mobile && onToggleCollapsed && (
        <button
          onClick={onToggleCollapsed}
          className="absolute right-[-12px] top-14 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-muted"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
      )}
    </motion.aside>
  );
}

export function Sidebar({
  userName,
  userRole,
  role,
}: {
  userName: string;
  userRole: string;
  role: AppRole | null;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="hidden md:block">
        <SidebarContent
          userName={userName}
          userRole={userRole}
          role={role}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((current) => !current)}
      />
    </div>
  );
}

export function MobileSidebar({
  userName,
  userRole,
  role,
}: {
  userName: string;
  userRole: string;
  role: AppRole | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Abrir menu" />
        }
      >
        <Menu className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] max-w-xs p-0">
        <SheetTitle className="sr-only">Menu principal</SheetTitle>
        <SidebarContent
          userName={userName}
          userRole={userRole}
          role={role}
          collapsed={false}
          mobile
          onItemSelect={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
