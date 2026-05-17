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
import { createTemplate } from "@/app/(dashboard)/settings/checklist-templates/actions";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

export function CreateTemplateButton() {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button className="flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold" />
        }
      >
        <Plus className="h-4 w-4" />
        Novo template
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Novo template</SheetTitle>
          <SheetDescription>
            Crie um template e depois adicione os itens em cada seção.
          </SheetDescription>
        </SheetHeader>

        <form action={createTemplate} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-5 px-6 py-6">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Nome *</span>
              <input
                name="name"
                required
                placeholder="Ex.: Festival corporativo"
                className={INPUT_CLASS}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Descrição</span>
              <textarea
                name="description"
                rows={3}
                placeholder="Para que esse template é usado?"
                className={INPUT_CLASS + " resize-none"}
              />
            </label>

            <label className="flex items-center gap-2.5 rounded-xl border border-border bg-card/50 px-4 py-3">
              <input type="checkbox" name="isDefault" className="h-4 w-4 accent-amber-500" />
              <span className="text-sm">
                Usar como template padrão para novas OS
              </span>
            </label>
          </div>

          <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
            <SubmitButton
              idleLabel="Criar template"
              pendingLabel="Criando..."
              className="h-11 w-full rounded-2xl text-sm font-semibold"
            />
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
