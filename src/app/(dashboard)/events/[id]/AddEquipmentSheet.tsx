"use client";

import { useMemo, useState } from "react";
import { Plus, Minus, Search, Package, AlertTriangle, Layers } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { setEventEquipmentBatch } from "@/app/(dashboard)/events/actions";
import type { EventStatus } from "@/lib/events";

const SEARCH_CLASS =
  "w-full rounded-2xl border border-border bg-background px-9 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface VariantOption {
  id: string;
  label: string;
  total: number;
  allocatedByOthers: number;
  available: number;
}

interface EquipmentOption {
  id: string;
  name: string;
  type: "serialized" | "bulk";
  categoryName: string | null;
  hasVariants: boolean;
  /** Total/disp para itens SEM variante. Para itens com variantes, ignorar e usar variants[]. */
  total: number;
  allocatedByOthers: number;
  available: number;
  variants?: VariantOption[];
}

interface AddEquipmentSheetProps {
  eventId: string;
  eventStatus: EventStatus;
  equipment: EquipmentOption[];
  /**
   * Chave: `${equipmentId}` (sem variante) ou `${equipmentId}__${variantId}` (com variante).
   * Valor: qty atual nesta OS (bulk-style, unit_id IS NULL).
   */
  currentQtyByKey: Record<string, number>;
}

function isHardBlocking(status: EventStatus): boolean {
  return status !== "planning";
}

function rowKey(equipmentId: string, variantId: string | null): string {
  return variantId ? `${equipmentId}__${variantId}` : equipmentId;
}

