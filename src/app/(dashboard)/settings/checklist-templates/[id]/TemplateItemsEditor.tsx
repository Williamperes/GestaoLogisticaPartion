"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  addTemplateItem,
  updateTemplateItem,
  deleteTemplateItem,
} from "@/app/(dashboard)/settings/checklist-templates/actions";
import type { ChecklistTemplateItem, ChecklistSection } from "@/lib/checklist-templates";

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface TemplateItemsEditorProps {
  templateId: string;
  section: ChecklistSection;
  sectionLabel: string;
  items: ChecklistTemplateItem[];
}

export function TemplateItemsEditor({
  templateId,
  section,
  sectionLabel,
  items,
}: TemplateItemsEditorProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            {sectionLabel}
          </h2>
          <p className="text-[10px] text-muted-foreground/70">
            {items.length} {items.length === 1 ? "item" : "itens"}
          </p>
        </div>
        <Button
          size="sm"
          className="rounded-xl"
          onClick={() => {
            setCreating(true);
            setEditingId(null);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Item
        </Button>
      </div>

      {creating && (
        <form
          action={async (fd) => {
            await addTemplateItem(fd);
            setCreating(false);
          }}
          className="flex flex-col gap-3 border-b border-border bg-muted/30 px-5 py-3 sm:flex-row sm:items-center"
        >
          <input type="hidden" name="templateId" value={templateId} />
          <input type="hidden" name="section" value={section} />
          <input
            name="label"
            required
            autoFocus
            placeholder="Texto do item"
            className={INPUT_CLASS + " flex-1"}
          />
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              name="required"
              defaultChecked
              className="h-4 w-4 accent-amber-500"
            />
            Obrigatório
          </label>
          <div className="flex items-center gap-2">
            <SubmitButton
              idleLabel="Adicionar"
              pendingLabel="..."
              className="h-8 rounded-xl px-4 text-xs"
            />
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      {items.length === 0 && !creating ? (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          Nenhum item nessa seção.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="group px-5 py-3">
              {editingId === item.id ? (
                <form
                  action={async (fd) => {
                    await updateTemplateItem(fd);
                    setEditingId(null);
                  }}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingId(null);
                  }}
                >
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="templateId" value={templateId} />
                  <input type="hidden" name="section" value={item.section} />
                  <input
                    name="label"
                    required
                    autoFocus
                    defaultValue={item.label}
                    className={INPUT_CLASS + " flex-1"}
                  />
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      name="required"
                      defaultChecked={item.required}
                      className="h-4 w-4 accent-amber-500"
                    />
                    Obrigatório
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="submit"
                      className="rounded-md p-1 text-emerald-600 hover:text-emerald-700"
                      title="Salvar"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm">{item.label}</span>
                  {!item.required && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Opcional
                    </span>
                  )}
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(item.id);
                        setCreating(false);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <DeleteConfirmDialog
                      action={deleteTemplateItem}
                      itemId={item.id}
                      itemName={item.label}
                      itemLabel="item"
                      hiddenFieldName="itemId"
                      extraFields={{ templateId }}
                      title="Remover item"
                      description="O item será removido do template. OS já criadas mantêm seu checklist."
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
                      <Trash2 className="h-3.5 w-3.5" />
                    </DeleteConfirmDialog>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
