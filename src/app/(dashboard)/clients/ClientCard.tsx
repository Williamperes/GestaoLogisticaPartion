"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Building2, Mail, MapPin, Pencil, Phone, Trash2, UserRound, Users } from "lucide-react";
import { updateClient, deleteClient } from "@/app/(dashboard)/clients/actions";
import type { ClientOrganization } from "@/lib/clients";
import { formatPhoneNumber } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/PhoneInput";

export function ClientCard({ client }: { client: ClientOrganization }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="group rounded-[28px] bg-card p-5 ring-1 ring-foreground/10 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(17,17,17,0.08)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Cliente
          </span>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={<Button variant="outline" size="icon-sm" className="rounded-xl" />}
            >
              <Pencil className="h-4 w-4" />
            </SheetTrigger>

            <SheetContent side="right" className="w-full max-w-2xl border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0">
              <SheetHeader className="border-b border-border px-6 py-5">
                <SheetTitle>Editar cliente</SheetTitle>
                <SheetDescription>
                  Atualize os dados cadastrais do cliente ou remova o registro se ele não for mais utilizado.
                </SheetDescription>
              </SheetHeader>

              <form action={updateClient} className="flex h-full flex-col">
                <input type="hidden" name="id" value={client.id} />

                <div className="grid gap-4 px-6 py-6">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">Nome da empresa</span>
                    <input
                      name="name"
                      defaultValue={client.name}
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                      required
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">Contato principal</span>
                    <input
                      name="contactName"
                      defaultValue={client.contactName ?? ""}
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-foreground">Email</span>
                      <input
                        name="contactEmail"
                        type="email"
                        defaultValue={client.contactEmail ?? ""}
                        className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-foreground">Telefone</span>
                      <PhoneInput
                        name="contactPhone"
                        defaultValue={client.contactPhone ?? ""}
                        className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                      />
                    </label>
                  </div>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">Endereço</span>
                    <input
                      name="address"
                      defaultValue={client.address ?? ""}
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">Cidade</span>
                    <input
                      name="city"
                      defaultValue={client.city ?? ""}
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                    />
                  </label>
                </div>

                <ClientCardActions />
              </form>
            </SheetContent>
          </Sheet>

          <DeleteClientButton clientId={client.id} clientName={client.name} />
        </div>
      </div>

      <h2 className="font-semibold text-foreground">{client.name}</h2>
      <p className="mt-1 min-h-10 text-sm text-muted-foreground">
        {client.address || client.city || "Endereço não informado"}
      </p>

      <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <span>{client.slug ?? "Sem slug"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <span>{client.contactEmail ?? "Email não informado"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          <span>{client.contactPhone ? formatPhoneNumber(client.contactPhone) : "Telefone não informado"}</span>
        </div>
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-primary" />
          <span>{client.contactName ?? "Contato principal não informado"}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span>{client.city ?? "Cidade não informada"}</span>
        </div>
      </div>
    </div>
  );
}

function DeleteClientButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  return (
    <form action={deleteClient}>
      <input type="hidden" name="id" value={clientId} />
      <button
        type="submit"
        className="inline-flex size-7 items-center justify-center rounded-xl border border-red-500/20 bg-background text-red-600 transition hover:border-red-500/30 hover:bg-red-500/8 disabled:pointer-events-none disabled:opacity-50"
        onClick={(event) => {
          if (!window.confirm(`Apagar o cliente ${clientName}?`)) {
            event.preventDefault();
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  );
}

function ClientCardActions() {
  const { pending } = useFormStatus();

  return (
    <div className="mt-auto flex flex-col gap-3 border-t border-border bg-background/60 px-6 py-4">
      <Button
        type="submit"
        disabled={pending}
        className="h-11 rounded-2xl text-sm font-semibold"
      >
        {pending ? "Salvando alterações..." : "Salvar alterações"}
      </Button>
    </div>
  );
}
