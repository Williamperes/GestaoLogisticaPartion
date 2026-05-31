"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { scanFeedbackError, scanFeedbackSuccess } from "@/lib/scanFeedback";
import { scanLoadUnit } from "@/app/(dashboard)/scan/actions";

import { QrScanner } from "@/components/inventory/QrScanner";

interface Item {
  id: string;
  equipmentName: string;
  variantLabel: string | null;
  qty: number;
  loadedUnitsCount: number;
}

interface LoadScanClientProps {
  eventId: string;
  initialItems: Item[];
}

export function LoadScanClient({ eventId, initialItems }: LoadScanClientProps) {
  const [items, setItems] = useState(initialItems);

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

  async function handleScan(text: string) {
    const result = await scanLoadUnit(eventId, text);
    if (!result.ok) {
      scanFeedbackError();
      toast.error(result.error ?? "Erro");
      return;
    }
    scanFeedbackSuccess();
    toast.success(`Carregado: ${text}`);
    setItems((prev) =>
      prev.map((item) =>
        item.id === result.eventEquipmentId
          ? { ...item, loadedUnitsCount: item.loadedUnitsCount + 1 }
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
                className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
              >
                <span className="truncate">
                  {item.equipmentName}
                  {item.variantLabel ? ` · ${item.variantLabel}` : ""}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.loadedUnitsCount}/{item.qty}
                </span>
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
                  {item.loadedUnitsCount}/{item.qty}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length === 0 && done.length > 0 && (
        <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-sm font-medium text-emerald-700">
          Tudo carregado.
        </p>
      )}

      {items.length === 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-card p-3 text-center text-sm text-muted-foreground">
          Nenhum equipamento nesta OS.
        </p>
      )}
    </>
  );
}
