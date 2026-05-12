"use client";

import { useState } from "react";
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
import { addEquipmentToEvent } from "@/app/(dashboard)/events/actions";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface EquipmentOption {
  id: string;
  name: string;
  type: "serialized" | "bulk";
}

interface AddEquipmentSheetProps {
  eventId: string;
  equipment: EquipmentOption[];
}

export function AddEquipmentSheet({ eventId, equipment }: AddEquipmentSheetProps) {
  const [selectedId, setSelectedId] = useState("");
  const selected = equipment.find((e) => e.id === selectedId);

  return (
    <Sheet>
      <SheetTrigger render={<Button size="sm" className="rounded-xl" />}>
        <Plus className="h-3.5 w-3.5" />
        Adicionar item
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full max-w-lg flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Adicionar equipamento</SheetTitle>
          <SheetDescription>Vincule um equipamento à lista desta OS.</SheetDescription>
        </SheetHeader>

        <form
          action={addEquipmentToEvent}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <input type="hidden" name="eventId" value={eventId} />

          <div className="flex flex-col gap-5 px-6 py-6">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Equipamento *</span>
              <select
                name="equipmentId"
                required
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Selecione um equipamento...</option>
                {equipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name} ({eq.type === "bulk" ? "lote" : "serializado"})
                  </option>
                ))}
              </select>
            </label>

            {selected?.type === "bulk" && (
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Quantidade *</span>
                <input
                  type="number"
                  name="qty"
                  min={1}
                  defaultValue={1}
                  required
                  className={INPUT_CLASS}
                />
              </label>
            )}

            {selected?.type === "serialized" && (
              <input type="hidden" name="qty" value="1" />
            )}

            {!selected && (
              <input type="hidden" name="qty" value="1" />
            )}
          </div>

          <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
            <SubmitButton
              idleLabel="Adicionar"
              pendingLabel="Adicionando..."
              className="h-11 w-full rounded-2xl text-sm font-semibold"
            />
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
