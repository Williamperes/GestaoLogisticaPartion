"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  createEquipmentVariant,
  updateEquipmentVariant,
  deleteEquipmentVariant,
  updateBulkInventoryVariant,
} from "@/app/(dashboard)/inventory/actions";
import type { EquipmentVariant, EquipmentType } from "@/lib/inventory";

const INPUT_CLASS =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface VariantManagerProps {
  equipmentId: string;
  equipmentType: EquipmentType;
  variants: EquipmentVariant[];
  canWrite: boolean;
}

export function VariantManager({
  equipmentId,
  equipmentType,
  variants,
  canWrite,
}: VariantManagerProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stockEditingId, setStockEditingId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4 text-amber-600" />
          Variantes ({variants.length})
        </h2>
        {canWrite && (
          <Button
            size="sm"
            className="rounded-xl"
            onClick={() => {
              setCreating(true);
              setEditingId(null);
              setStockEditingId(null);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Nova variante
          </Button>
        )}
      </div>

      {creating && (
        <form
          action={async (fd) => {
            await createEquipmentVariant(fd);
            setCreating(false);
          }}
          className={`grid gap-2 border-b border-border bg-muted/30 px-5 py-3 ${
            equipmentType === "bulk"
              ? "sm:grid-cols-[1fr_120px_auto]"
              : "sm:grid-cols-[1fr_auto]"
          }`}
        >
          <input type="hidden" name="equipmentId" value={equipmentId} />
          <input type="hidden" name="position" value={variants.length} />
          <input
            name="label"
            required
            autoFocus
            placeholder="Ex.: 5M, 10M, Tamanho P"
            className={INPUT_CLASS}
          />
          {equipmentType === "bulk" && (
            <input
              name="totalQty"
              type="number"
              min={0}
              placeholder="Estoque inicial"
              className={INPUT_CLASS}
            />
          )}
          <div className="flex items-center gap-1">
            <SubmitButton
              idleLabel="Criar"
              pendingLabel="..."
              className="h-8 rounded-xl px-3 text-xs"
            />
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      {variants.length === 0 && !creating ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          Nenhuma variante cadastrada. Use o botão acima para começar.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Variante
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estoque
              </th>
              {canWrite && <th className="w-24 px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {variants.map((v) => (
              <tr key={v.id} className="group">
                <td className="px-5 py-3">
                  {editingId === v.id ? (
                    <form
                      action={async (fd) => {
                        await updateEquipmentVariant(fd);
                        setEditingId(null);
                      }}
                      className="flex flex-wrap items-center gap-2"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    >
                      <input type="hidden" name="variantId" value={v.id} />
                      <input type="hidden" name="sortValue" value={v.sortValue ?? ""} />
                      <input type="hidden" name="position" value={v.position} />
                      <input
                        name="label"
                        required
                        autoFocus
                        defaultValue={v.label}
                        className={INPUT_CLASS}
                      />
                      <button
                        type="submit"
                        className="rounded-md p-1 text-emerald-600 hover:text-emerald-700"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div>
                      <span className="font-medium">{v.label}</span>
                      {v.notes && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          · {v.notes}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {equipmentType === "bulk" && stockEditingId === v.id ? (
                    <form
                      action={async (fd) => {
                        await updateBulkInventoryVariant(fd);
                        setStockEditingId(null);
                      }}
                      className="flex items-center gap-1.5"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setStockEditingId(null);
                      }}
                    >
                      <input type="hidden" name="equipmentId" value={equipmentId} />
                      <input type="hidden" name="variantId" value={v.id} />
                      <input
                        name="totalQty"
                        type="number"
                        min={0}
                        defaultValue={v.totalQty ?? 0}
                        placeholder="Total"
                        autoFocus
                        className={`${INPUT_CLASS} w-20`}
                      />
                      <span className="text-xs text-muted-foreground">/</span>
                      <input
                        name="availableQty"
                        type="number"
                        min={0}
                        defaultValue={v.availableQty ?? 0}
                        placeholder="Disp."
                        className={`${INPUT_CLASS} w-20`}
                      />
                      <button
                        type="submit"
                        className="rounded-md p-1 text-emerald-600 hover:text-emerald-700"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setStockEditingId(null)}
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-mono">
                        {v.availableQty ?? 0}/{v.totalQty ?? 0}
                      </span>
                      {equipmentType === "bulk" && canWrite && (
                        <button
                          type="button"
                          onClick={() => {
                            setStockEditingId(v.id);
                            setEditingId(null);
                          }}
                          className="rounded-md p-1 text-muted-foreground/60 hover:bg-amber-500/10 hover:text-amber-600"
                          title="Ajustar estoque"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      {equipmentType === "serialized" && (
                        <span className="text-[10px] text-muted-foreground/60">
                          unidades
                        </span>
                      )}
                    </div>
                  )}
                </td>
                {canWrite && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(v.id);
                          setStockEditingId(null);
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                        title="Renomear"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <DeleteConfirmDialog
                        action={deleteEquipmentVariant}
                        itemId={v.id}
                        itemName={v.label}
                        itemLabel="variante"
                        hiddenFieldName="variantId"
                        title="Remover variante"
                        description="Remove a variante. Estoque e unidades associadas devem estar zerados / removidos antes."
                        confirmLabel="Remover"
                        pendingLabel="Removendo..."
                        render={
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:text-red-600"
                            title="Remover"
                          />
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </DeleteConfirmDialog>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
