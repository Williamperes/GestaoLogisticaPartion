import {
  CalendarDays,
  Package,
  TrendingUp,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/auth/session";
import { getDashboardKPIs, getCategoryStats } from "@/lib/dashboard";
import { listEvents } from "@/lib/events";
import { formatDateBR } from "@/lib/dates";
import { CardSpotlight } from "@/components/ui/aceternity/card-spotlight";
import { StatusBadge } from "@/components/ui/StatusBadge";

import { DashboardCharts } from "@/app/(dashboard)/dashboard/DashboardCharts";

export default async function DashboardPage() {
  const context = await getCurrentUserContext();
  if (context?.role === "warehouse") redirect("/scan");
  const organizationId = context?.primaryOrganization?.id;

  const [kpis, categoryStats, upcomingEvents] = organizationId
    ? await Promise.all([
        getDashboardKPIs(organizationId),
        getCategoryStats(organizationId),
        listEvents(organizationId),
      ])
    : [
        { eventsThisMonth: 0, eventsNextMonth: 0, itemsInMaintenance: 0, utilizationRate: 0, pendingReturns: 0 },
        [],
        [],
      ];

  const recentEvents = upcomingEvents.slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Visão Geral</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} • Atualizado agora
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {kpis.itemsInMaintenance > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 text-sm font-medium border border-amber-500/20">
              <AlertTriangle className="w-4 h-4" />
              {kpis.itemsInMaintenance} em manutenção
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardSpotlight>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Eventos este mês</p>
              <p className="text-3xl font-bold text-foreground mt-2">{kpis.eventsThisMonth}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpis.eventsNextMonth} agendados</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <CalendarDays className="w-4.5 h-4.5 text-amber-600" />
            </div>
          </div>
        </CardSpotlight>

        <CardSpotlight>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Em Manutenção</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{kpis.itemsInMaintenance}</p>
              <p className="text-xs text-muted-foreground mt-1">itens bloqueados</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Wrench className="w-4.5 h-4.5 text-red-600" />
            </div>
          </div>
        </CardSpotlight>

        <CardSpotlight>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Utilização</p>
              <p className="text-3xl font-bold text-foreground mt-2">{kpis.utilizationRate}%</p>
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> equipamentos em campo
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-emerald-600" />
            </div>
          </div>
        </CardSpotlight>

        <CardSpotlight>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Retornos Pendentes</p>
              <p className="text-3xl font-bold text-amber-600 mt-2">{kpis.pendingReturns}</p>
              <p className="text-xs text-muted-foreground mt-1">eventos em campo</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-4.5 h-4.5 text-amber-600" />
            </div>
          </div>
        </CardSpotlight>
      </div>

      <DashboardCharts categoryStats={categoryStats} />

      <div className="border border-border rounded-xl bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-600" />
            Eventos Recentes
          </h2>
          <Link href="/events" className="text-xs text-amber-600 hover:text-amber-300 transition-colors font-medium">
            Ver todos →
          </Link>
        </div>
        {recentEvents.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhum evento cadastrado.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recentEvents.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/events/${event.id}`}
                  className="group flex flex-col gap-3 px-5 py-3.5 transition-colors hover:bg-black/3 sm:flex-row sm:items-center"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground group-hover:text-amber-600 transition-colors truncate">
                      {event.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {event.clientName ?? "—"} • {event.city ?? "—"} • {formatDateBR(event.startDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:shrink-0">
                    <StatusBadge status={event.status} type="event" />
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-amber-600 transition-colors" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(kpis.pendingReturns > 0 || kpis.itemsInMaintenance > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kpis.pendingReturns > 0 && (
            <Link
              href="/events?status=in_field"
              className="border border-amber-500/20 rounded-xl bg-amber-500/5 p-4 hover:bg-amber-500/10 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Retornos Pendentes</p>
              </div>
              <p className="text-sm text-foreground/80">
                {kpis.pendingReturns} {kpis.pendingReturns === 1 ? "evento aguardando" : "eventos aguardando"} check-in de equipamentos.
              </p>
            </Link>
          )}
          {kpis.itemsInMaintenance > 0 && (
            <Link
              href="/inventory?status=maintenance"
              className="border border-red-500/20 rounded-xl bg-red-500/5 p-4 hover:bg-red-500/10 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-4 h-4 text-red-600" />
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Itens em Manutenção</p>
              </div>
              <p className="text-sm text-foreground/80">
                {kpis.itemsInMaintenance} {kpis.itemsInMaintenance === 1 ? "item bloqueado" : "itens bloqueados"} para manutenção.
              </p>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
