import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";

import { getCurrentUserContext } from "@/lib/auth/session";
import { formatPurchaseValue } from "@/lib/inventory";
import { formatEventStatus, type EventStatus } from "@/lib/events";
import {
  formatInvoiceStatus,
  getClientById,
  listClientEvents,
  summarizeClientBilling,
  type ClientEvent,
} from "@/lib/clients";
import { ClientsToastSync } from "@/app/(dashboard)/clients/ClientsToastSync";

import { setEventBilling } from "./actions";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (!context.role || !["super_admin", "admin", "operations", "finance"].includes(context.role)) {
    redirect("/dashboard");
  }

  const client = await getClientById(id);
  if (!client) notFound();

  const events = await listClientEvents(id);
  const billing = summarizeClientBilling(events);
  const canEditBilling = ["super_admin", "admin", "operations", "finance"].includes(context.role);

  function BillingForm({ event }: { event: ClientEvent }) {
    return (
      <form
        action={setEventBilling}
        className="mt-2 flex flex-wrap items-end gap-2 border-t border-border pt-2"
      >
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="clientId" value={id} />
        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Valor (R$)
          </span>
          <input
            name="value"
            defaultValue={event.valueCents != null ? (event.valueCents / 100).toFixed(2) : ""}
            placeholder="0,00"
            className={`${inputClass} w-28`}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Fatura
          </span>
          <select name="invoiceStatus" defaultValue={event.invoiceStatus} className={`${inputClass} w-28`}>
            <option value="draft">Rascunho</option>
            <option value="sent">Enviada</option>
            <option value="paid">Paga</option>
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg bg-foreground px-3 text-xs font-semibold text-background transition hover:opacity-90"
        >
          Salvar
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <ClientsToastSync />
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Clientes
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{client.name}</h1>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {client.contactName ? <span>{client.contactName}</span> : null}
          {client.contactEmail ? (
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              {client.contactEmail}
            </span>
          ) : null}
          {client.contactPhone ? (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {client.contactPhone}
            </span>
          ) : null}
          {client.city ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {client.city}
            </span>
          ) : null}
        </div>
      </div>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Locações</p>
          <p className="mt-1 text-lg font-bold">{billing.eventCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total faturado</p>
          <p className="mt-1 text-lg font-bold">{formatPurchaseValue(billing.totalCents)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Recebido</p>
          <p className="mt-1 text-lg font-bold text-emerald-700">
            {formatPurchaseValue(billing.paidCents)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">A receber</p>
          <p className="mt-1 text-lg font-bold text-amber-700">
            {formatPurchaseValue(billing.pendingCents)}
          </p>
        </div>
      </div>

      {/* Histórico de locações */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Histórico de locações</h2>
        {events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhuma OS vinculada a este cliente ainda.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="rounded-xl border border-border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/events/${event.id}`} className="font-medium hover:text-amber-600">
                    {event.name}
                  </Link>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatEventStatus(event.status as EventStatus)}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
                      {formatInvoiceStatus(event.invoiceStatus)}
                    </span>
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {event.startDate}
                  {event.endDate !== event.startDate ? ` → ${event.endDate}` : ""}
                  {event.valueCents != null ? ` · ${formatPurchaseValue(event.valueCents)}` : ""}
                </p>
                {canEditBilling ? <BillingForm event={event} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
