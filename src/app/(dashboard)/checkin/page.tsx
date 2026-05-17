import { redirect } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CornerDownLeft,
} from "lucide-react";

import { getEventById } from "@/lib/events";
import { getCurrentUserContext } from "@/lib/auth/session";
import { Progress } from "@/components/ui/progress";
import { SubmitButton } from "@/components/ui/SubmitButton";

import { returnCheckinItem, finalizeCheckin } from "@/app/(dashboard)/checkin/actions";

interface CheckinPageProps {
  searchParams: Promise<{ eventId?: string; error?: string }>;
}

export default async function CheckinPage({ searchParams }: CheckinPageProps) {
  const { eventId, error: errorMsg } = await searchParams;

  if (!eventId) redirect("/events");

  const [event, context] = await Promise.all([
    getEventById(eventId),
    getCurrentUserContext(),
  ]);

  if (!event) redirect("/events");
  if (event.status !== "in_field") redirect(`/events/${eventId}`);

  const canWrite = ["super_admin", "admin", "operations", "warehouse"].includes(context?.role ?? "");

  // Only show items that went out (loaded during checkout)
  const fieldItems = event.equipment.filter((i) => i.loaded);
  const total = fieldItems.length;

  // Bulk items (no unitId) don't have per-unit tracking — count as pending until event finalized
  // Serialized items: returned when unitStatus is no longer "in_field"
  const returned = fieldItems.filter(
    (i) => i.unitId ? i.unitStatus !== "in_field" : false
  ).length;
  const progress = total > 0 ? Math.round((returned / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-md space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-600">
          <CornerDownLeft className="h-3.5 w-3.5" />
          Portal de Retorno
        </div>
        <h1 className="text-xl font-bold">{event.name}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {event.clientName ?? "—"} • {new Date(event.endDate).toLocaleDateString("pt-BR")}
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-600">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xl font-bold text-foreground">{returned}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Retornados</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xl font-bold text-muted-foreground">{total - returned}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Pendentes</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">{returned}/{total} itens</span>
          <span className="text-sm font-bold text-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2 bg-black/10" />
      </div>

      {/* Scanner (UI demo) */}
      <div className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border py-7">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/5">
          <Camera className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm text-muted-foreground">Escanear QR de Retorno</p>
        <p className="text-xs text-muted-foreground/60">Em breve — confirme manualmente abaixo</p>
      </div>

      {/* Item list */}
      {total === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          Nenhum equipamento confirmado no checkout.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Itens para Retorno
            </p>
          </div>
          <ul className="divide-y divide-border">
            {fieldItems.map((item) => {
              const isReturned = item.unitId ? item.unitStatus !== "in_field" : false;
              const isDamaged = item.unitStatus === "maintenance";
              return (
              <li key={item.id} className={`flex items-center gap-3 px-4 py-3.5 ${isDamaged ? "bg-red-500/5" : ""}`}>
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  isDamaged
                    ? "border-red-500/40 bg-red-500/20"
                    : isReturned
                    ? "border-emerald-500/40 bg-emerald-500/20"
                    : "border-border bg-black/5"
                }`}>
                  {isDamaged && <AlertTriangle className="h-3 w-3 text-red-600" />}
                  {!isDamaged && isReturned && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  {!isDamaged && !isReturned && item.unitId && <Clock className="h-3 w-3 text-muted-foreground/40" />}
                  {!item.unitId && <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40" />}
                </div>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${isDamaged ? "text-red-600" : ""}`}>{item.equipmentName}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {item.unitSerial ?? `${item.qty} unidade${item.qty !== 1 ? "s" : ""} (lote)`}
                  </p>
                  {isDamaged && <p className="text-[10px] font-semibold text-red-600 mt-0.5">⚠ BLOQUEADO — Manutenção</p>}
                </div>

                {canWrite && item.unitId && !isReturned && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <form action={returnCheckinItem}>
                      <input type="hidden" name="unitId" value={item.unitId} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="damaged" value="false" />
                      <button
                        type="submit"
                        className="rounded-md border border-emerald-500/30 px-2 py-1 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                      >
                        OK
                      </button>
                    </form>
                    <form action={returnCheckinItem}>
                      <input type="hidden" name="unitId" value={item.unitId} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="damaged" value="true" />
                      <button
                        type="submit"
                        className="rounded-md border border-red-500/30 px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-500/10 transition-colors"
                        title="Registrar avaria"
                      >
                        <AlertTriangle className="h-3 w-3" />
                      </button>
                    </form>
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Finalize */}
      {canWrite && (
        <form action={finalizeCheckin}>
          <input type="hidden" name="eventId" value={event.id} />
          <SubmitButton
            idleLabel="Finalizar Check-in ✓"
            pendingLabel="Finalizando..."
            className="h-12 w-full rounded-xl border border-blue-500/30 bg-blue-500/15 text-sm font-semibold text-blue-600 hover:bg-blue-500/25 transition-colors"
          />
        </form>
      )}
    </div>
  );
}
