import { Search, Plus, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { EventSheet } from "@/app/(dashboard)/events/EventSheet";
import { getCurrentUserContext } from "@/lib/auth/session";
import {
  listEvents,
  formatEventStatus,
  getGateProgress,
  getEventsWithInsufficientStock,
} from "@/lib/events";
import { listClientOrganizations } from "@/lib/clients";
import { listChecklistTemplates } from "@/lib/checklist-templates";
import { formatDateBR } from "@/lib/dates";
import type { EventStatus } from "@/lib/events";

const STATUS_FILTERS: { label: string; value: EventStatus | "all" }[] = [
  { label: "Todos", value: "all" },
  { label: "Planejamento", value: "planning" },
  { label: "Pronto p/ Carga", value: "ready_to_load" },
  { label: "Em Campo", value: "in_field" },
  { label: "Concluído", value: "completed" },
];

interface EventsPageProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const { q, status } = await searchParams;
  const search = q?.trim() ?? "";
  const statusFilter = (status ?? "all") as EventStatus | "all";

  const context = await getCurrentUserContext();
  const organizationId = context?.primaryOrganization?.id;

  const [events, clients, templates] = organizationId
    ? await Promise.all([
        listEvents(organizationId, search),
        listClientOrganizations(),
        listChecklistTemplates(organizationId),
      ])
    : [[], [], []];

  const oversoldEvents = organizationId
    ? await getEventsWithInsufficientStock(organizationId, events)
    : new Set<string>();

  const filtered =
    statusFilter === "all"
      ? events
      : events.filter((e) => e.status === statusFilter);

  const canCreate = ["super_admin", "admin", "operations"].includes(context?.role ?? "");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Eventos &amp; OS</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {events.length} {events.length === 1 ? "ordem de serviço" : "ordens de serviço"}
          </p>
        </div>
        {canCreate && <EventSheet clients={clients} templates={templates} />}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Filtros de status */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={`/events?status=${f.value}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                statusFilter === f.value
                  ? "bg-amber-500/15 text-amber-600"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {/* Busca */}
        <form className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground lg:ml-auto lg:max-w-xs">
          <Search className="h-3.5 w-3.5" />
          <input
            name="q"
            defaultValue={search}
            placeholder="Buscar evento..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <input type="hidden" name="status" value={statusFilter} />
        </form>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <Plus className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            {search ? `Nenhum evento encontrado para "${search}"` : "Nenhuma OS cadastrada"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="min-w-[680px] w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Evento
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                  Cliente
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">
                  Data
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Gate
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((event) => {
                const progress = getGateProgress(
                  Array.from({ length: event.checklistTotal ?? 0 }, (_, i) => ({
                    done: i < (event.checklistDone ?? 0),
                  }))
                );
                return (
                  <tr key={event.id} className="group transition-colors hover:bg-black/2">
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/events/${event.id}`}
                          className="font-medium transition-colors group-hover:text-amber-600"
                        >
                          {event.name}
                        </Link>
                        {oversoldEvents.has(event.id) && (
                          <span
                            title="Pelo menos 1 item alocado acima do estoque disponível para o período"
                            className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Estoque insuficiente
                          </span>
                        )}
                      </div>
                      {event.city && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{event.city}</p>
                      )}
                    </td>
                    <td className="hidden px-4 py-4 text-muted-foreground md:table-cell">
                      {event.clientName ?? "—"}
                    </td>
                    <td className="hidden px-4 py-4 text-muted-foreground lg:table-cell">
                      {formatDateBR(event.startDate)}
                      {event.endDate !== event.startDate && (
                        <> — {formatDateBR(event.endDate)}</>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="h-1.5 w-16 bg-black/8" />
                        <span
                          className={`text-xs font-medium ${
                            progress === 100 ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          {progress}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={event.status} type="event" />
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/events/${event.id}`}>
                        <span className="text-xs text-muted-foreground/40 transition-colors group-hover:text-amber-600">
                          →
                        </span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
