"use client";

import { Sparkles } from "lucide-react";

import { applyEquipmentTemplate } from "@/app/(dashboard)/events/actions";

interface TemplateOption {
  id: string;
  name: string;
  itemCount: number;
}

export function ApplyTemplateButton({
  eventId,
  templates,
}: {
  eventId: string;
  templates: TemplateOption[];
}) {
  if (templates.length === 0) return null;

  return (
    <form action={applyEquipmentTemplate} className="flex items-center gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <Sparkles className="h-4 w-4 text-amber-500" />
      <select
        name="templateId"
        defaultValue=""
        required
        className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary/50"
      >
        <option value="" disabled>
          Gerar de template…
        </option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.itemCount})
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="h-9 rounded-lg bg-foreground px-3 text-xs font-semibold text-background transition hover:opacity-90"
      >
        Gerar
      </button>
    </form>
  );
}
