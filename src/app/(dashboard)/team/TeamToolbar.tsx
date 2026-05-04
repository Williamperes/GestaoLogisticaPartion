"use client";

import { Plus } from "lucide-react";
import { createTeamMember } from "@/app/(dashboard)/team/actions";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PhoneInput } from "@/components/ui/PhoneInput";

export function TeamToolbar() {
  return (
    <div className="flex justify-end">
      <Sheet>
        <SheetTrigger
          render={<Button className="h-11 rounded-2xl px-4 text-sm font-semibold" />}
        >
          <Plus className="h-4 w-4" />
          Novo Técnico
        </SheetTrigger>

        <SheetContent side="right" className="w-full max-w-2xl border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0">
          <SheetHeader className="border-b border-border px-6 py-5">
            <SheetTitle>Novo técnico</SheetTitle>
            <SheetDescription>
              Cadastre o profissional da equipe operacional para futura alocação em eventos.
            </SheetDescription>
          </SheetHeader>

          <form action={createTeamMember} className="flex h-full flex-col">
            <div className="grid gap-4 px-6 py-6">
              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Nome completo</span>
                <input
                  name="name"
                  placeholder="Ex.: Diego Almeida"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                  required
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Função</span>
                  <input
                    name="role"
                    placeholder="Ex.: Operador FOH"
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                    required
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Telefone</span>
                  <PhoneInput
                    name="phone"
                    placeholder="(11) 99999-9999"
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Email</span>
                  <input
                    name="email"
                    type="email"
                    placeholder="tecnico@partion.com"
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Observações</span>
                <textarea
                  name="notes"
                  placeholder="Certificações, disponibilidade específica, observações operacionais..."
                  rows={4}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                />
              </label>

              <input type="hidden" name="available" value="on" />
            </div>

            <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
              <SubmitButton
                idleLabel="Salvar técnico"
                pendingLabel="Salvando técnico..."
                className="h-11 w-full rounded-2xl text-sm font-semibold"
              />
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
