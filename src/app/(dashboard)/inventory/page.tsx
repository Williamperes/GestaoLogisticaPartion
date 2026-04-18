"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Package, Layers, ArrowUpRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { mockInventory } from "@/lib/mock-data";

type ViewMode = "serialized" | "bulk";

export default function InventoryPage() {
  const [view, setView] = useState<ViewMode>("serialized");
  const [search, setSearch] = useState("");

  const filtered = mockInventory
    .filter((i) => (view === "serialized" ? !i.bulk : i.bulk))
    .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventário</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{mockInventory.length} itens cadastrados</p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors">
          + Novo Item
        </button>
      </div>

      {/* Toggle + Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-card border border-border">
          <button
            onClick={() => setView("serialized")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === "serialized" ? "bg-amber-500/15 text-amber-600" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Package className="w-3.5 h-3.5" /> Serializados
          </button>
          <button
            onClick={() => setView("bulk")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === "bulk" ? "bg-amber-500/15 text-amber-600" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Layers className="w-3.5 h-3.5" /> Em Lote
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border text-sm text-muted-foreground ml-auto">
          <Search className="w-3.5 h-3.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar item..."
            className="bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground w-36"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((item) => (
          <Link
            key={item.id}
            href={`/inventory/${item.id}`}
            className="group border border-border rounded-xl bg-card p-4 hover:border-amber-500/40 hover:bg-black/2 transition-all"
          >
            {/* Icon placeholder */}
            <div className="w-full h-24 rounded-lg bg-black/4 flex items-center justify-center mb-3 group-hover:bg-black/6 transition-colors">
              <Package className="w-8 h-8 text-muted-foreground/40" />
            </div>

            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-amber-600 transition-colors">
                  {item.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.category}</p>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-amber-600 transition-colors shrink-0 mt-0.5" />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <StatusBadge status={item.status} type="item" />
              {item.bulk ? (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {(item as any).availableQty}/{(item as any).totalQty} {(item as any).unit}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[90px]">
                  {item.serial}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
