import { redirect } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  Clock,
  Truck,
} from "lucide-react";

import { getEventById } from "@/lib/events";
import { getCurrentUserContext } from "@/lib/auth/session";
import { Progress } from "@/components/ui/progress";

import { confirmCheckoutItem, finalizeCheckout } from "@/app/(dashboard)/checkout/actions";

interface CheckoutPageProps {
  searchParams: Promise<{ eventId?: string; error?: string; success?: string }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const { eventId, error: errorMsg, success } = await searchParams;

  if (!eventId) redirect("/events");

  const [event, context] = await Promise.all([
    getEventById(eventId),
    getCurrentUserContext(),
  ]);

  if (!event) redirect("/events");
  if (event.status === "completed" || event.status === "cancelled") {
    redirect(`/events/${eventId}`);
  }

  const canWrite = ["super_admin", "admin", "operations", "warehouse"].includes(context?.role ?? "");

  const confirmed = event.equipment.filter((i) => i.confirmed).length;
  const total = event.equipment.length;
  const progress = total > 0 ? Math.round((confirmed / total) * 100) : 0;
  const allClear = confirmed === total && total > 0;
  const canFinalize = allClear && canWrite && (event.status === "ready_to_load");

  return (
    <div className="mx-auto max-w-md space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600">
          <Truck className="h-3.5 w-3.5" />
          Portal de Checkout
        </div>
        <h1 className="text-xl font-bold">{event.name}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {event.clientName ?? "—"} • {new Date(event.startDate).toLocaleDateString("pt-BR")}
        </p>
      </div>

      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-600">
          {decodeURIComponent(success)}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-600">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      {/* Progress */}
      <div className={`rounded-xl border p-4 ${allClear ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">{confirmed}/{total} itens confirmados</span>
          <span className={`text-sm font-bold ${allClear ? "text-emerald-600" : "text-amber-600"}`}>{progress}%</span>
        </div>
        <Progress value={progress} className="h-2 bg-black/10" />
        {allClear && (
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Pronto para fechar o caminhão!
          </p>
        )}
      </div>

      {/* Scanner (UI demo) */}
      <div className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border py-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/5">
          <Camera className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Leitura via QR Code</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Em breve — confirme manualmente abaixo</p>
        </div>
      </div>

      {/* Item list */}
      {total === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          Nenhum equipamento vinculado a esta OS.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Lista de Conferência
            </p>
          </div>
          <ul className="divide-y divide-border">
            {event.equipment.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3.5">
                {canWrite ? (
                  <form action={confirmCheckoutItem}>
                    <input type="hidden" name="eventEquipmentId" value={item.id} />
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="confirmed" value={item.confirmed ? "false" : "true"} />
                    <button
                      type="submit"
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all ${
                        item.confirmed
                          ? "border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30"
                          : "border-border bg-black/5 hover:border-amber-500/40 hover:bg-amber-500/10"
                      }`}
                    >
                      {item.confirmed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      {!item.confirmed && <Clock className="h-3 w-3 text-muted-foreground/40" />}
                    </button>
                  </form>
                ) : (
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${item.confirmed ? "border-emerald-500/40 bg-emerald-500/20" : "border-border bg-black/5"}`}>
                    {item.confirmed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${item.confirmed ? "text-foreground" : "text-muted-foreground"}`}>
                    {item.equipmentName}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {item.unitSerial ?? `${item.qty} unidade${item.qty !== 1 ? "s" : ""}`}
                  </p>
                </div>
                {item.confirmed && (
                  <span className="text-[10px] font-semibold text-emerald-600">OK</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Finalize */}
      {canWrite && (
        <form action={finalizeCheckout}>
          <input type="hidden" name="eventId" value={event.id} />
          <button
            type="submit"
            disabled={!canFinalize}
            className={`h-12 w-full rounded-xl text-sm font-semibold transition-colors ${
              canFinalize
                ? "bg-amber-500 text-black hover:bg-amber-400"
                : "cursor-not-allowed bg-muted text-muted-foreground opacity-50"
            }`}
          >
            {!allClear
              ? `Aguardando ${total - confirmed} item(s)...`
              : event.status !== "ready_to_load"
              ? "OS deve estar em 'Pronto para Carga'"
              : "Fechar Caminhão ✓"}
          </button>
        </form>
      )}
    </div>
  );
}
