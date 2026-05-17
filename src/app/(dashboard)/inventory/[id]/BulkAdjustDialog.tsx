"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";

import { Button } from "@/components/ui/button";
import { updateBulkInventory } from "@/app/(dashboard)/inventory/actions";
import type { Equipment } from "@/lib/inventory";

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface BulkAdjustDialogProps {
  equipment: Equipment;
}

export function BulkAdjustDialog({ equipment }: BulkAdjustDialogProps) {
  const bulk = equipment.bulk!;
  const [totalQty, setTotalQty] = useState(bulk.totalQty);
  const [availableQty, setAvailableQty] = useState(bulk.availableQty);
  const invalid = availableQty > totalQty || totalQty < 0 || availableQty < 0;

  return (
    <Dialog.Root>
      <Dialog.Trigger render={<Button variant="outline" size="sm" className="rounded-xl" />}>
        Ajustar estoque
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />

        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-border bg-[color:color-mix(in_srgb,var(--card)_94%,white)] p-6 shadow-[0_30px_80px_rgba(17,17,17,0.18)] transition duration-200 ease-in-out data-ending-style:opacity-0 data-ending-style:scale-[0.98] data-starting-style:opacity-0 data-starting-style:scale-[0.98]">
          <Dialog.Title className="mb-1 text-base font-semibold">Ajustar estoque</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            Atualize as quantidades de <strong>{equipment.name}</strong>.
          </Dialog.Description>

          <form action={updateBulkInventory} className="space-y-4">
            <input type="hidden" name="equipmentId" value={equipment.id} />

            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Total ({bulk.unit})</span>
                <input
                  type="number"
                  name="totalQty"
                  min={0}
                  value={totalQty}
                  onChange={(e) => setTotalQty(Number(e.target.value))}
                  className={INPUT_CLASS}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Disponível</span>
                <input
                  type="number"
                  name="availableQty"
                  min={0}
                  value={availableQty}
                  onChange={(e) => setAvailableQty(Number(e.target.value))}
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            {invalid && (
              <p className="text-xs text-red-600">
                Disponível não pode ser maior que total.
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-2xl px-5 text-sm font-semibold"
                  />
                }
              >
                Cancelar
              </Dialog.Close>
              <Button
                type="submit"
                disabled={invalid}
                className="h-10 rounded-2xl px-5 text-sm font-semibold"
              >
                Salvar
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
