import { Search, Package, Layers } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InventorySheet } from "@/app/(dashboard)/inventory/InventorySheet";
import { getCurrentUserContext } from "@/lib/auth/session";
import { listEquipment, listEquipmentCategories } from "@/lib/inventory";

interface InventoryPageProps {
  searchParams: Promise<{ q?: string; view?: string }>;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const { q, view } = await searchParams;
  const currentView = view === "bulk" ? "bulk" : "serialized";
  const search = q?.trim() ?? "";

  const context = await getCurrentUserContext();
  const organizationId = context?.primaryOrganization?.id;

  const [items, categories] = organizationId
    ? await Promise.all([
        listEquipment(organizationId, search),
        listEquipmentCategories(organizationId),
      ])
    : [[], []];

  const filtered = items.filter((i) =>
    currentView === "bulk" ? i.type === "bulk" : i.type === "serialized"
  );

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

      {/* Toggle + Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          <Link
            href={`/inventory?view=serialized${search ? `&q=${encodeURIComponent(search)}` : ""}`}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              currentView === "serialized"
                ? "bg-amber-500/15 text-amber-600"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            Serializados
          </Link>
          <Link
            href={`/inventory?view=bulk${search ? `&q=${encodeURIComponent(search)}` : ""}`}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              currentView === "bulk"
                ? "bg-amber-500/15 text-amber-600"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Em Lote
          </Link>
        </div>

        <form className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <input
            name="q"
            defaultValue={search}
            placeholder="Buscar item..."
            className="w-36 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <input type="hidden" name="view" value={currentView} />
        </form>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <Package className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            {search
              ? `Nenhum item encontrado para "${search}"`
              : currentView === "bulk"
              ? "Nenhum item em lote cadastrado"
              : "Nenhum item serializado cadastrado"}
          </p>
          {canWrite && !search && (
            <p className="mt-1 text-xs text-muted-foreground/60">
              Use o botão "Novo Item" para adicionar.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/inventory/${item.id}`}
              className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-amber-500/40 hover:bg-black/2"
            >
              <div className="mb-3 flex h-24 w-full items-center justify-center rounded-lg bg-black/4 transition-colors group-hover:bg-black/6">
                {item.type === "bulk" ? (
                  <Layers className="h-8 w-8 text-muted-foreground/40" />
                ) : (
                  <Package className="h-8 w-8 text-muted-foreground/40" />
                )}
              </div>

              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium transition-colors group-hover:text-amber-600">
                    {item.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.categoryName ?? "Sem categoria"}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <StatusBadge status={item.status} type="item" />
                {item.type === "bulk" && item.bulk ? (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {item.bulk.availableQty}/{item.bulk.totalQty} {item.bulk.unit}
                  </span>
                ) : (
                  <span className="max-w-[90px] truncate font-mono text-[10px] text-muted-foreground">
                    {item.serial ?? "—"}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
