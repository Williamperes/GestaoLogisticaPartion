import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/auth/session";
import {
  getChecklistTemplate,
  SECTION_LABELS,
  SECTION_ORDER,
  type ChecklistSection,
} from "@/lib/checklist-templates";

import { TemplateHeaderForm } from "@/app/(dashboard)/settings/checklist-templates/[id]/TemplateHeaderForm";
import { TemplateItemsEditor } from "@/app/(dashboard)/settings/checklist-templates/[id]/TemplateItemsEditor";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}

export default async function TemplateDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { success, error: errorMsg } = await searchParams;

  const context = await getCurrentUserContext();
  const canWrite = ["super_admin", "admin", "operations"].includes(context?.role ?? "");
  if (!canWrite) redirect("/dashboard");

  const organizationId = context?.primaryOrganization?.id;
  const template = await getChecklistTemplate(id);

  if (!template || !organizationId || template.organizationId !== organizationId) {
    notFound();
  }

  const items = template.items ?? [];
  type Item = (typeof items)[number];
  const itemsBySection: Record<ChecklistSection, Item[]> = {
    strategic: [],
    commercial: [],
    operational: [],
  };
  for (const item of items) {
    itemsBySection[item.section].push(item);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href="/settings/checklist-templates"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Templates de Checklist
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{template.name}</h1>
        {template.isDefault && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            Template padrão
          </p>
        )}
      </div>

      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-600">
          {decodeURIComponent(success)}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-600">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      <TemplateHeaderForm
        template={{
          id: template.id,
          name: template.name,
          description: template.description,
          isDefault: template.isDefault,
        }}
      />

      <div className="space-y-6">
        {SECTION_ORDER.map((section) => (
          <TemplateItemsEditor
            key={section}
            templateId={template.id}
            section={section}
            sectionLabel={SECTION_LABELS[section]}
            items={itemsBySection[section] ?? []}
          />
        ))}
      </div>
    </div>
  );
}
