import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus, Star } from "lucide-react";

import { getCurrentUserContext } from "@/lib/auth/session";
import { listChecklistTemplates } from "@/lib/checklist-templates";

import { CreateTemplateButton } from "@/app/(dashboard)/settings/checklist-templates/CreateTemplateButton";

interface PageProps {
  searchParams: Promise<{ success?: string; error?: string }>;
}

export default async function ChecklistTemplatesPage({ searchParams }: PageProps) {
  const { success, error: errorMsg } = await searchParams;

  const context = await getCurrentUserContext();
  const canWrite = ["super_admin", "admin", "operations"].includes(context?.role ?? "");
  if (!canWrite) redirect("/dashboard");

  const organizationId = context?.primaryOrganization?.id;
  const templates = organizationId
    ? await listChecklistTemplates(organizationId)
    : [];

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link
          href="/settings"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Configurações
        </Link>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Templates de Checklist</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {templates.length}{" "}
              {templates.length === 1 ? "template cadastrado" : "templates cadastrados"}
            </p>
          </div>
          <CreateTemplateButton />
        </div>
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

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <Plus className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum template cadastrado.
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground/70">
            Crie um template para reutilizar a mesma lista de itens em cada Ordem de Serviço.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Link
                href={`/settings/checklist-templates/${t.id}`}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-amber-500/40 hover:bg-amber-500/5"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{t.name}</p>
                    {t.isDefault && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                        <Star className="h-2.5 w-2.5" />
                        Padrão
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    {t.itemCount} {t.itemCount === 1 ? "item" : "itens"} ·{" "}
                    {t.requiredCount} obrigatório{t.requiredCount === 1 ? "" : "s"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-amber-600" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
