"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  createCategory,
  renameCategory,
  deleteCategory,
} from "@/app/(dashboard)/inventory/actions";
import type { EquipmentCategory } from "@/lib/inventory";

const INPUT_CLASS =
  "rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface CategoryManagerProps {
  categories: EquipmentCategory[];
}

export function CategoryManager({ categories }: CategoryManagerProps) {
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Categorias-raiz (sem pai). Apenas estas podem ser pai de outras
  // (limite de 1 nível de hierarquia, enforced também no server).
  const rootCategories = categories.filter((c) => !c.parentCategoryId);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-sm text-muted-foreground">
          {categories.length}{" "}
          {categories.length === 1 ? "categoria" : "categorias"}
        </span>
        <Button
          size="sm"
          className="rounded-xl"
          onClick={() => {
            setCreating(true);
            setRenamingId(null);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Nova Categoria
        </Button>
      </div>

      {/* Inline create form */}
      {creating && (
        <form
          action={async (fd) => {
            await createCategory(fd);
            setCreating(false);
          }}
          className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-5 py-3"
        >
          <input
            name="name"
            required
            autoFocus
            placeholder="Nome da nova categoria"
            className={INPUT_CLASS + " flex-1 min-w-[180px]"}
          />
          <select
            name="parentCategoryId"
            defaultValue=""
            className={INPUT_CLASS}
            title="Categoria pai (opcional)"
          >
            <option value="">— Sem categoria pai —</option>
            {rootCategories.map((c) => (
              <option key={c.id} value={c.id}>
                Subcategoria de: {c.name}
              </option>
            ))}
          </select>
          <SubmitButton
            idleLabel="Criar"
            pendingLabel="..."
            className="h-8 rounded-xl px-4 text-sm"
          />
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      )}

      {/* Table */}
      {categories.length === 0 && !creating ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          Nenhuma categoria cadastrada.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nome
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pai
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Equipamentos
              </th>
              <th className="w-20 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories.map((cat) => (
              <tr key={cat.id} className="group">
                <td className="px-5 py-3">
                  {renamingId === cat.id ? (
                    <form
                      action={async (fd) => {
                        await renameCategory(fd);
                        setRenamingId(null);
                      }}
                      className="flex flex-wrap items-center gap-2"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    >
                      <input type="hidden" name="categoryId" value={cat.id} />
                      <input
                        name="name"
                        required
                        autoFocus
                        defaultValue={cat.name}
                        className={INPUT_CLASS}
                      />
                      <select
                        name="parentCategoryId"
                        defaultValue={cat.parentCategoryId ?? ""}
                        className={INPUT_CLASS}
                        title="Categoria pai"
                      >
                        <option value="">— Sem pai —</option>
                        {rootCategories
                          .filter((root) => root.id !== cat.id)
                          .map((root) => (
                            <option key={root.id} value={root.id}>
                              Subcategoria de: {root.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md p-1 text-emerald-600 hover:text-emerald-700"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <span className="font-medium">{cat.name}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {cat.parentCategoryName ? (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      {cat.parentCategoryName}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {cat.equipmentCount}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(cat.id);
                        setCreating(false);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                      title="Renomear"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    {cat.equipmentCount === 0 ? (
                      <DeleteConfirmDialog
                        action={deleteCategory}
                        itemId={cat.id}
                        itemName={cat.name}
                        itemLabel="categoria"
                        hiddenFieldName="categoryId"
                        title="Excluir categoria"
                        description="Esta ação remove a categoria permanentemente."
                        confirmLabel="Excluir"
                        pendingLabel="Excluindo..."
                        render={
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:text-red-600"
                            title="Excluir"
                          />
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </DeleteConfirmDialog>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="cursor-not-allowed rounded-md p-1.5 text-muted-foreground/30"
                        title="Categoria possui equipamentos vinculados"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
