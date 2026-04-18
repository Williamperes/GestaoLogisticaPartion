"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  CalendarDays,
  Package,
  TrendingUp,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Wrench,
} from "lucide-react";
import { CardSpotlight } from "@/components/ui/aceternity/card-spotlight";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { mockKPIs, mockUtilizationChart, mockCategoryChart, mockEvents } from "@/lib/mock-data";
import Link from "next/link";

const COLORS = ["#F59E0B", "#3B82F6", "#10B981", "#EF4444", "#8B5CF6"];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Visão Geral</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Março 2025 • Atualizado agora</p>
        </div>
        <div className="flex items-center gap-2">
          {mockKPIs.activeAlerts > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 text-sm font-medium border border-amber-500/20">
              <AlertTriangle className="w-4 h-4" />
              {mockKPIs.activeAlerts} alertas ativos
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <CardSpotlight>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Eventos este mês</p>
              <p className="text-3xl font-bold text-foreground mt-2">{mockKPIs.eventsThisMonth}</p>
              <p className="text-xs text-muted-foreground mt-1">{mockKPIs.eventsNextMonth} agendados</p>
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
              <p className="text-3xl font-bold text-red-600 mt-2">{mockKPIs.itemsInMaintenance}</p>
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
              <p className="text-3xl font-bold text-foreground mt-2">{mockKPIs.utilizationRate}%</p>
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> +8% vs mês anterior
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
              <p className="text-3xl font-bold text-amber-600 mt-2">{mockKPIs.pendingReturns}</p>
              <p className="text-xs text-muted-foreground mt-1">check-in aguardado</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-4.5 h-4.5 text-amber-600" />
            </div>
          </div>
        </CardSpotlight>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Utilization Chart */}
        <div className="xl:col-span-2 border border-border rounded-xl bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Taxa de Utilização de Equipamentos</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={mockUtilizationChart}>
              <defs>
                <linearGradient id="utilGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1d24", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }}
                itemStyle={{ color: "#F59E0B" }}
                formatter={(v) => [`${v}%`, "Utilização"]}
              />
              <Area type="monotone" dataKey="utilization" stroke="#F59E0B" strokeWidth={2} fill="url(#utilGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Category Pie */}
        <div className="border border-border rounded-xl bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Por Categoria</h2>
          <div className="flex items-center gap-4">
            <PieChart width={100} height={100}>
              <Pie data={mockCategoryChart} cx={45} cy={45} innerRadius={28} outerRadius={45} paddingAngle={3} dataKey="value">
                {mockCategoryChart.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
            <ul className="space-y-2 flex-1">
              {mockCategoryChart.map((entry, index) => (
                <li key={entry.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                    <span className="text-muted-foreground">{entry.name}</span>
                  </span>
                  <span className="font-semibold text-foreground">{entry.value}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="border border-border rounded-xl bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-600" />
            Eventos Próximos
          </h2>
          <Link href="/events" className="text-xs text-amber-600 hover:text-amber-300 transition-colors font-medium">
            Ver todos →
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {mockEvents.slice(0, 4).map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-black/3 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-amber-600 transition-colors truncate">
                    {event.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {event.client} • {event.city} • {new Date(event.startDate).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={event.status} type="event" />
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-amber-600 transition-colors" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-amber-500/20 rounded-xl bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Retornos Pendentes</p>
          </div>
          <p className="text-sm text-foreground/80">2 eventos aguardando check-in de equipamentos.</p>
        </div>
        <div className="border border-red-500/20 rounded-xl bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="w-4 h-4 text-red-600" />
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Manutenção Vencida</p>
          </div>
          <p className="text-sm text-foreground/80">Moving Head Beam 200 em manutenção há 7 dias.</p>
        </div>
        <div className="border border-blue-500/20 rounded-xl bg-blue-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-blue-600" />
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Gate Bloqueado</p>
          </div>
          <p className="text-sm text-foreground/80">TechConf 2025 com gate em 30% — carga não liberada.</p>
        </div>
      </div>
    </div>
  );
}
