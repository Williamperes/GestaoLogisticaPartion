import { redirect } from "next/navigation";
import { Search, Package, History, Download } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InventorySheet } from "@/app/(dashboard)/inventory/InventorySheet";
import { getCurrentUserContext } from "@/lib/auth/session";
import { listEquipment, listEquipmentCategories } from "@/lib/inventory";
import {
  getLatestMaintenanceReturnByEquipment,
  listResolvedMaintenanceHistory,
} from "@/lib/maintenance";
import { formatDateTimeBR } from "@/lib/dates";
import type { Equipment } from "@/lib/inventory";

interface InventoryPageProps {
  searchParams: Promise<{ q?: string }>;
}

function getBulkQuantityLabel(item: Equipment) {
  const variants = item.variants ?? [];
  const total = item.hasVariants
    ? variants.reduce((sum, variant) => sum + (variant.totalQty ?? 0), 0)
    : (item.bulk?.totalQty ?? 0);
  const available = item.hasVariants
    ? variants.reduce((sum, variant) => sum + (variant.availableQty ?? 0), 0)
    : (item.bulk?.availableQty ?? 0);
  const unit = item.bulk?.unit ?? "unidades";

  return `${available} de ${total} ${unit} disponíveis`;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const { q } = await searchParams;
  const search = q?.trim() ?? "";

  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (!context.role || !["super_admin", "admin", "operations"].includes(context.role)) {
    redirect("/dashboard");
  }
  const organizationId = context.primaryOrganization?.id;
  const canViewMaintenanceHistory = ["super_admin", "admin"].includes(context.role);

  const [items, categories, resolvedMaintenance] = organizationId
    ? await Promise.all([
        listEquipment(organizationId, search),
        listEquipmentCategories(organizationId),
        canViewMaintenanceHistory
          ? listResolvedMaintenanceHistory(organizationId)
          : Promise.resolve([]),
      ])
    : [[], [], []];

  const latestReturnByEquipment = getLatestMaintenanceReturnByEquipment(resolvedMaintenance);

  const canWrite = ["super_admin", "admin", "operations", "warehouse"].includes(context?.role ?? "");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventário</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "item cadastrado" : "itens cadastrados"}
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <a
              href="/inventory/pdf"
              download
              className="flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Download className="h-4 w-4" />
              Baixar inventário em PDF
            </a>
            <Link
              href="/inventory/categories"
              className="flex h-9 items-center rounded-xl border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Categorias
            </Link>
            <InventorySheet categories={categories} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <input
            name="q"
            defaultValue={search}
            placeholder="Buscar item..."
            className="w-36 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </form>
      </div>

      {/* Grid */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <Package className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            {search
              ? `Nenhum item encontrado para "${search}"`
              : "Nenhum item cadastrado"}
          </p>
          {canWrite && !search && (
            <p className="mt-1 text-xs text-muted-foreground/60">
              Use o botão &quot;Novo Item&quot; para adicionar.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/inventory/${item.id}`}
              className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-amber-500/40 hover:bg-black/2"
            >
              <div className="mb-3 flex h-24 w-full items-center justify-center rounded-lg bg-black/4 transition-colors group-hover:bg-black/6">
                <Package className="h-8 w-8 text-muted-foreground/40" />
              </div>

              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium transition-colors group-hover:text-amber-600">
                    {item.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.parentCategoryName
                      ? `${item.parentCategoryName} › ${item.categoryName ?? ""}`
                      : item.categoryName ?? "Sem categoria"}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <StatusBadge status={item.status} type="item" />
                {item.type === "bulk" ? (
                  <span className="text-right text-[11px] font-medium text-muted-foreground">
                    {getBulkQuantityLabel(item)}
                  </span>
                ) : (
                  <span className="max-w-[90px] truncate font-mono text-[10px] text-muted-foreground">
                    {item.serial ?? item.patrimony ?? "—"}
                  </span>
                )}
              </div>
              {latestReturnByEquipment[item.id] && (
                <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-[11px] font-medium text-emerald-700">
                  <History className="h-3.5 w-3.5 shrink-0" />
                  Voltou da manutenção em {formatDateTimeBR(latestReturnByEquipment[item.id])}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
