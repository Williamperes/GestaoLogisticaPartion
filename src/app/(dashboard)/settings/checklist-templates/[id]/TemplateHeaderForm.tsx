"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { SubmitButton } from "@/components/ui/SubmitButton";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  updateTemplate,
  deleteTemplate,
} from "@/app/(dashboard)/settings/checklist-templates/actions";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface TemplateHeaderFormProps {
  template: {
    id: string;
    name: string;
    description: string | null;
    isDefault: boolean;
  };
}

export function TemplateHeaderForm({ template }: TemplateHeaderFormProps) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [isDefault, setIsDefault] = useState(template.isDefault);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <form action={updateTemplate} className="space-y-4">
        <input type="hidden" name="templateId" value={template.id} />

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Nome *</span>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Descrição</span>
          <textarea
            name="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT_CLASS + " resize-none"}
          />
        </label>

        <label className="flex items-center gap-2.5 rounded-xl border border-border bg-background/60 px-4 py-3">
          <input
            type="checkbox"
            name="isDefault"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 accent-amber-500"
          />
          <span className="text-sm">Template padrão para novas OS</span>
        </label>

        <div className="flex items-center justify-between gap-2 pt-2">
          <DeleteConfirmDialog
            action={deleteTemplate}
            itemId={template.id}
            itemName={template.name}
            itemLabel="template"
            hiddenFieldName="templateId"
            title="Excluir template"
            description="Esta ação remove o template e todos os seus itens. OS já criadas mantêm seu checklist."
            confirmLabel="Excluir"
            pendingLabel="Excluindo..."
            render={
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10"
              />
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir template
          </DeleteConfirmDialog>

          <SubmitButton
            idleLabel="Salvar alterações"
            pendingLabel="Salvando..."
            className="h-9 rounded-xl px-4 text-sm font-semibold"
          />
        </div>
      </form>
    </div>
  );
}
