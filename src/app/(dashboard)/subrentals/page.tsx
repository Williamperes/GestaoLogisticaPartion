import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Handshake, Trash2 } from "lucide-react";

import { getCurrentUserContext } from "@/lib/auth/session";
import { listEvents } from "@/lib/events";
import { formatPurchaseValue } from "@/lib/inventory";
import {
  formatSubrentalDirection,
  formatSubrentalStatus,
  listSubrentals,
  type Subrental,
} from "@/lib/subrentals";

import { SubrentalsToolbar } from "./SubrentalsToolbar";
import { SubrentalsToastSync } from "./SubrentalsToastSync";
import { deleteSubrental, setSubrentalStatus } from "./actions";

const WRITE_ROLES = ["super_admin", "admin", "operations", "finance"];

function SubrentalCard({ s, canWrite, canDelete }: { s: Subrental; canWrite: boolean; canDelete: boolean }) {
  return (
    <li className="rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{s.itemDescription}</span>
            {s.qty > 1 ? (
              <span className="text-xs text-muted-foreground">×{s.qty}</span>
            ) : null}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                s.status === "returned"
                  ? "bg-emerald-500/15 text-emerald-700"
                  : s.status === "out"
                  ? "bg-amber-500/15 text-amber-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {formatSubrentalStatus(s.status)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.partnerName}
            {s.valueCents != null ? ` · ${formatPurchaseValue(s.valueCents)}` : ""}
            {s.eventName ? ` · OS: ${s.eventName}` : ""}
          </p>
          {s.expectedStart || s.expectedEnd ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {s.expectedStart ?? "?"} → {s.expectedEnd ?? "?"}
            </p>
          ) : null}
          {s.notes ? (
            <p className="mt-1 truncate text-xs italic text-muted-foreground">“{s.notes}”</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {canWrite && s.status !== "returned" ? (
            <form action={setSubrentalStatus}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="status" value={s.status === "pending" ? "out" : "returned"} />
              <button
                type="submit"
                className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90"
              >
                {s.status === "pending" ? "Marcar em uso" : "Marcar devolvido"}
              </button>
            </form>
          ) : null}
          {canDelete ? (
            <form action={deleteSubrental}>
              <input type="hidden" name="id" value={s.id} />
              <button
                type="submit"
                aria-label="Remover"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default async function SubrentalsPage() {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (!context.role || !["super_admin", "admin", "operations", "finance"].includes(context.role)) {
    redirect("/dashboard");
  }

  const organizationId = context.primaryOrganization?.id;
  const [subrentals, events] = organizationId
    ? await Promise.all([listSubrentals(organizationId), listEvents(organizationId)])
    : [[], []];
  const inbound = subrentals.filter((s) => s.direction === "inbound");
  const outbound = subrentals.filter((s) => s.direction === "outbound");

  const canWrite = WRITE_ROLES.includes(context.role);
  const canDelete = ["super_admin", "admin"].includes(context.role);

  function Section({
    title,
    icon: Icon,
    items,
  }: {
    title: string;
    icon: typeof ArrowDownLeft;
    items: Subrental[];
  }) {
    return (
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="text-xs text-muted-foreground">({items.length})</span>
        </div>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-3 text-center text-xs text-muted-foreground">
            Nenhum registro.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <SubrentalCard key={s.id} s={s} canWrite={canWrite} canDelete={canDelete} />
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <SubrentalsToastSync />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sublocações</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Controle de materiais de terceiros e equipamentos locados a parceiros.
          </p>
        </div>
        {canWrite ? (
          <SubrentalsToolbar events={events.map((e) => ({ id: e.id, name: e.name }))} />
        ) : null}
      </div>

      {subrentals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <Handshake className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhuma sublocação registrada.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Registre material alugado de terceiros ou locado para parceiros.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <Section title={formatSubrentalDirection("inbound")} icon={ArrowDownLeft} items={inbound} />
          <Section title={formatSubrentalDirection("outbound")} icon={ArrowUpRight} items={outbound} />
        </div>
      )}
    </div>
  );
}
