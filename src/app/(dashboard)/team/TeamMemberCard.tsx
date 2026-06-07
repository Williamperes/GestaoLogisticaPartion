"use client";

import { useState } from "react";
import { KeyRound, Mail, MapPin, Pencil, ShieldPlus, Trash2, UserRound } from "lucide-react";
import {
  deleteTeamMember,
  provisionTeamMemberAccess,
  resetTeamMemberPassword,
  updateTeamMember,
} from "@/app/(dashboard)/team/actions";
import type { TeamMember } from "@/lib/team-shared";
import { formatPhoneNumber } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { useFormStatus } from "react-dom";

function generatePassword(length = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const cryptoObj =
    typeof window !== "undefined" && window.crypto ? window.crypto : null;
  let out = "";
  if (cryptoObj) {
    const buf = new Uint32Array(length);
    cryptoObj.getRandomValues(buf);
    for (let i = 0; i < length; i++) out += chars[buf[i] % chars.length];
  } else {
    for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function TeamMemberCard({
  member,
  canManageAccess,
}: {
  member: TeamMember;
  canManageAccess: boolean;
}) {
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

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-foreground">Cidade</span>
                      <input
                        name="city"
                        defaultValue={member.city ?? ""}
                        placeholder="Ex.: São Paulo"
                        className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
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

                  <input type="hidden" name="available" value="on" />
                </div>

                <TeamMemberCardActions memberId={member.id} memberName={member.name} />
              </form>
            </SheetContent>
          </Sheet>

          {canManageAccess && member.userId && (
            <ResetPasswordButton memberId={member.id} memberName={member.name} />
          )}

          {canManageAccess && !member.userId && (
            <ProvisionAccessButton
              memberId={member.id}
              memberName={member.name}
              memberEmail={member.email}
            />
          )}

          <DeleteTeamMemberButton memberId={member.id} memberName={member.name} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {member.role}
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
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3" />
            {member.city ?? "Cidade não informada"}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamMemberCardActions({ memberId, memberName }: { memberId: string; memberName: string }) {
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

      <DeleteConfirmDialog
        action={deleteTeamMember}
        itemId={memberId}
        itemName={memberName}
        itemLabel="técnico"
        pendingLabel="Apagando técnico..."
        render={
          <Button type="button" variant="destructive" className="h-11 rounded-2xl text-sm font-semibold" />
        }
      >
        <Trash2 className="h-4 w-4" />
        Apagar técnico
      </DeleteConfirmDialog>
    </div>
  );
}

function ResetPasswordButton({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            title="Redefinir senha"
            className="inline-flex size-7 items-center justify-center rounded-xl border border-amber-500/30 bg-background text-amber-600 transition hover:border-amber-500/40 hover:bg-amber-500/8"
          />
        }
      >
        <KeyRound className="h-4 w-4" />
      </SheetTrigger>

      <SheetContent side="right" className="w-full max-w-md border-l border-border bg-background p-0">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Redefinir senha</SheetTitle>
          <SheetDescription>
            Gera nova senha para <strong>{memberName}</strong>. Anote — será exibida apenas uma vez.
          </SheetDescription>
        </SheetHeader>

        <form action={resetTeamMemberPassword} className="space-y-4 px-6 py-6">
          <input type="hidden" name="id" value={memberId} />

          <label className="space-y-2 block">
            <span className="text-sm font-medium text-foreground">Nova senha</span>
            <div className="flex gap-2">
              <input
                name="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                placeholder="Mínimo 8 caracteres"
                className="flex-1 rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
              />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="rounded-2xl border border-border bg-background px-3 text-xs font-semibold hover:bg-muted"
              >
                Gerar
              </button>
            </div>
          </label>

          <Button type="submit" className="h-11 w-full rounded-2xl text-sm font-semibold">
            Redefinir senha
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ProvisionAccessButton({
  memberId,
  memberName,
  memberEmail,
}: {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            title="Criar acesso ao app"
            className="inline-flex size-7 items-center justify-center rounded-xl border border-emerald-500/30 bg-background text-emerald-600 transition hover:border-emerald-500/40 hover:bg-emerald-500/8"
          />
        }
      >
        <ShieldPlus className="h-4 w-4" />
      </SheetTrigger>

      <SheetContent side="right" className="w-full max-w-md border-l border-border bg-background p-0">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Criar acesso ao app</SheetTitle>
          <SheetDescription>
            Gera login para <strong>{memberName}</strong>. Anote a senha — será exibida apenas uma vez.
          </SheetDescription>
        </SheetHeader>

        {memberEmail ? (
          <form action={provisionTeamMemberAccess} className="space-y-4 px-6 py-6">
            <input type="hidden" name="id" value={memberId} />

            <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Email de acesso: </span>
              <strong className="text-foreground">{memberEmail}</strong>
            </div>

            <label className="space-y-2 block">
              <span className="text-sm font-medium text-foreground">Senha temporária</span>
              <div className="flex gap-2">
                <input
                  name="password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  placeholder="Mínimo 8 caracteres"
                  className="flex-1 rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                />
                <button
                  type="button"
                  onClick={() => setPassword(generatePassword())}
                  className="rounded-2xl border border-border bg-background px-3 text-xs font-semibold hover:bg-muted"
                >
                  Gerar
                </button>
              </div>
            </label>

            <label className="space-y-2 block">
              <span className="text-sm font-medium text-foreground">Permissão</span>
              <select
                name="access_role"
                defaultValue="warehouse"
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
              >
                <option value="warehouse">Almoxarife (bipa carregar/retornar)</option>
                <option value="operations">Operações (acesso completo de OS)</option>
              </select>
            </label>

            <Button type="submit" className="h-11 w-full rounded-2xl text-sm font-semibold">
              Criar acesso
            </Button>
          </form>
        ) : (
          <div className="px-6 py-6 text-sm text-muted-foreground">
            Cadastre um email para <strong>{memberName}</strong> na edição do técnico antes de criar o acesso.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DeleteTeamMemberButton({ memberId, memberName }: { memberId: string; memberName: string }) {
  return (
    <DeleteConfirmDialog
      action={deleteTeamMember}
      itemId={memberId}
      itemName={memberName}
      itemLabel="técnico"
      pendingLabel="Apagando técnico..."
      render={
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-xl border border-red-500/20 bg-background text-red-600 transition hover:border-red-500/30 hover:bg-red-500/8"
        />
      }
    >
        <Trash2 className="h-4 w-4" />
    </DeleteConfirmDialog>
  );
}
