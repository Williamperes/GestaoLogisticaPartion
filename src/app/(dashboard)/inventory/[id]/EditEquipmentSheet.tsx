"use client";

import { Pencil } from "lucide-react";

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
import { updateEquipment, deactivateEquipment } from "@/app/(dashboard)/inventory/actions";
import type { Equipment, EquipmentCategory } from "@/lib/inventory";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface EditEquipmentSheetProps {
  equipment: Equipment;
  categories: EquipmentCategory[];
}

export function EditEquipmentSheet({ equipment, categories }: EditEquipmentSheetProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" className="h-9 rounded-xl px-3 text-sm font-medium" />
        }
      >
        <Pencil className="h-3.5 w-3.5" />
        Editar
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full max-w-2xl flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Editar equipamento</SheetTitle>
          <SheetDescription>Atualize os dados do equipamento.</SheetDescription>
        </SheetHeader>

        <form
          action={updateEquipment}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <input type="hidden" name="equipmentId" value={equipment.id} />

          <div className="flex flex-col gap-5 px-6 py-6">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Nome *</span>
              <input
                name="name"
                required
                defaultValue={equipment.name}
                className={INPUT_CLASS}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Marca</span>
                <input
                  name="brand"
                  defaultValue={equipment.brand ?? ""}
                  placeholder="Ex.: Yamaha"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Modelo</span>
                <input
                  name="model"
                  defaultValue={equipment.model ?? ""}
                  placeholder="Ex.: PM7"
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Categoria</span>
              <select
                name="categoryId"
                defaultValue={equipment.categoryId ?? ""}
                className={INPUT_CLASS}
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentCategoryName ? `${c.parentCategoryName} › ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-border bg-background/40 px-4 py-3">
              <input
                type="checkbox"
                name="hasVariants"
                defaultChecked={equipment.hasVariants}
                className="mt-0.5 h-4 w-4 rounded border-border accent-amber-500"
              />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Tem variantes de tamanho</p>
                <p className="text-xs text-muted-foreground">
                  Ative para equipamentos como cabos (5M, 10M, 15M) ou tamanhos
                  (P, M, G). O estoque é controlado por variante na aba abaixo.
                </p>
              </div>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Observações</span>
              <textarea
                name="notes"
                rows={3}
                defaultValue={equipment.notes ?? ""}
                className={INPUT_CLASS + " resize-none"}
              />
            </label>
          </div>

          <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
            <SubmitButton
              idleLabel="Salvar alterações"
              pendingLabel="Salvando..."
              className="h-11 w-full rounded-2xl text-sm font-semibold"
            />
          </div>
        </form>

        <div className="border-t border-border px-6 py-3">
          <form
            action={deactivateEquipment}
            onSubmit={(e) => {
              if (!confirm("Desativar este equipamento permanentemente?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={equipment.id} />
            <button type="submit" className="text-sm text-red-600 hover:underline">
              Desativar equipamento
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
