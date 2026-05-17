"use client";

import { Package, Plus } from "lucide-react";

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
import { createEquipment } from "@/app/(dashboard)/inventory/actions";
import type { EquipmentCategory } from "@/lib/inventory";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";
const LABEL_CLASS = "space-y-1.5";
const LABEL_TEXT_CLASS = "text-sm font-medium text-foreground";

interface InventorySheetProps {
  categories: EquipmentCategory[];
}

export function InventorySheet({ categories }: InventorySheetProps) {
  return (
    <Sheet>
      <SheetTrigger render={<Button className="h-10 rounded-xl px-4 text-sm font-semibold" />}>
        <Plus className="h-4 w-4" />
        Novo Item
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full max-w-2xl flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Cadastrar equipamento</SheetTitle>
          <SheetDescription>
            Cadastre um item serializado com número de série e identificação individual.
          </SheetDescription>
        </SheetHeader>

        <form action={createEquipment} className="flex flex-1 flex-col overflow-y-auto">
          <input type="hidden" name="type" value="serialized" />

          <div className="flex flex-col gap-5 px-6 py-6">
            <div className="grid gap-4">
              <label className={LABEL_CLASS}>
                <span className={LABEL_TEXT_CLASS}>Nome do equipamento *</span>
                <input
                  name="name"
                  required
                  placeholder="Ex.: Mesa Yamaha PM7"
                  className={INPUT_CLASS}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Marca</span>
                  <input name="brand" placeholder="Ex.: Yamaha" className={INPUT_CLASS} />
                </label>
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Modelo</span>
                  <input name="model" placeholder="Ex.: PM7" className={INPUT_CLASS} />
                </label>
              </div>

              <label className={LABEL_CLASS}>
                <span className={LABEL_TEXT_CLASS}>Categoria</span>
                <select name="categoryId" className={INPUT_CLASS}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                <Package className="h-3.5 w-3.5" />
                Identificação da unidade
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Número de série *</span>
                  <input
                    name="serial"
                    required
                    placeholder="Ex.: PM7-0042"
                    className={INPUT_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Nº Patrimônio</span>
                  <input
                    name="patrimony"
                    placeholder="Ex.: PAT-2023-042"
                    className={INPUT_CLASS}
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Data de aquisição</span>
                  <input name="purchaseDate" type="date" className={INPUT_CLASS} />
                </label>
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Valor de aquisição (R$)</span>
                  <input
                    name="purchaseValue"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    className={INPUT_CLASS}
                  />
                </label>
              </div>
            </div>

            <label className={LABEL_CLASS}>
              <span className={LABEL_TEXT_CLASS}>Observações</span>
              <textarea
                name="notes"
                rows={3}
                placeholder="Informações adicionais sobre o equipamento..."
                className={INPUT_CLASS + " resize-none"}
              />
            </label>
          </div>

          <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
            <SubmitButton
              idleLabel="Cadastrar equipamento"
              pendingLabel="Salvando..."
              className="h-11 w-full rounded-2xl text-sm font-semibold"
            />
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
