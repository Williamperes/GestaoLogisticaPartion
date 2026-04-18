"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  UserRound,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  Settings,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "@/app/(auth)/actions";

const navGroups = [
  {
    label: "Operações",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/events", icon: CalendarDays, label: "Eventos & OS", badge: 3 },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: "/clients", icon: Users, label: "Clientes" },
      { href: "/team", icon: UserRound, label: "Equipe" },
    ],
  },
];

export function Sidebar({
  userName,
  userRole,
}: {
  userName: string;
  userRole: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative flex flex-col h-screen bg-sidebar border-r border-sidebar-border z-30 shrink-0 overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-sidebar-border shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500 shrink-0">
          <Zap className="w-4 h-4 text-black" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="font-bold text-sm tracking-widest text-foreground uppercase"
            >
              Partion
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {navGroups.map((group) => (
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
                        nativeButton={false}
                        render={(props) => {
                          const { nativeButton, ...linkProps } = props as React.ComponentPropsWithoutRef<"a"> & {
                            nativeButton?: boolean;
                          };
                          void nativeButton;

                          return <Link href={item.href} {...linkProps} />;
                        }}
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
                        {!collapsed && item.badge && (
                          <Badge className="ml-auto h-4 min-w-[18px] text-[10px] px-1 bg-amber-500/20 text-amber-600 border-0 font-semibold">
                            {item.badge}
                          </Badge>
                        )}
                      </TooltipTrigger>
                      {collapsed && (
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

      {/* Bottom actions */}
      <div className="px-2 pb-4 space-y-0.5">
        <Tooltip>
          <TooltipTrigger
            nativeButton={false}
            render={(props) => {
              const { nativeButton, ...linkProps } = props as React.ComponentPropsWithoutRef<"a"> & {
                nativeButton?: boolean;
              };
              void nativeButton;

              return <Link href="#" {...linkProps} />;
            }}
            className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-black/5 hover:text-sidebar-foreground transition-all"
          >
            <Bell className="w-4.5 h-4.5 shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  Notificações
                </motion.span>
              )}
            </AnimatePresence>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">Notificações</TooltipContent>}
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            nativeButton={false}
            render={(props) => {
              const { nativeButton, ...linkProps } = props as React.ComponentPropsWithoutRef<"a"> & {
                nativeButton?: boolean;
              };
              void nativeButton;

              return <Link href="#" {...linkProps} />;
            }}
            className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-black/5 hover:text-sidebar-foreground transition-all"
          >
            <Settings className="w-4.5 h-4.5 shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  Configurações
                </motion.span>
              )}
            </AnimatePresence>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">Configurações</TooltipContent>}
        </Tooltip>

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

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute right-[-12px] top-14 w-6 h-6 rounded-full border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors z-40"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronLeft className="w-3 h-3 text-muted-foreground" />
        )}
      </button>
    </motion.aside>
  );
}
