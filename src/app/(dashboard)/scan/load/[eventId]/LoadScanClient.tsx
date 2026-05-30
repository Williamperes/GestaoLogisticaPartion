"use client";

import { useState } from "react";
import { toast } from "sonner";

import { QrScanner } from "@/components/inventory/QrScanner";
import { scanLoadUnit } from "@/app/(dashboard)/scan/actions";

interface PendingItem {
  id: string;
  equipmentName: string;
  variantLabel: string | null;
  qty: number;
  loadedUnitsCount: number;
}

interface LoadScanClientProps {
  eventId: string;
  initialPending: PendingItem[];
}

export function LoadScanClient({ eventId, initialPending }: LoadScanClientProps) {
  const [pending, setPending] = useState(initialPending);

  async function handleScan(text: string) {
    const result = await scanLoadUnit(eventId, text);
    if (!result.ok) {
      toast.error(result.error ?? "Erro");
      return;
    }
    toast.success(`Carregado: ${text}`);
    setPending((p) =>
      p
        .map((item) =>
          item.id === result.eventEquipmentId
            ? { ...item, loadedUnitsCount: item.loadedUnitsCount + 1 }
            : item
        )
        .filter((item) => item.loadedUnitsCount < item.qty)
    );
  }

  return (
    <>
      <QrScanner onResult={handleScan} onError={(e) => toast.error(e.message)} />
      <ul className="mt-4 space-y-2">
        {pending.length === 0 ? (
          <li className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
            Tudo carregado.
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
                {item.loadedUnitsCount}/{item.qty}
              </span>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
