"use client";

import { useState } from "react";
import { toast } from "sonner";

import { QrScanner } from "@/components/inventory/QrScanner";
import { scanReturnUnit } from "@/app/(dashboard)/scan/actions";

interface PendingItem {
  id: string;
  equipmentName: string;
  variantLabel: string | null;
  loadedUnitsCount: number;
  returnedUnitsCount: number;
}

interface ReturnScanClientProps {
  eventId: string;
  initialPending: PendingItem[];
}

export function ReturnScanClient({ eventId, initialPending }: ReturnScanClientProps) {
  const [pending, setPending] = useState(initialPending);

  async function handleScan(text: string) {
    const result = await scanReturnUnit(eventId, text);
    if (!result.ok) {
      toast.error(result.error ?? "Erro");
      return;
    }
    toast.success(`Retornado: ${text}`);
    setPending((p) =>
      p
        .map((item) =>
          item.id === result.eventEquipmentId
            ? { ...item, returnedUnitsCount: item.returnedUnitsCount + 1 }
            : item
        )
        .filter((item) => item.returnedUnitsCount < item.loadedUnitsCount)
    );
  }

  return (
    <>
      <QrScanner onResult={handleScan} onError={(e) => toast.error(e.message)} />
      <ul className="mt-4 space-y-2">
        {pending.length === 0 ? (
          <li className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
            Tudo retornado.
          </li>
        ) : (
          pending.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
            >
              <span>
                {item.equipmentName}
                {item.variantLabel ? ` · ${item.variantLabel}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {item.returnedUnitsCount}/{item.loadedUnitsCount}
              </span>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
