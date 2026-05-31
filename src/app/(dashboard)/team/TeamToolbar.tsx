"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { createTeamMember } from "@/app/(dashboard)/team/actions";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PhoneInput } from "@/components/ui/PhoneInput";

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

export function TeamToolbar({ canProvision }: { canProvision: boolean }) {
  const [provisionAccess, setProvisionAccess] = useState(false);
  const [password, setPassword] = useState("");

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

          <form action={createTeamMember} className="flex h-full min-h-0 flex-col">
            <div className="grid flex-1 min-h-0 gap-4 overflow-y-auto px-6 py-6">
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

              {canProvision && (
                <fieldset className="rounded-2xl border border-border bg-background/40 p-4 space-y-3">
                  <label className="flex items-center gap-3 text-sm font-medium">
                    <input
                      type="checkbox"
                      name="provision_access"
                      checked={provisionAccess}
                      onChange={(e) => setProvisionAccess(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    Criar acesso ao app
                  </label>

                  {provisionAccess && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-2 sm:col-span-2">
                        <span className="text-sm font-medium text-foreground">Senha temporária</span>
                        <div className="flex gap-2">
                          <input
                            name="password"
                            type="text"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            minLength={8}
                            required={provisionAccess}
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
                        <p className="text-xs text-muted-foreground">
                          Anote agora — será exibida uma vez no aviso de sucesso.
                        </p>
                      </label>

                      <label className="space-y-2 sm:col-span-2">
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
                    </div>
                  )}
                </fieldset>
              )}
            </div>

            <div className="shrink-0 border-t border-border bg-background/60 px-6 py-4">
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
