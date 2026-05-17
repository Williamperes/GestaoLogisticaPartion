import { redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentUserContext } from "@/lib/auth/session";
import { listEquipmentCategories } from "@/lib/inventory";

import { CategoryManager } from "@/app/(dashboard)/inventory/categories/CategoryManager";

interface CategoriesPageProps {
  searchParams: Promise<{ success?: string; error?: string }>;
}

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const { success, error: errorMsg } = await searchParams;

  const context = await getCurrentUserContext();
  const canWrite = ["super_admin", "admin", "operations", "warehouse"].includes(
    context?.role ?? ""
  );

  if (!canWrite) redirect("/inventory");

  const organizationId = context?.primaryOrganization?.id;
  const categories = organizationId
    ? await listEquipmentCategories(organizationId)
    : [];

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link
          href="/inventory"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Inventário
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Categorias de Equipamento</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {categories.length}{" "}
          {categories.length === 1 ? "categoria cadastrada" : "categorias cadastradas"}
        </p>
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

      <CategoryManager categories={categories} />
    </div>
  );
}
