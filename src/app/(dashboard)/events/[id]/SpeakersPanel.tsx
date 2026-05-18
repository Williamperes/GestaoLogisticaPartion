"use client";

import { useState } from "react";
import { Mic, Plus, Pencil, X, Laptop, Plug, UserCog } from "lucide-react";

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
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  addEventSpeaker,
  updateEventSpeaker,
  removeEventSpeaker,
} from "@/app/(dashboard)/events/actions";
import type { EventSpeaker } from "@/lib/event-aux";

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";
const LABEL_TEXT_CLASS = "text-xs font-medium text-muted-foreground";

interface SpeakersPanelProps {
  eventId: string;
  speakers: EventSpeaker[];
  canEdit: boolean;
}

interface SpeakerFormProps {
  eventId: string;
  speaker?: EventSpeaker;
  position: number;
  onClose: () => void;
}

function SpeakerForm({ eventId, speaker, position, onClose }: SpeakerFormProps) {
  const isEdit = !!speaker;
  return (
    <form
      action={async (fd) => {
        if (isEdit) {
          await updateEventSpeaker(fd);
        } else {
          await addEventSpeaker(fd);
        }
        onClose();
      }}
      className="flex flex-col gap-4 px-6 py-6"
    >
      {isEdit ? (
        <input type="hidden" name="speakerId" value={speaker.id} />
      ) : (
        <>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="position" value={position} />
        </>
      )}

      <label className="space-y-1">
        <span className={LABEL_TEXT_CLASS}>Nome *</span>
        <input
          name="name"
          required
          autoFocus
          defaultValue={speaker?.name ?? ""}
          placeholder="Ex.: Dra. Ana Souza"
          className={INPUT_CLASS}
        />
      </label>

      <label className="space-y-1">
        <span className={LABEL_TEXT_CLASS}>Organização</span>
        <input
          name="organization"
          defaultValue={speaker?.organization ?? ""}
          placeholder="Ex.: ACME Corp"
          className={INPUT_CLASS}
        />
      </label>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Demandas técnicas</p>
        <div className="grid gap-2">
          {[
            { name: "needsMic", label: "Microfone", icon: Mic, val: speaker?.needsMic },
            { name: "needsNotebook", label: "Notebook", icon: Laptop, val: speaker?.needsNotebook },
            { name: "needsAdapter", label: "Adaptador (HDMI/USB-C)", icon: Plug, val: speaker?.needsAdapter },
            {
              name: "needsDedicatedTech",
              label: "Técnico dedicado",
              icon: UserCog,
              val: speaker?.needsDedicatedTech,
            },
          ].map((c) => (
            <label
              key={c.name}
              className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                name={c.name}
                defaultChecked={c.val ?? false}
                className="h-4 w-4 rounded border-border accent-amber-500"
              />
              <c.icon className="h-3.5 w-3.5 text-amber-600" />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="space-y-1">
        <span className={LABEL_TEXT_CLASS}>Observações</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={speaker?.notes ?? ""}
          placeholder="Idioma, restrições alimentares, transporte..."
          className={INPUT_CLASS + " resize-none"}
        />
      </label>

      <div className="mt-2 flex gap-2">
        <SubmitButton
          idleLabel={isEdit ? "Salvar alterações" : "Adicionar palestrante"}
          pendingLabel="Salvando..."
          className="h-10 flex-1 rounded-xl text-sm font-semibold"
        />
      </div>
    </form>
  );
}

export function SpeakersPanel({ eventId, speakers, canEdit }: SpeakersPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Mic className="h-4 w-4 text-amber-600" />
          Palestrantes / Artistas ({speakers.length})
        </h2>
        {canEdit && (
          <Sheet open={creating} onOpenChange={setCreating}>
            <SheetTrigger render={<Button size="sm" className="rounded-xl" />}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-full max-w-md flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
            >
              <SheetHeader className="border-b border-border px-6 py-5">
                <SheetTitle>Novo palestrante</SheetTitle>
                <SheetDescription>
                  Cadastre demandas técnicas para evitar surpresas no dia do evento.
                </SheetDescription>
              </SheetHeader>
              <SpeakerForm
                eventId={eventId}
                position={speakers.length}
                onClose={() => setCreating(false)}
              />
            </SheetContent>
          </Sheet>
        )}
      </div>

      {speakers.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          Nenhum palestrante cadastrado.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {speakers.map((s) => {
            const demands = [
              { active: s.needsMic, label: "Mic", icon: Mic },
              { active: s.needsNotebook, label: "Notebook", icon: Laptop },
              { active: s.needsAdapter, label: "Adaptador", icon: Plug },
              { active: s.needsDedicatedTech, label: "Técnico dedicado", icon: UserCog },
            ].filter((d) => d.active);

            return (
              <li key={s.id} className="group flex items-start gap-3 px-5 py-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{s.name}</span>
                    {s.organization && (
                      <span className="text-xs text-muted-foreground">· {s.organization}</span>
                    )}
                  </div>
                  {demands.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {demands.map((d) => (
                        <span
                          key={d.label}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                        >
                          <d.icon className="h-3 w-3" />
                          {d.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.notes && (
                    <p className="mt-1 text-xs text-muted-foreground">{s.notes}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Sheet
                      open={editingId === s.id}
                      onOpenChange={(v) => setEditingId(v ? s.id : null)}
                    >
                      <SheetTrigger
                        render={
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                            title="Editar"
                          />
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </SheetTrigger>
                      <SheetContent
                        side="right"
                        className="flex w-full max-w-md flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
                      >
                        <SheetHeader className="border-b border-border px-6 py-5">
                          <SheetTitle>Editar palestrante</SheetTitle>
                          <SheetDescription>
                            Atualize demandas técnicas e observações.
                          </SheetDescription>
                        </SheetHeader>
                        <SpeakerForm
                          eventId={eventId}
                          speaker={s}
                          position={s.position}
                          onClose={() => setEditingId(null)}
                        />
                      </SheetContent>
                    </Sheet>
                    <DeleteConfirmDialog
                      action={removeEventSpeaker}
                      itemId={s.id}
                      itemName={s.name}
                      itemLabel="palestrante"
                      hiddenFieldName="speakerId"
                      title="Remover palestrante"
                      description="Esta ação remove o palestrante da OS."
                      confirmLabel="Remover"
                      pendingLabel="Removendo..."
                      render={
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-muted-foreground hover:text-red-600"
                          title="Remover"
                        />
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </DeleteConfirmDialog>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
