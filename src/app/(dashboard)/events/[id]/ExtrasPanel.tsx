"use client";

import { useState } from "react";
import { Boxes, Plus, Pencil, X } from "lucide-react";

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
  addEventExtra,
  updateEventExtra,
  removeEventExtra,
} from "@/app/(dashboard)/events/actions";
import {
  EVENT_EXTRA_KIND_LABELS,
  type EventExtra,
  type EventExtraKind,
} from "@/lib/event-aux";

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";
const LABEL_TEXT_CLASS = "text-xs font-medium text-muted-foreground";

const KIND_ORDER: EventExtraKind[] = [
  "generator",
  "box_truss",
  "tv",
  "projector",
  "stage",
  "other",
];

interface ExtrasPanelProps {
  eventId: string;
  extras: EventExtra[];
  canEdit: boolean;
}

interface ExtraFormProps {
  eventId: string;
  extra?: EventExtra;
  position: number;
  onClose: () => void;
}

function formatBRL(cents: number | null): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function ExtraForm({ eventId, extra, position, onClose }: ExtraFormProps) {
  const isEdit = !!extra;
  return (
    <form
      action={async (fd) => {
        if (isEdit) {
          await updateEventExtra(fd);
        } else {
          await addEventExtra(fd);
        }
        onClose();
      }}
      className="flex flex-col gap-4 px-6 py-6"
    >
      {isEdit ? (
        <input type="hidden" name="extraId" value={extra.id} />
      ) : (
        <>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="position" value={position} />
        </>
      )}

      <label className="space-y-1">
        <span className={LABEL_TEXT_CLASS}>Tipo *</span>
        <select
          name="kind"
          required
          defaultValue={extra?.kind ?? "generator"}
          className={INPUT_CLASS}
        >
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {EVENT_EXTRA_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className={LABEL_TEXT_CLASS}>Descrição *</span>
        <input
          name="description"
          required
          autoFocus
          defaultValue={extra?.description ?? ""}
          placeholder="Ex.: Gerador 60kVA silenciado"
          className={INPUT_CLASS}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={LABEL_TEXT_CLASS}>Quantidade</span>
          <input
            name="qty"
            type="number"
            min={1}
            defaultValue={extra?.qty ?? 1}
            className={INPUT_CLASS}
          />
        </label>

        <label className="space-y-1">
          <span className={LABEL_TEXT_CLASS}>Valor unitário (R$)</span>
          <input
            name="unitPrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue={
              extra?.unitPriceCents != null ? (extra.unitPriceCents / 100).toFixed(2) : ""
            }
            placeholder="0,00"
            className={INPUT_CLASS}
          />
        </label>
      </div>

      <label className="space-y-1">
        <span className={LABEL_TEXT_CLASS}>Fornecedor</span>
        <input
          name="supplier"
          defaultValue={extra?.supplier ?? ""}
          placeholder="Ex.: GeradoresRJ"
          className={INPUT_CLASS}
        />
      </label>

      <label className="space-y-1">
        <span className={LABEL_TEXT_CLASS}>Observações</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={extra?.notes ?? ""}
          placeholder="Horário de entrega, retirada..."
          className={INPUT_CLASS + " resize-none"}
        />
      </label>

      <SubmitButton
        idleLabel={isEdit ? "Salvar alterações" : "Adicionar extra"}
        pendingLabel="Salvando..."
        className="h-10 rounded-xl text-sm font-semibold"
      />
    </form>
  );
}

export function ExtrasPanel({ eventId, extras, canEdit }: ExtrasPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const totalCents = extras.reduce((sum, x) => {
    if (x.unitPriceCents == null) return sum;
    return sum + x.unitPriceCents * x.qty;
  }, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Boxes className="h-4 w-4 text-amber-600" />
          Extras / Terceirizados ({extras.length})
          {totalCents > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              · Total {formatBRL(totalCents)}
            </span>
          )}
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
                <SheetTitle>Novo extra</SheetTitle>
                <SheetDescription>
                  Item contratado de terceiro (gerador, palco, projetor etc.).
                </SheetDescription>
              </SheetHeader>
              <ExtraForm
                eventId={eventId}
                position={extras.length}
                onClose={() => setCreating(false)}
              />
            </SheetContent>
          </Sheet>
        )}
      </div>

      {extras.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          Nenhum item extra cadastrado.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tipo
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Descrição
              </th>
              <th className="hidden px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                Fornecedor
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Qtd
              </th>
              <th className="hidden px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">
                Valor un.
              </th>
              {canEdit && <th className="w-20 px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {extras.map((x) => (
              <tr key={x.id} className="group">
                <td className="px-5 py-3">
                  <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                    {EVENT_EXTRA_KIND_LABELS[x.kind]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium">{x.description}</span>
                  {x.notes && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{x.notes}</p>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                  {x.supplier ?? "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">{x.qty}</td>
                <td className="hidden px-4 py-3 text-right font-mono text-xs sm:table-cell">
                  {formatBRL(x.unitPriceCents)}
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Sheet
                        open={editingId === x.id}
                        onOpenChange={(v) => setEditingId(v ? x.id : null)}
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
                            <SheetTitle>Editar extra</SheetTitle>
                            <SheetDescription>
                              Atualize tipo, fornecedor e valores.
                            </SheetDescription>
                          </SheetHeader>
                          <ExtraForm
                            eventId={eventId}
                            extra={x}
                            position={x.position}
                            onClose={() => setEditingId(null)}
                          />
                        </SheetContent>
                      </Sheet>
                      <DeleteConfirmDialog
                        action={removeEventExtra}
                        itemId={x.id}
                        itemName={x.description}
                        itemLabel="extra"
                        hiddenFieldName="extraId"
                        title="Remover extra"
                        description="Esta ação remove o item da OS."
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
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
