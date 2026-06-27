import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Trash2 } from "lucide-react";

import { getCurrentUserContext } from "@/lib/auth/session";
import { listEquipmentTemplates } from "@/lib/equipmentTemplates";

import { TemplatesToastSync } from "./TemplatesToastSync";
import { createEquipmentTemplate, deleteEquipmentTemplate } from "./actions";

const inputClass =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

export default async function EquipmentTemplatesPage() {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (!context.role || !["super_admin", "admin", "operations"].includes(context.role)) {
    redirect("/dashboard");
  }

  const organizationId = context.primaryOrganization?.id;
  const templates = organizationId ? await listEquipmentTemplates(organizationId) : [];

  return (
    <div className="space-y-5">
      <TemplatesToastSync />
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Configurações
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Templates de equipamento</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Monte presets por tipo de evento e gere a lista de equipamentos de uma OS com um clique.
        </p>
      </div>

      <form
        action={createEquipmentTemplate}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end"
      >
        <label className="flex-1 space-y-2">
          <span className="text-sm font-medium">Nome do template</span>
          <input name="name" placeholder="Ex.: Show médio porte" className={inputClass} required />
        </label>
        <label className="flex-1 space-y-2">
          <span className="text-sm font-medium">Observações</span>
          <input name="notes" placeholder="Opcional" className={inputClass} />
        </label>
        <button
          type="submit"
          className="h-12 shrink-0 rounded-2xl bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90"
        >
          Criar template
        </button>
      </form>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <ClipboardList className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">Nenhum template criado.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm"
            >
              <Link href={`/settings/equipment-templates/${t.id}`} className="min-w-0 flex-1">
                <span className="font-medium hover:text-amber-600">{t.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {t.itemCount} {t.itemCount === 1 ? "item" : "itens"}
                </span>
                {t.notes ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.notes}</p>
                ) : null}
              </Link>
              <form action={deleteEquipmentTemplate}>
                <input type="hidden" name="id" value={t.id} />
                <button
                  type="submit"
                  aria-label="Remover template"
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
