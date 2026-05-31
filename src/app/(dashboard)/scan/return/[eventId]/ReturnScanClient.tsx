"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { scanFeedbackError, scanFeedbackSuccess } from "@/lib/scanFeedback";
import { scanReturnUnit } from "@/app/(dashboard)/scan/actions";

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

export function ReturnScanClient({ eventId, initialItems }: ReturnScanClientProps) {
  const [items, setItems] = useState(initialItems);

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

  async function handleScan(text: string) {
    const result = await scanReturnUnit(eventId, text);
    if (!result.ok) {
      scanFeedbackError();
      toast.error(result.error ?? "Erro");
      return;
    }
    scanFeedbackSuccess();
    toast.success(`Retornado: ${text}`);
    setItems((prev) =>
      prev.map((item) =>
        item.id === result.eventEquipmentId
          ? { ...item, returnedUnitsCount: item.returnedUnitsCount + 1 }
          : item
      )
    );
  }

  return (
    <>
      <QrScanner onResult={handleScan} onError={(e) => toast.error(e.message)} />

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
                className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
              >
                <span className="truncate">
                  {item.equipmentName}
                  {item.variantLabel ? ` · ${item.variantLabel}` : ""}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.returnedUnitsCount}/{item.loadedUnitsCount}
                </span>
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
                className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2 truncate text-emerald-800">
                  <Check className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {item.equipmentName}
                    {item.variantLabel ? ` · ${item.variantLabel}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-emerald-700">
                  {item.returnedUnitsCount}/{item.loadedUnitsCount}
                </span>
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
