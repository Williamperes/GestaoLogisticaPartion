"use client";

import { Plus } from "lucide-react";

import { createSubrental } from "@/app/(dashboard)/subrentals/actions";
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

const inputClass =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface EventOption {
  id: string;
  name: string;
}

export function SubrentalsToolbar({ events }: { events: EventOption[] }) {
  return (
    <div className="flex justify-end">
      <Sheet>
        <SheetTrigger render={<Button className="h-11 rounded-2xl px-4 text-sm font-semibold" />}>
          <Plus className="h-4 w-4" />
          Nova sublocação
        </SheetTrigger>

        <SheetContent
          side="right"
          className="w-full max-w-2xl border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
        >
          <SheetHeader className="border-b border-border px-6 py-5">
            <SheetTitle>Nova sublocação</SheetTitle>
            <SheetDescription>
              Registre material alugado de terceiros ou locado para parceiros, com rastreio de
              devolução.
            </SheetDescription>
          </SheetHeader>

          <form action={createSubrental} className="flex flex-1 flex-col overflow-y-auto">
            <div className="grid gap-4 px-6 py-6">
              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Tipo</span>
                <select name="direction" className={inputClass} defaultValue="inbound" required>
                  <option value="inbound">Alugado de terceiro (devolver ao dono)</option>
                  <option value="outbound">Locado para parceiro (parceiro devolve)</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Parceiro / Fornecedor</span>
                <input name="partnerName" placeholder="Ex.: Locadora Pro Som" className={inputClass} required />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Item</span>
                <input
                  name="itemDescription"
                  placeholder="Ex.: Line array d&b V8 (par)"
                  className={inputClass}
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">OS vinculada (opcional)</span>
                <select name="eventId" className={inputClass} defaultValue="">
                  <option value="">— Sem OS vinculada —</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Quantidade</span>
                  <input name="qty" type="number" min={1} defaultValue={1} className={inputClass} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Valor (R$)</span>
                  <input name="value" placeholder="0,00" className={inputClass} />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Início previsto</span>
                  <input name="expectedStart" type="date" className={inputClass} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Fim previsto</span>
                  <input name="expectedEnd" type="date" className={inputClass} />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Observações</span>
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Condições, contato, número de série…"
                  className={`${inputClass} resize-none`}
                />
              </label>
            </div>

            <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
              <SubmitButton
                idleLabel="Registrar sublocação"
                pendingLabel="Registrando..."
                className="h-11 w-full rounded-2xl text-sm font-semibold"
              />
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
