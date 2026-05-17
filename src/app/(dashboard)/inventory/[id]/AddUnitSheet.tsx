"use client";

import { Plus } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { addEquipmentUnit } from "@/app/(dashboard)/inventory/actions";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface AddUnitSheetProps {
  equipmentId: string;
}

export function AddUnitSheet({ equipmentId }: AddUnitSheetProps) {
  return (
    <Sheet>
      <SheetTrigger render={<Button size="sm" className="rounded-xl" />}>
        <Plus className="h-3.5 w-3.5" />
        Adicionar unidade
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full max-w-lg flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Adicionar unidade</SheetTitle>
          <SheetDescription>
            Insira os dados da nova unidade serializada. Um QR Code será gerado automaticamente.
          </SheetDescription>
        </SheetHeader>

        <form action={addEquipmentUnit} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <input type="hidden" name="equipmentId" value={equipmentId} />

          <div className="flex flex-col gap-5 px-6 py-6">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Número de série *</span>
              <input
                name="serial"
                required
                placeholder="Ex.: PM7-0042"
                className={INPUT_CLASS}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Nº Patrimônio</span>
              <input
                name="patrimony"
                placeholder="Ex.: PAT-2023-042"
                className={INPUT_CLASS}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Observações</span>
              <textarea
                name="notes"
                rows={3}
                placeholder="Informações adicionais..."
                className={INPUT_CLASS + " resize-none"}
              />
            </label>
          </div>

          <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
            <SubmitButton
              idleLabel="Adicionar unidade"
              pendingLabel="Salvando..."
              className="h-11 w-full rounded-2xl text-sm font-semibold"
            />
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