export function AddEquipmentSheet({
  eventId,
  eventStatus,
  equipment,
  currentQtyByKey,
}: AddEquipmentSheetProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [qtys, setQtys] = useState<Record<string, number>>(currentQtyByKey);

  const hardBlock = isHardBlocking(eventStatus);

  // Itens visíveis: filtra fora os que não têm disponibilidade alguma e
  // também não estão na OS atual.
  const visible = useMemo(() => {
    return equipment.filter((e) => {
      if (e.hasVariants && e.variants && e.variants.length > 0) {
        return e.variants.some((v) => {
          const inOS = (currentQtyByKey[rowKey(e.id, v.id)] ?? 0) > 0;
          return v.available > 0 || inOS;
        });
      }
      const inOS = (currentQtyByKey[e.id] ?? 0) > 0;
      return e.available > 0 || inOS;
    });
  }, [equipment, currentQtyByKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.categoryName ?? "").toLowerCase().includes(q)
    );
  }, [visible, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, EquipmentOption[]>();
    for (const e of filtered) {
      const key = e.categoryName ?? "Sem categoria";
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const totalSelected = Object.values(qtys).filter((v) => v > 0).length;
  const totalUnits = Object.values(qtys).reduce(
    (sum, v) => sum + (v > 0 ? v : 0),
    0
  );

  // Pré-calcula itens em conflito (qty selecionada > available)
  const overbooked = useMemo(() => {
    const out: { key: string; name: string; qty: number; available: number }[] = [];
    for (const eq of equipment) {
      if (eq.hasVariants && eq.variants && eq.variants.length > 0) {
        for (const v of eq.variants) {
          const k = rowKey(eq.id, v.id);
          const qty = qtys[k] ?? 0;
          if (qty > v.available) {
            out.push({ key: k, name: `${eq.name} ${v.label}`, qty, available: v.available });
          }
        }
      } else {
        const qty = qtys[eq.id] ?? 0;
        if (qty > eq.available) {
          out.push({ key: eq.id, name: eq.name, qty, available: eq.available });
        }
      }
    }
    return out;
  }, [equipment, qtys]);

  function setQty(key: string, next: number, cap?: number) {
    setQtys((prev) => {
      let value = Math.max(0, Math.floor(next));
      if (hardBlock && typeof cap === "number") {
        value = Math.min(value, cap);
      }
      if (value === 0) {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      return { ...prev, [key]: value };
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQtys(currentQtyByKey);
          setSearch("");
        }
      }}
    >
      <SheetTrigger render={<Button size="sm" className="rounded-xl" />}>
        <Plus className="h-3.5 w-3.5" />
        Gerenciar equipamentos
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full max-w-2xl flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Equipamentos da OS</SheetTitle>
          <SheetDescription>
            Defina a quantidade de cada equipamento. Itens com quantidade 0 são removidos da OS.
            {hardBlock
              ? " Status atual exige estoque disponível — não é possível exceder."
              : " Em planejamento você pode exceder o disponível, mas a OS não poderá ser promovida até resolver."}
          </SheetDescription>
        </SheetHeader>

        <form
          action={async (fd) => {
            await setEventEquipmentBatch(fd);
            setOpen(false);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <input type="hidden" name="eventId" value={eventId} />

          <div className="border-b border-border bg-background/40 px-6 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou categoria..."
                className={SEARCH_CLASS}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {totalSelected} {totalSelected === 1 ? "item selecionado" : "itens selecionados"} ·{" "}
              {totalUnits} {totalUnits === 1 ? "unidade" : "unidades"}
            </p>
            {overbooked.length > 0 && (
              <div
                className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] ${
                  hardBlock
                    ? "border-red-500/30 bg-red-500/5 text-red-600"
                    : "border-amber-500/30 bg-amber-500/5 text-amber-700"
                }`}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="font-semibold">
                    {overbooked.length}{" "}
                    {overbooked.length === 1
                      ? "item acima do disponível"
                      : "itens acima do disponível"}
                    .
                  </p>
                  <p>
                    {hardBlock
                      ? "Reduza a quantidade antes de salvar."
                      : "OS pode ser salva, mas não poderá ser promovida para Pronto para Carga."}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Hidden inputs cobrem TODO o universo — assim quando uma row some
                no save, o batch enxerga qty=0 e deleta. */}
            {equipment.map((e) =>
              e.hasVariants && e.variants && e.variants.length > 0 ? (
                e.variants.map((v) => (
                  <input
                    key={`hidden-${e.id}-${v.id}`}
                    type="hidden"
                    name={`qty_${e.id}__${v.id}`}
                    value={qtys[rowKey(e.id, v.id)] ?? 0}
                  />
                ))
              ) : (
                <input
                  key={`hidden-${e.id}`}
                  type="hidden"
                  name={`qty_${e.id}`}
                  value={qtys[e.id] ?? 0}
                />
              )
            )}

            {grouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-12 text-center">
                <Package className="mb-2 h-7 w-7 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {equipment.length === 0
                    ? "Nenhum equipamento cadastrado no inventário."
                    : visible.length === 0
                    ? "Nenhum equipamento disponível para o período da OS."
                    : `Nenhum equipamento encontrado para "${search}".`}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {grouped.map(([categoryName, items]) => (
                  <section key={categoryName}>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {categoryName}
                    </h3>
                    <ul className="overflow-hidden rounded-xl border border-border bg-card">
                      {items.map((item) =>
                        item.hasVariants && item.variants && item.variants.length > 0 ? (
                          <VariantGroup
                            key={item.id}
                            item={item}
                            qtys={qtys}
                            setQty={setQty}
                            hardBlock={hardBlock}
                          />
                        ) : (
                          <SingleRow
                            key={item.id}
                            item={item}
                            qty={qtys[item.id] ?? 0}
                            setQty={setQty}
                            hardBlock={hardBlock}
                          />
                        )
                      )}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
            <SubmitButton
              idleLabel={
                totalSelected > 0
                  ? `Salvar (${totalSelected} ${totalSelected === 1 ? "item" : "itens"})`
                  : "Salvar"
              }
              pendingLabel="Salvando..."
              className="h-11 w-full rounded-2xl text-sm font-semibold"
            />
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ──────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────

function SingleRow({
  item,
  qty,
  setQty,
  hardBlock,
}: {
  item: EquipmentOption;
  qty: number;
  setQty: (key: string, next: number, cap?: number) => void;
  hardBlock: boolean;
}) {
  const isSelected = qty > 0;
  const over = qty > item.available;
  const noStock = item.available === 0 && qty === 0;
  return (
    <li
      className={`flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 transition-colors ${
        over
          ? hardBlock
            ? "bg-red-500/5"
            : "bg-amber-500/5"
          : isSelected
          ? "bg-amber-500/5"
          : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] uppercase tracking-wide">
          <span className="text-muted-foreground">
            {item.type === "serialized" ? "Serializado" : "Lote"}
          </span>
          <span
            className={
              over
                ? hardBlock
                  ? "font-semibold text-red-600"
                  : "font-semibold text-amber-600"
                : noStock
                ? "font-semibold text-muted-foreground/60"
                : "text-emerald-600"
            }
          >
            {item.available} disp.
          </span>
          <span className="text-muted-foreground/60">
            · Total {item.total}
            {item.allocatedByOthers > 0 && ` (em outras OS: ${item.allocatedByOthers})`}
          </span>
        </div>
      </div>
      <Stepper
        qty={qty}
        available={item.available}
        hardBlock={hardBlock}
        over={over}
        onChange={(next) => setQty(item.id, next, item.available)}
        ariaName={item.name}
      />
    </li>
  );
}

function VariantGroup({
  item,
  qtys,
  setQty,
  hardBlock,
}: {
  item: EquipmentOption;
  qtys: Record<string, number>;
  setQty: (key: string, next: number, cap?: number) => void;
  hardBlock: boolean;
}) {
  const variants = item.variants ?? [];
  const totalSelectedHere = variants.reduce(
    (sum, v) => sum + (qtys[rowKey(item.id, v.id)] ?? 0),
    0
  );
  return (
    <li className="border-b border-border last:border-b-0">
      <header className="flex items-center gap-2 px-4 py-2.5 bg-background/30">
        <Layers className="h-3 w-3 text-amber-600" />
        <p className="flex-1 truncate text-sm font-medium">{item.name}</p>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {variants.length} variantes · {totalSelectedHere} un. selec.
        </span>
      </header>
      <ul>
        {variants.map((v) => {
          const k = rowKey(item.id, v.id);
          const qty = qtys[k] ?? 0;
          const isSelected = qty > 0;
          const over = qty > v.available;
          const noStock = v.available === 0 && qty === 0;
          return (
            <li
              key={v.id}
              className={`flex items-center gap-3 border-t border-border/50 pl-8 pr-4 py-2.5 transition-colors ${
                over
                  ? hardBlock
                    ? "bg-red-500/5"
                    : "bg-amber-500/5"
                  : isSelected
                  ? "bg-amber-500/5"
                  : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <span className="font-medium text-muted-foreground">→ </span>
                  {v.label}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] uppercase tracking-wide">
                  <span
                    className={
                      over
                        ? hardBlock
                          ? "font-semibold text-red-600"
                          : "font-semibold text-amber-600"
                        : noStock
                        ? "font-semibold text-muted-foreground/60"
                        : "text-emerald-600"
                    }
                  >
                    {v.available} disp.
                  </span>
                  <span className="text-muted-foreground/60">
                    · Total {v.total}
                    {v.allocatedByOthers > 0 && ` (em outras OS: ${v.allocatedByOthers})`}
                  </span>
                </div>
              </div>
              <Stepper
                qty={qty}
                available={v.available}
                hardBlock={hardBlock}
                over={over}
                onChange={(next) => setQty(k, next, v.available)}
                ariaName={`${item.name} ${v.label}`}
              />
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function Stepper({
  qty,
  available,
  hardBlock,
  over,
  onChange,
  ariaName,
}: {
  qty: number;
  available: number;
  hardBlock: boolean;
  over: boolean;
  onChange: (next: number) => void;
  ariaName: string;
}) {
  const isSelected = qty > 0;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={qty <= 0}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-amber-500/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={`Diminuir ${ariaName}`}
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        min={0}
        max={hardBlock ? available : undefined}
        value={qty}
        onChange={(e) => onChange(parseInt(e.target.value || "0", 10))}
        className={`h-8 w-14 rounded-lg border bg-background text-center text-sm font-semibold tabular-nums outline-none transition focus:ring-2 ${
          over
            ? hardBlock
              ? "border-red-500/60 text-red-600 focus:border-red-500/70 focus:ring-red-500/10"
              : "border-amber-500/60 text-amber-600 focus:border-amber-500/70 focus:ring-amber-500/10"
            : isSelected
            ? "border-border text-amber-600 focus:border-primary/50 focus:ring-primary/10"
            : "border-border focus:border-primary/50 focus:ring-primary/10"
        }`}
      />
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={hardBlock && qty >= available}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-amber-500/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={`Aumentar ${ariaName}`}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
