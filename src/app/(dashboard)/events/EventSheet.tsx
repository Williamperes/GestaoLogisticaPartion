"use client";

import { Plus, CalendarDays, MapPin } from "lucide-react";
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
import { createEvent } from "@/app/(dashboard)/events/actions";
import type { ClientOrganization } from "@/lib/clients";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";
const LABEL_CLASS = "space-y-1.5";
const LABEL_TEXT_CLASS = "text-sm font-medium text-foreground";

interface EventSheetProps {
  clients: ClientOrganization[];
}

export function EventSheet({ clients }: EventSheetProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold sm:w-auto" />
        }
      >
        <Plus className="h-4 w-4" />
        Nova OS
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full max-w-2xl flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Nova Ordem de Serviço</SheetTitle>
          <SheetDescription>
            Preencha os dados básicos do evento. O checklist estratégico será criado automaticamente.
          </SheetDescription>
        </SheetHeader>

        <form action={createEvent} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-5 px-6 py-6">
            {/* Nome do evento */}
            <label className={LABEL_CLASS}>
              <span className={LABEL_TEXT_CLASS}>Nome do evento / OS *</span>
              <input
                name="name"
                required
                placeholder="Ex.: Festival Aurora 2025"
                className={INPUT_CLASS}
              />
            </label>

            {/* Cliente */}
            <label className={LABEL_CLASS}>
              <span className={LABEL_TEXT_CLASS}>Cliente</span>
              <select name="clientOrganizationId" className={INPUT_CLASS}>
                <option value="">— Sem cliente vinculado —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.city ? ` · ${c.city}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {/* Datas */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={LABEL_CLASS}>
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Data de início *
                </span>
                <input name="startDate" type="date" required className={INPUT_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Data de encerramento
                </span>
                <input name="endDate" type="date" className={INPUT_CLASS} />
              </label>
            </div>

            {/* Local */}
            <div className="grid gap-4 rounded-xl border border-border bg-card/50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Local do evento
              </p>
              <label className={LABEL_CLASS}>
                <span className={LABEL_TEXT_CLASS}>Venue / Local</span>
                <input
                  name="venue"
                  placeholder="Ex.: Arena Multiuso SP"
                  className={INPUT_CLASS}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Cidade</span>
                  <input
                    name="city"
                    placeholder="Ex.: São Paulo"
                    className={INPUT_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Observações de acesso</span>
                  <input
                    name="venueNotes"
                    placeholder="Portão B, 220V trifásico..."
                    className={INPUT_CLASS}
                  />
                </label>
              </div>
            </div>

            {/* Nota sobre checklist */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <p className="text-xs text-emerald-700">
                ✓ O <strong>Checklist Estratégico</strong> padrão (5 itens) será criado automaticamente
                e deverá ser concluído antes de liberar a carga.
              </p>
            </div>
          </div>

          <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
            <SubmitButton
              idleLabel="Criar Ordem de Serviço"
              pendingLabel="Criando OS..."
              className="h-11 w-full rounded-2xl text-sm font-semibold"
            />
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
