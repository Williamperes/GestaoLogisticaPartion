"use client";

import { useState } from "react";
import { Mail, Pencil, Trash2, UserRound } from "lucide-react";
import { deleteTeamMember, updateTeamMember } from "@/app/(dashboard)/team/actions";
import type { TeamMember } from "@/lib/team-shared";
import { formatPhoneNumber } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { useFormStatus } from "react-dom";

export function TeamMemberCard({ member }: { member: TeamMember }) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const initials = member.name.split(" ").map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase();

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`border rounded-xl p-5 transition-all duration-200 ${hovered ? "border-amber-500/40 bg-amber-500/5 scale-[1.01]" : "border-border bg-card"}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-500/30 flex items-center justify-center">
          <span className="text-sm font-bold text-amber-600">{initials}</span>
          <span
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
              member.available ? "bg-emerald-400" : "bg-zinc-500"
            }`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground truncate">{member.name}</p>
          <p className="text-xs text-muted-foreground">{member.role}</p>
        </div>

        <div className="flex items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="outline" size="icon-sm" className="rounded-xl" />}>
              <Pencil className="h-4 w-4" />
            </SheetTrigger>

            <SheetContent side="right" className="w-full max-w-2xl border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0">
              <SheetHeader className="border-b border-border px-6 py-5">
                <SheetTitle>Editar técnico</SheetTitle>
                <SheetDescription>
                  Atualize dados de contato, função e disponibilidade do membro da equipe.
                </SheetDescription>
              </SheetHeader>

              <form action={updateTeamMember} className="flex h-full flex-col">
                <input type="hidden" name="id" value={member.id} />

                <div className="grid gap-4 px-6 py-6">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">Nome completo</span>
                    <input
                      name="name"
                      defaultValue={member.name}
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                      required
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-foreground">Função</span>
                      <input
                        name="role"
                        defaultValue={member.role}
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
                        defaultValue={member.phone ?? ""}
                        className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-foreground">Email</span>
                      <input
                        name="email"
                        type="email"
                        defaultValue={member.email ?? ""}
                        className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                      />
                    </label>
                  </div>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">Observações</span>
                    <textarea
                      name="notes"
                      defaultValue={member.notes ?? ""}
                      rows={4}
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                    />
                  </label>

                  <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                    <input type="checkbox" name="available" defaultChecked={member.available} className="h-4 w-4 accent-[var(--color-primary)]" />
                    <span className="text-sm text-foreground">Disponível para alocação</span>
                  </label>
                </div>

                <TeamMemberCardActions memberName={member.name} />
              </form>
            </SheetContent>
          </Sheet>

          <DeleteTeamMemberButton memberId={member.id} memberName={member.name} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {member.role}
        </span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            member.available ? "bg-emerald-500/15 text-emerald-600" : "bg-zinc-500/15 text-zinc-400"
          }`}
        >
          {member.available ? "Disponível" : "Ocupado"}
        </span>
      </div>

      {hovered && (
        <div className="mt-3 space-y-1 pt-3 border-t border-border text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <UserRound className="w-3 h-3" />
            {member.phone ? formatPhoneNumber(member.phone) : "Telefone não informado"}
          </div>
          <div className="flex items-center gap-1.5">
            <Mail className="w-3 h-3" />
            {member.email ?? "Email não informado"}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamMemberCardActions({ memberName }: { memberName: string }) {
  const [submitIntent, setSubmitIntent] = useState<"save" | "delete">("save");
  const { pending } = useFormStatus();

  return (
    <div className="mt-auto flex flex-col gap-3 border-t border-border bg-background/60 px-6 py-4">
      <Button
        type="submit"
        disabled={pending}
        className="h-11 rounded-2xl text-sm font-semibold"
        onClick={() => setSubmitIntent("save")}
      >
        {pending && submitIntent === "save" ? "Salvando alterações..." : "Salvar alterações"}
      </Button>

      <Button
        type="submit"
        formAction={deleteTeamMember}
        variant="destructive"
        disabled={pending}
        className="h-11 rounded-2xl text-sm font-semibold"
        onClick={(event) => {
          setSubmitIntent("delete");

          if (!window.confirm(`Apagar o técnico ${memberName}?`)) {
            event.preventDefault();
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
        {pending && submitIntent === "delete" ? "Apagando técnico..." : "Apagar técnico"}
      </Button>
    </div>
  );
}

function DeleteTeamMemberButton({ memberId, memberName }: { memberId: string; memberName: string }) {
  return (
    <form action={deleteTeamMember}>
      <input type="hidden" name="id" value={memberId} />
      <button
        type="submit"
        className="inline-flex size-7 items-center justify-center rounded-xl border border-red-500/20 bg-background text-red-600 transition hover:border-red-500/30 hover:bg-red-500/8 disabled:pointer-events-none disabled:opacity-50"
        onClick={(event) => {
          if (!window.confirm(`Apagar o técnico ${memberName}?`)) {
            event.preventDefault();
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  );
}
