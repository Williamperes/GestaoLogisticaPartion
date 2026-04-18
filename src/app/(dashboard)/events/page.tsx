"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { mockEvents, type EventStatus } from "@/lib/mock-data";
import { Progress } from "@/components/ui/progress";

const statusFilters: { label: string; value: EventStatus | "all" }[] = [
  { label: "Todos", value: "all" },
  { label: "Planejamento", value: "planning" },
  { label: "Gate Liberado", value: "gate_open" },
  { label: "Em Campo", value: "in_field" },
  { label: "Concluído", value: "completed" },
];

export default function EventsPage() {
  const [filter, setFilter] = useState<EventStatus | "all">("all");

  const filtered = filter === "all" ? mockEvents : mockEvents.filter((e) => e.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Eventos & OS</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{mockEvents.length} ordens de serviço</p>
        </div>
        <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400 sm:w-auto">
          <Plus className="w-4 h-4" />
          Nova OS
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filter === f.value
                  ? "bg-amber-500/15 text-amber-600"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground lg:ml-auto lg:max-w-xs">
          <Search className="w-3.5 h-3.5" />
          <span>Buscar evento...</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-[680px] w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Evento</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Cliente</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Data</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gate</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((event) => (
              <tr key={event.id} className="group hover:bg-black/2 transition-colors">
                <td className="px-5 py-4">
                  <Link href={`/events/${event.id}`} className="group-hover:text-amber-600 transition-colors font-medium">
                    {event.name}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">{event.city}</p>
                </td>
                <td className="px-4 py-4 text-muted-foreground hidden md:table-cell">{event.client}</td>
                <td className="px-4 py-4 text-muted-foreground hidden lg:table-cell">
                  {new Date(event.startDate).toLocaleDateString("pt-BR")}
                  {event.endDate !== event.startDate && (
                    <> — {new Date(event.endDate).toLocaleDateString("pt-BR")}</>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Progress value={event.gateProgress} className="w-16 h-1.5 bg-black/8" />
                    <span className={`text-xs font-medium ${event.gateProgress === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                      {event.gateProgress}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={event.status} type="event" />
                </td>
                <td className="px-4 py-4">
                  <Link href={`/events/${event.id}`}>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-amber-600 transition-colors" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
