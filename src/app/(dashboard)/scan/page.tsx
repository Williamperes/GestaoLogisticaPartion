import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeftRight, ScanLine, Truck, CheckCircle2 } from "lucide-react";

import { getCurrentUserContext } from "@/lib/auth/session";
import { getTeamMemberByUserId } from "@/lib/team";
import { listMyScanEvents, type MyScanEvent, type ScanEventState } from "@/lib/events";
import { formatDateBR } from "@/lib/dates";

interface ScanHubPageProps {
  searchParams: Promise<{ error?: string }>;
}

const STATE_META: Record<
  ScanEventState,
  { label: string; tone: string; cta: string; href: (id: string) => string; icon: React.ComponentType<{ className?: string }> }
> = {
  to_load: {
    label: "Aguardando carga",
    tone: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    cta: "Carregar",
    href: (id) => `/scan/load/${id}`,
    icon: Truck,
  },
  loading: {
    label: "Carregando",
    tone: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    cta: "Continuar carregando",
    href: (id) => `/scan/load/${id}`,
    icon: Truck,
  },
  to_return: {
    label: "Aguardando retorno",
    tone: "text-sky-600 bg-sky-500/10 border-sky-500/30",
    cta: "Retornar",
    href: (id) => `/scan/return/${id}`,
    icon: ArrowLeftRight,
  },
  returning: {
    label: "Retornando",
    tone: "text-sky-600 bg-sky-500/10 border-sky-500/30",
    cta: "Continuar retornando",
    href: (id) => `/scan/return/${id}`,
    icon: ArrowLeftRight,
  },
  done: {
    label: "Concluído",
    tone: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
    cta: "Ver detalhes",
    href: (id) => `/events/${id}`,
    icon: CheckCircle2,
  },
};

function groupByPeriod(events: MyScanEvent[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString().slice(0, 10);

  const todayList: MyScanEvent[] = [];
  const awaitingReturn: MyScanEvent[] = [];
  const upcoming: MyScanEvent[] = [];
  const done: MyScanEvent[] = [];

  for (const ev of events) {
    if (ev.state === "done") {
      done.push(ev);
    } else if (ev.state === "to_return" || ev.state === "returning") {
      awaitingReturn.push(ev);
    } else if (ev.startDate <= todayISO && ev.endDate >= todayISO) {
      todayList.push(ev);
    } else if (ev.startDate > todayISO) {
      upcoming.push(ev);
    } else {
      // Passado mas ainda precisa carregar (raro) — joga em retorno.
      awaitingReturn.push(ev);
    }
  }
  return { todayList, awaitingReturn, upcoming, done };
}

function ScanCard({ event }: { event: MyScanEvent }) {
  const meta = STATE_META[event.state];
  const Icon = meta.icon;
  const dateLabel =
    event.startDate === event.endDate
      ? formatDateBR(event.startDate)
      : `${formatDateBR(event.startDate)} — ${formatDateBR(event.endDate)}`;

  return (
    <Link
      href={meta.href(event.id)}
      className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{event.name}</p>
          {event.clientName && (
            <p className="truncate text-xs text-muted-foreground">{event.clientName}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.tone}`}
        >
          {meta.label}
        </span>
      </div>

      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        <p className="truncate">
          {event.venue ?? "Local não informado"}
          {event.city ? ` · ${event.city}` : ""}
        </p>
        <p>{dateLabel}</p>
        {event.totalQty > 0 && (
          <p>
            {event.state === "to_load" || event.state === "loading"
              ? `${event.loadedCount}/${event.totalQty} carregados`
              : `${event.returnedCount}/${event.loadedCount} retornados`}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-sm font-semibold text-amber-600">
        <Icon className="h-4 w-4" />
        {meta.cta}
      </div>
    </Link>
  );
}

function Section({ title, events }: { title: string; events: MyScanEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-2">
        {events.map((ev) => (
          <ScanCard key={ev.id} event={ev} />
        ))}
      </div>
    </section>
  );
}

export default async function ScanHubPage({ searchParams }: ScanHubPageProps) {
  const { error } = await searchParams;
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (!context.primaryOrganization?.id) redirect("/dashboard");

  const member = await getTeamMemberByUserId(
    context.userId,
    context.primaryOrganization.id
  );

  if (!member) {
    return (
      <div className="space-y-3">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold">Olá, {context.profile?.fullName ?? "Técnico"}</h1>
          <p className="text-xs text-muted-foreground">Bipe rápido das OS atribuídas a você.</p>
        </header>
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          <ScanLine className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          Você ainda não está vinculado a uma ficha de técnico. Avise o administrador.
        </div>
      </div>
    );
  }

  const all = await listMyScanEvents(member.id);
  const { todayList, awaitingReturn, upcoming, done } = groupByPeriod(all);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Olá, {context.profile?.fullName ?? "Técnico"}</h1>
        <p className="text-xs text-muted-foreground">Bipe rápido das OS atribuídas a você.</p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <Section title="Hoje" events={todayList} />
      <Section title="Aguardando retorno" events={awaitingReturn} />
      <Section title="Próximos" events={upcoming} />
      <Section title="Concluídos" events={done} />

      {todayList.length + awaitingReturn.length + upcoming.length + done.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          <ScanLine className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          Nenhuma OS atribuída a você no momento.
        </div>
      )}
    </div>
  );
}
