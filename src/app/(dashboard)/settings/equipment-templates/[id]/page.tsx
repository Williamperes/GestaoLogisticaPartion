import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";

import { getCurrentUserContext } from "@/lib/auth/session";
import { listEquipment } from "@/lib/inventory";
import { getEquipmentTemplateWithItems } from "@/lib/equipmentTemplates";

import { TemplatesToastSync } from "../TemplatesToastSync";
import { addEquipmentTemplateItem, removeEquipmentTemplateItem } from "../actions";

const inputClass =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

export default async function EquipmentTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (!context.role || !["super_admin", "admin", "operations"].includes(context.role)) {
    redirect("/dashboard");
  }

  const template = await getEquipmentTemplateWithItems(id);
  if (!template) notFound();

  const organizationId = context.primaryOrganization?.id;
  const equipment = organizationId ? await listEquipment(organizationId) : [];

  return (
    <div className="space-y-5">
      <TemplatesToastSync />
      <Link
        href="/settings/equipment-templates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Templates
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{template.name}</h1>
        {template.notes ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{template.notes}</p>
        ) : null}
      </div>

      {/* Adicionar item */}
      <form
        action={addEquipmentTemplateItem}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="templateId" value={template.id} />
        <label className="flex-1 space-y-2">
          <span className="text-sm font-medium">Equipamento</span>
          <select name="equipment" className={inputClass} required defaultValue="">
            <option value="" disabled>
              Selecione…
            </option>
            {equipment.map((e) =>
              e.hasVariants && e.variants && e.variants.length > 0 ? (
                e.variants.map((v) => (
                  <option key={`${e.id}__${v.id}`} value={`${e.id}__${v.id}`}>
                    {e.name} · {v.label}
                  </option>
                ))
              ) : (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              )
            )}
          </select>
        </label>
        <label className="w-28 space-y-2">
          <span className="text-sm font-medium">Qtd</span>
          <input name="qty" type="number" min={1} defaultValue={1} className={inputClass} />
        </label>
        <button
          type="submit"
          className="h-12 shrink-0 rounded-2xl bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90"
        >
          Adicionar
        </button>
      </form>

      {/* Itens */}
      {template.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum item no template ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {template.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm"
            >
              <span className="min-w-0 truncate">
                {item.equipmentName}
                {item.variantLabel ? ` · ${item.variantLabel}` : ""}
                <span className="ml-2 text-xs text-muted-foreground">×{item.qty}</span>
              </span>
              <form action={removeEquipmentTemplateItem}>
                <input type="hidden" name="templateId" value={template.id} />
                <input type="hidden" name="itemId" value={item.id} />
                <button
                  type="submit"
                  aria-label="Remover item"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
