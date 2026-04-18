"use client";

import { Plus, Search } from "lucide-react";
import { createClient } from "@/app/(dashboard)/clients/actions";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function ClientsToolbar({ defaultQuery }: { defaultQuery: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <form className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_10px_24px_rgba(17,17,17,0.04)]">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          name="q"
          defaultValue={defaultQuery}
          placeholder="Buscar por nome, cidade, contato ou email..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </form>

      <Sheet>
        <SheetTrigger
          render={
            <Button className="h-11 rounded-2xl px-4 text-sm font-semibold" />
          }
        >
          <Plus className="h-4 w-4" />
          Novo Cliente
        </SheetTrigger>

        <SheetContent side="right" className="w-full max-w-2xl border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0">
          <SheetHeader className="border-b border-border px-6 py-5">
            <SheetTitle>Novo cliente</SheetTitle>
            <SheetDescription>
              Cadastre a empresa cliente e os dados principais de contato para começar a vincular eventos.
            </SheetDescription>
          </SheetHeader>

          <form action={createClient} className="flex h-full flex-col">
            <div className="grid gap-4 px-6 py-6">
              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Nome da empresa</span>
                <input
                  name="name"
                  placeholder="Ex.: Produtora Neon"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Contato principal</span>
                <input
                  name="contactName"
                  placeholder="Nome da pessoa responsável"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Email</span>
                  <input
                    name="contactEmail"
                    type="email"
                    placeholder="contato@cliente.com"
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">Telefone</span>
                  <PhoneInput
                    name="contactPhone"
                    placeholder="(11) 99999-9999"
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Endereço</span>
                <input
                  name="address"
                  placeholder="Rua, número, complemento, bairro"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Cidade</span>
                <input
                  name="city"
                  placeholder="São Paulo"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                />
              </label>
            </div>

            <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
              <SubmitButton
                idleLabel="Salvar cliente"
                pendingLabel="Salvando cliente..."
                className="h-11 w-full rounded-2xl text-sm font-semibold"
              />
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
