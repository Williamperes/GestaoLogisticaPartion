"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, Truck } from "lucide-react";
import { toast } from "sonner";

import type { EventStatus } from "@/lib/events";
import { scanFeedbackError, scanFeedbackSuccess } from "@/lib/scanFeedback";
import {
  finalizeLoad,
  manualLoadUnit,
  manualUnloadUnit,
  scanLoadUnit,
  unscanLoadUnit,
} from "@/app/(dashboard)/scan/actions";

import { QrScanner } from "@/components/inventory/QrScanner";
import type { AppRole } from "@/lib/auth/roles";
import type { ExtraMaterialCandidate, ExtraMaterialLog } from "@/lib/extra-material";

import { ExtraMaterialPanel } from "./ExtraMaterialPanel";

interface Item {
  id: string;
  equipmentName: string;
  variantLabel: string | null;
  qty: number;
  loadedUnitsCount: number;
}

interface LoadScanClientProps {
  eventId: string;
  eventStatus: EventStatus;
  initialItems: Item[];
  role: AppRole | null;
  extraCandidates: ExtraMaterialCandidate[];
  initialExtraLog: ExtraMaterialLog[];
}

type Mode = "load" | "unload" | "extra";

export function LoadScanClient({
  eventId,
  eventStatus,
  initialItems,
  role,
  extraCandidates,
  initialExtraLog,
}: LoadScanClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const previousCanonicalItems = useRef({ eventId, items: initialItems });
  const [mode, setMode] = useState<Mode>("load");
  const [busy, setBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const isWarehouse = role === "warehouse";
  const showsExtraPanel = isWarehouse && mode === "extra";

  useEffect(() => {
    const previousCanonical = previousCanonicalItems.current;
    previousCanonicalItems.current = { eventId, items: initialItems };

    if (previousCanonical.eventId !== eventId) {
      setItems(initialItems);
      return;
    }

    const previousById = new Map(previousCanonical.items.map((item) => [item.id, item]));
    setItems((currentItems) => {
      const currentById = new Map(currentItems.map((item) => [item.id, item]));
      return initialItems.map((canonicalItem) => {
        const previousItem = previousById.get(canonicalItem.id);
        const currentItem = currentById.get(canonicalItem.id);
        if (!previousItem || !currentItem) return canonicalItem;

        const loadedUnitsCount =
          canonicalItem.loadedUnitsCount === previousItem.loadedUnitsCount
            ? Math.min(currentItem.loadedUnitsCount, canonicalItem.qty)
            : canonicalItem.loadedUnitsCount;
        return { ...canonicalItem, loadedUnitsCount };
      });
    });
  }, [eventId, initialItems]);

  const { pending, done } = useMemo(() => {
    const pending: Item[] = [];
    const done: Item[] = [];
    for (const item of items) {
      if (item.loadedUnitsCount >= item.qty) done.push(item);
      else pending.push(item);
    }
    return { pending, done };
  }, [items]);

  const totalQty = items.reduce((acc, i) => acc + i.qty, 0);
  const totalLoaded = items.reduce((acc, i) => acc + Math.min(i.loadedUnitsCount, i.qty), 0);

  function applyDelta(eeId: string, delta: number) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === eeId
          ? { ...item, loadedUnitsCount: Math.max(0, item.loadedUnitsCount + delta) }
          : item
      )
    );
  }

  async function handleScan(text: string) {
    const scanMode = mode === "unload" ? "unload" : "load";
    const result =
      scanMode === "load" ? await scanLoadUnit(eventId, text) : await unscanLoadUnit(eventId, text);
    if (!result.ok) {
      scanFeedbackError();
      toast.error(result.error ?? "Erro");
      return;
    }
    scanFeedbackSuccess();
    if (result.eventEquipmentId) applyDelta(result.eventEquipmentId, scanMode === "load" ? 1 : -1);
    toast.success(scanMode === "load" ? `Carregado: ${text}` : `Removido: ${text}`);
  }

  async function handleManual(item: Item, delta: 1 | -1) {
    if (busy) return;
    setBusy(true);
    try {
      const result =
        delta === 1
          ? await manualLoadUnit(eventId, item.id)
          : await manualUnloadUnit(eventId, item.id);
      if (!result.ok) {
        scanFeedbackError();
        toast.error(result.error ?? "Erro");
        return;
      }
      scanFeedbackSuccess();
      applyDelta(item.id, delta);
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalize() {
    if (finalizing) return;
    setFinalizing(true);
    try {
      const result = await finalizeLoad(eventId);
      if (!result.ok) {
        toast.error(result.error ?? "Erro");
        return;
      }
      toast.success("OS em campo. Carga concluída.");
      router.push(`/events/${eventId}`);
    } finally {
      setFinalizing(false);
    }
  }

  function Counter({ item }: { item: Item }) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => handleManual(item, -1)}
          disabled={busy || item.loadedUnitsCount <= 0}
          aria-label="Desbipar 1"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-30"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[2.75rem] text-center text-xs tabular-nums text-muted-foreground">
          {item.loadedUnitsCount}/{item.qty}
        </span>
        <button
          type="button"
          onClick={() => handleManual(item, 1)}
          disabled={busy || item.loadedUnitsCount >= item.qty}
          aria-label="Bipar 1"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-30"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className={`mb-3 grid ${
          isWarehouse ? "grid-cols-3" : "grid-cols-2"
        } gap-1 rounded-xl border border-border bg-card p-1`}
      >
        <button
          type="button"
          onClick={() => setMode("load")}
          className={`rounded-lg py-1.5 text-xs font-semibold transition ${
            mode === "load" ? "bg-emerald-500/15 text-emerald-700" : "text-muted-foreground"
          }`}
        >
          Bipar
        </button>
        <button
          type="button"
          onClick={() => setMode("unload")}
          className={`rounded-lg py-1.5 text-xs font-semibold transition ${
            mode === "unload" ? "bg-red-500/15 text-red-700" : "text-muted-foreground"
          }`}
        >
          Desbipar
        </button>
        {isWarehouse && (
          <button
            type="button"
            onClick={() => setMode("extra")}
            className={`rounded-lg py-1.5 text-xs font-semibold transition ${
              mode === "extra" ? "bg-amber-500/15 text-amber-700" : "text-muted-foreground"
            }`}
          >
            Material a mais
          </button>
        )}
      </div>

      {showsExtraPanel ? (
        <ExtraMaterialPanel
          eventId={eventId}
          candidates={extraCandidates}
          initialLog={initialExtraLog}
        />
      ) : (
        <>
          <div
            className={
              mode === "unload"
                ? "rounded-2xl ring-2 ring-red-500/40 ring-offset-2 ring-offset-background"
                : ""
            }
          >
            <QrScanner onResult={handleScan} onError={(e) => toast.error(e.message)} />
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-xs">
            <span className="font-medium">Progresso</span>
            <span className="text-muted-foreground">
              {totalLoaded}/{totalQty} unidades
            </span>
          </div>

          {pending.length > 0 && (
            <section className="mt-3 space-y-1.5">
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Pendentes
              </h2>
              <ul className="space-y-2">
                {pending.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {item.equipmentName}
                      {item.variantLabel ? ` · ${item.variantLabel}` : ""}
                    </span>
                    <Counter item={item} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {done.length > 0 && (
            <section className="mt-4 space-y-1.5">
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
                Carregados ({done.length})
              </h2>
              <ul className="space-y-2">
                {done.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2 truncate text-emerald-800">
                      <Check className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {item.equipmentName}
                        {item.variantLabel ? ` · ${item.variantLabel}` : ""}
                      </span>
                    </span>
                    <Counter item={item} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pending.length === 0 && done.length > 0 && (
            <div className="mt-3 space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
              <p className="text-sm font-medium text-emerald-700">Tudo carregado.</p>
              {eventStatus === "in_field" ? (
                <p className="text-xs font-medium text-amber-600">OS já está em campo ✓</p>
              ) : (
                <button
                  type="button"
                  onClick={handleFinalize}
                  disabled={finalizing || eventStatus !== "ready_to_load"}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                >
                  <Truck className="h-4 w-4" />
                  {finalizing
                    ? "Fechando..."
                    : eventStatus === "ready_to_load"
                    ? "Fechar OS — colocar Em Campo"
                    : "Libere a carga na OS primeiro"}
                </button>
              )}
            </div>
          )}

          {items.length === 0 && (
            <p className="mt-3 rounded-xl border border-dashed border-border bg-card p-3 text-center text-sm text-muted-foreground">
              Nenhum equipamento nesta OS.
            </p>
          )}
        </>
      )}
    </>
  );
}
