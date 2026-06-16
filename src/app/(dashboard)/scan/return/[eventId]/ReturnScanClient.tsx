"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { scanFeedbackError, scanFeedbackSuccess } from "@/lib/scanFeedback";
import {
  manualReturnUnit,
  manualUnreturnUnit,
  scanReturnUnit,
  unscanReturnUnit,
} from "@/app/(dashboard)/scan/actions";

import { QrScanner } from "@/components/inventory/QrScanner";

interface Item {
  id: string;
  equipmentName: string;
  variantLabel: string | null;
  loadedUnitsCount: number;
  returnedUnitsCount: number;
}

interface ReturnScanClientProps {
  eventId: string;
  initialItems: Item[];
}

type Mode = "return" | "unreturn";

export function ReturnScanClient({ eventId, initialItems }: ReturnScanClientProps) {
  const [items, setItems] = useState(initialItems);
  const [mode, setMode] = useState<Mode>("return");
  const [busy, setBusy] = useState(false);

  const { pending, done } = useMemo(() => {
    const pending: Item[] = [];
    const done: Item[] = [];
    for (const item of items) {
      if (item.returnedUnitsCount >= item.loadedUnitsCount) done.push(item);
      else pending.push(item);
    }
    return { pending, done };
  }, [items]);

  const totalLoaded = items.reduce((acc, i) => acc + i.loadedUnitsCount, 0);
  const totalReturned = items.reduce(
    (acc, i) => acc + Math.min(i.returnedUnitsCount, i.loadedUnitsCount),
    0
  );

  function applyDelta(eeId: string, delta: number) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === eeId
          ? { ...item, returnedUnitsCount: Math.max(0, item.returnedUnitsCount + delta) }
          : item
      )
    );
  }

  async function handleScan(text: string) {
    const result =
      mode === "return"
        ? await scanReturnUnit(eventId, text)
        : await unscanReturnUnit(eventId, text);
    if (!result.ok) {
      scanFeedbackError();
      toast.error(result.error ?? "Erro");
      return;
    }
    scanFeedbackSuccess();
    if (result.eventEquipmentId) applyDelta(result.eventEquipmentId, mode === "return" ? 1 : -1);
    toast.success(mode === "return" ? `Retornado: ${text}` : `Removido: ${text}`);
  }

  async function handleManual(item: Item, delta: 1 | -1) {
    if (busy) return;
    setBusy(true);
    try {
      const result =
        delta === 1
          ? await manualReturnUnit(eventId, item.id)
          : await manualUnreturnUnit(eventId, item.id);
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

  function Counter({ item }: { item: Item }) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => handleManual(item, -1)}
          disabled={busy || item.returnedUnitsCount <= 0}
          aria-label="Desbipar 1"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-30"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[2.75rem] text-center text-xs tabular-nums text-muted-foreground">
          {item.returnedUnitsCount}/{item.loadedUnitsCount}
        </span>
        <button
          type="button"
          onClick={() => handleManual(item, 1)}
          disabled={busy || item.returnedUnitsCount >= item.loadedUnitsCount}
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
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setMode("return")}
          className={`rounded-lg py-1.5 text-xs font-semibold transition ${
            mode === "return" ? "bg-emerald-500/15 text-emerald-700" : "text-muted-foreground"
          }`}
        >
          Bipar
        </button>
        <button
          type="button"
          onClick={() => setMode("unreturn")}
          className={`rounded-lg py-1.5 text-xs font-semibold transition ${
            mode === "unreturn" ? "bg-red-500/15 text-red-700" : "text-muted-foreground"
          }`}
        >
          Desbipar
        </button>
      </div>

      <div
        className={
          mode === "unreturn"
            ? "rounded-2xl ring-2 ring-red-500/40 ring-offset-2 ring-offset-background"
            : ""
        }
      >
        <QrScanner onResult={handleScan} onError={(e) => toast.error(e.message)} />
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-xs">
        <span className="font-medium">Progresso</span>
        <span className="text-muted-foreground">
          {totalReturned}/{totalLoaded} unidades
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
            Retornados ({done.length})
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
        <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-sm font-medium text-emerald-700">
          Tudo retornado.
        </p>
      )}

      {items.length === 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-card p-3 text-center text-sm text-muted-foreground">
          Nenhum equipamento carregado nesta OS.
        </p>
      )}
    </>
  );
}
