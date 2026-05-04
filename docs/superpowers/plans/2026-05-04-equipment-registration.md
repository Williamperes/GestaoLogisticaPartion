# Equipment Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete equipment management — real detail page, edit equipment, unit management, bulk qty adjustment, and category CRUD at `/inventory/categories`.

**Architecture:** Sheet-based editing (same pattern as `InventorySheet`/`EventSheet`). All mutations via server actions + `revalidatePath`. No new API routes. Detail page is a server component fetching from existing `getEquipmentById`. Category management is a dedicated page at `/inventory/categories`.

**Tech Stack:** Next.js (App Router, server components), Supabase (admin client), Vitest (tests), base-ui Dialog, shadcn Sheet/Button

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/(dashboard)/inventory/actions.ts` | Modify | Add 7 server actions |
| `src/lib/inventory.ts` | Modify | Extend `listEquipmentCategories` with count |
| `src/app/(dashboard)/inventory/[id]/page.tsx` | Rewrite | Server component, real data, serialized + bulk layouts |
| `src/app/(dashboard)/inventory/[id]/UnitStatusForm.tsx` | Create | Client component: status dropdown per unit |
| `src/app/(dashboard)/inventory/[id]/EditEquipmentSheet.tsx` | Create | Client component: edit equipment Sheet |
| `src/app/(dashboard)/inventory/[id]/AddUnitSheet.tsx` | Create | Client component: add unit Sheet |
| `src/app/(dashboard)/inventory/[id]/BulkAdjustDialog.tsx` | Create | Client component: adjust bulk qty Dialog |
| `src/app/(dashboard)/inventory/categories/page.tsx` | Create | Server component: categories list page |
| `src/app/(dashboard)/inventory/categories/CategoryManager.tsx` | Create | Client component: create/rename/delete categories |
| `src/app/(dashboard)/inventory/page.tsx` | Modify | Add "Categorias" link in header |
| `tests/inventory.actions.test.ts` | Modify | Add tests for 7 new actions |

---

## Task 1: `updateEquipment` server action

**Files:**
- Modify: `tests/inventory.actions.test.ts`
- Modify: `src/app/(dashboard)/inventory/actions.ts`

- [ ] **Step 1: Add the import to the test file and write the failing test**

Add to the imports block at the top of `tests/inventory.actions.test.ts`:

```typescript
import {
  createEquipment,
  deactivateEquipment,
  updateEquipmentUnitStatus,
  updateEquipment,
} from "@/app/(dashboard)/inventory/actions";
```

Add inside the top-level `describe("inventory actions", ...)` block:

```typescript
describe("updateEquipment", () => {
  it("updates fields and redirects with success", async () => {
    const updateResult = vi.fn().mockResolvedValue({ error: null });
    const eqFn = vi.fn().mockReturnValue(updateResult);
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      updateEquipment(
        buildFormData({
          equipmentId: "equip-1",
          name: "Mesa CL5",
          brand: "Yamaha",
          model: "CL5",
          categoryId: "cat-1",
          notes: "",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?success=Equipamento atualizado.");

    expect(updateFn).toHaveBeenCalledWith({
      name: "Mesa CL5",
      brand: "Yamaha",
      model: "CL5",
      category_id: "cat-1",
      notes: null,
    });
    expect(eqFn).toHaveBeenCalledWith("id", "equip-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory/equip-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory");
  });

  it("rejects when name is empty", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      updateEquipment(buildFormData({ equipmentId: "equip-1", name: "  " }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?error=");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `updateEquipment` not found / not exported.

- [ ] **Step 3: Implement `updateEquipment` in `actions.ts`**

Add after the existing `deactivateEquipment` function:

```typescript
export async function updateEquipment(formData: FormData) {
  await requireWriteRole();

  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const model = String(formData.get("model") ?? "").trim() || null;
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!equipmentId || !name) {
    redirect(`/inventory/${equipmentId}?error=Nome é obrigatório.`);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("equipment")
    .update({ name, brand, model, category_id: categoryId, notes })
    .eq("id", equipmentId);

  if (error) redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/inventory/${equipmentId}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${equipmentId}?success=Equipamento atualizado.`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/inventory.actions.test.ts src/app/\(dashboard\)/inventory/actions.ts
git commit -m "feat(inventory): add updateEquipment server action"
```

---

## Task 2: `addEquipmentUnit` + `deleteEquipmentUnit` server actions

**Files:**
- Modify: `tests/inventory.actions.test.ts`
- Modify: `src/app/(dashboard)/inventory/actions.ts`

> Note: `deleteEquipmentUnit` fetches `equipment_id` from the DB so it can redirect correctly. This avoids needing to pass `equipmentId` from the UI (needed because `DeleteConfirmDialog` only passes one hidden field).

- [ ] **Step 1: Add imports and write the failing tests**

Update import in `tests/inventory.actions.test.ts`:

```typescript
import {
  createEquipment,
  deactivateEquipment,
  updateEquipmentUnitStatus,
  updateEquipment,
  addEquipmentUnit,
  deleteEquipmentUnit,
} from "@/app/(dashboard)/inventory/actions";
```

Add inside the top-level describe block:

```typescript
describe("addEquipmentUnit", () => {
  it("inserts unit, generates QR code, and redirects with success", async () => {
    const updateResult = vi.fn().mockResolvedValue({ error: null });
    const updateEqFn = vi.fn().mockReturnValue(updateResult);
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn });

    const insertSingle = vi.fn().mockResolvedValue({ data: { id: "unit-new" }, error: null });
    const insertSelectFn = vi.fn().mockReturnValue({ single: insertSingle });
    const insertFn = vi.fn().mockReturnValue({ select: insertSelectFn });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "equipment_units") return { insert: insertFn, update: updateFn };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      addEquipmentUnit(
        buildFormData({
          equipmentId: "equip-1",
          serial: "PM7-0002",
          patrimony: "PAT-002",
          notes: "",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?success=Unidade adicionada.");

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        equipment_id: "equip-1",
        serial: "PM7-0002",
        patrimony: "PAT-002",
        status: "available",
      })
    );
    expect(mocks.generateQrToken).toHaveBeenCalledWith("UN", "unit-new");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory/equip-1");
  });

  it("rejects when serial is empty", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEquipmentUnit(buildFormData({ equipmentId: "equip-1", serial: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?error=Número de série é obrigatório.");
  });
});

describe("deleteEquipmentUnit", () => {
  it("fetches equipment_id, deletes unit, revalidates, and redirects", async () => {
    const deleteResult = vi.fn().mockResolvedValue({ error: null });
    const deleteEqFn = vi.fn().mockReturnValue(deleteResult);
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn });

    const fetchSingle = vi.fn().mockResolvedValue({
      data: { equipment_id: "equip-1" },
      error: null,
    });
    const fetchEqFn = vi.fn().mockReturnValue({ single: fetchSingle });
    const fetchSelectFn = vi.fn().mockReturnValue({ eq: fetchEqFn });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: fetchSelectFn,
        delete: deleteFn,
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      deleteEquipmentUnit(buildFormData({ unitId: "unit-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?success=Unidade removida.");

    expect(deleteEqFn).toHaveBeenCalledWith("id", "unit-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory/equip-1");
  });

  it("rejects when unitId is missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      deleteEquipmentUnit(buildFormData({ unitId: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — functions not found.

- [ ] **Step 3: Implement both actions in `actions.ts`**

```typescript
export async function addEquipmentUnit(formData: FormData) {
  await requireWriteRole();

  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const serial = String(formData.get("serial") ?? "").trim();
  const patrimony = String(formData.get("patrimony") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!equipmentId || !serial) {
    redirect(`/inventory/${equipmentId}?error=Número de série é obrigatório.`);
  }

  const supabase = createSupabaseAdminClient();

  const { data: unit, error: insertError } = await supabase
    .from("equipment_units")
    .insert({ equipment_id: equipmentId, serial, patrimony, notes, status: "available" })
    .select("id")
    .single();

  if (insertError) {
    redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(insertError.message)}`);
  }

  const qrCode = generateQrToken("UN", unit.id);
  await supabase.from("equipment_units").update({ qr_code: qrCode }).eq("id", unit.id);

  revalidatePath(`/inventory/${equipmentId}`);
  redirect(`/inventory/${equipmentId}?success=Unidade adicionada.`);
}

export async function deleteEquipmentUnit(formData: FormData) {
  await requireWriteRole();

  const unitId = String(formData.get("unitId") ?? "").trim();

  if (!unitId) {
    redirect("/inventory?error=Unidade inválida.");
  }

  const supabase = createSupabaseAdminClient();

  const { data: unit, error: fetchError } = await supabase
    .from("equipment_units")
    .select("equipment_id")
    .eq("id", unitId)
    .single();

  if (fetchError || !unit) {
    redirect("/inventory?error=Unidade não encontrada.");
  }

  const equipmentId = unit.equipment_id;

  const { error } = await supabase
    .from("equipment_units")
    .delete()
    .eq("id", unitId);

  if (error) {
    redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/inventory/${equipmentId}`);
  redirect(`/inventory/${equipmentId}?success=Unidade removida.`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/inventory.actions.test.ts src/app/\(dashboard\)/inventory/actions.ts
git commit -m "feat(inventory): add addEquipmentUnit and deleteEquipmentUnit server actions"
```

---

## Task 3: `updateBulkInventory` server action

**Files:**
- Modify: `tests/inventory.actions.test.ts`
- Modify: `src/app/(dashboard)/inventory/actions.ts`

- [ ] **Step 1: Add import and write the failing tests**

Update import:

```typescript
import {
  createEquipment,
  deactivateEquipment,
  updateEquipmentUnitStatus,
  updateEquipment,
  addEquipmentUnit,
  deleteEquipmentUnit,
  updateBulkInventory,
} from "@/app/(dashboard)/inventory/actions";
```

Add tests:

```typescript
describe("updateBulkInventory", () => {
  it("updates total and available qty and redirects with success", async () => {
    const updateResult = vi.fn().mockResolvedValue({ error: null });
    const eqFn = vi.fn().mockReturnValue(updateResult);
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      updateBulkInventory(
        buildFormData({ equipmentId: "equip-1", totalQty: "200", availableQty: "150" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?success=Estoque atualizado.");

    expect(updateFn).toHaveBeenCalledWith({ total_qty: 200, available_qty: 150 });
    expect(eqFn).toHaveBeenCalledWith("equipment_id", "equip-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory/equip-1");
  });

  it("rejects when availableQty exceeds totalQty", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateBulkInventory(
        buildFormData({ equipmentId: "equip-1", totalQty: "100", availableQty: "200" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?error=Quantidades inválidas.");
  });

  it("rejects when qty values are NaN", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateBulkInventory(
        buildFormData({ equipmentId: "equip-1", totalQty: "abc", availableQty: "0" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?error=Quantidades inválidas.");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test
```

Expected: FAIL — `updateBulkInventory` not found.

- [ ] **Step 3: Implement**

```typescript
export async function updateBulkInventory(formData: FormData) {
  await requireWriteRole();

  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const totalQty = parseInt(String(formData.get("totalQty") ?? ""), 10);
  const availableQty = parseInt(String(formData.get("availableQty") ?? ""), 10);

  if (
    !equipmentId ||
    isNaN(totalQty) ||
    isNaN(availableQty) ||
    totalQty < 0 ||
    availableQty < 0 ||
    availableQty > totalQty
  ) {
    redirect(`/inventory/${equipmentId}?error=Quantidades inválidas.`);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("bulk_inventory")
    .update({ total_qty: totalQty, available_qty: availableQty })
    .eq("equipment_id", equipmentId);

  if (error) redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/inventory/${equipmentId}`);
  redirect(`/inventory/${equipmentId}?success=Estoque atualizado.`);
}
```

- [ ] **Step 4: Run to verify they pass**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/inventory.actions.test.ts src/app/\(dashboard\)/inventory/actions.ts
git commit -m "feat(inventory): add updateBulkInventory server action"
```

---

## Task 4: Category server actions (`createCategory`, `renameCategory`, `deleteCategory`)

**Files:**
- Modify: `tests/inventory.actions.test.ts`
- Modify: `src/app/(dashboard)/inventory/actions.ts`

- [ ] **Step 1: Add imports and write the failing tests**

Update import:

```typescript
import {
  createEquipment,
  deactivateEquipment,
  updateEquipmentUnitStatus,
  updateEquipment,
  addEquipmentUnit,
  deleteEquipmentUnit,
  updateBulkInventory,
  createCategory,
  renameCategory,
  deleteCategory,
} from "@/app/(dashboard)/inventory/actions";
```

Add tests:

```typescript
describe("createCategory", () => {
  it("inserts category with org id and redirects with success", async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: insertFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      createCategory(buildFormData({ name: "Vídeo" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?success=Categoria criada.");

    expect(insertFn).toHaveBeenCalledWith({ organization_id: "org-1", name: "Vídeo" });
  });

  it("rejects when name is empty", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      createCategory(buildFormData({ name: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=Nome é obrigatório.");
  });
});

describe("renameCategory", () => {
  it("updates category name and redirects with success", async () => {
    const updateResult = vi.fn().mockResolvedValue({ error: null });
    const eqFn = vi.fn().mockReturnValue(updateResult);
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      renameCategory(buildFormData({ categoryId: "cat-1", name: "Áudio Renamed" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?success=Categoria renomeada.");

    expect(updateFn).toHaveBeenCalledWith({ name: "Áudio Renamed" });
    expect(eqFn).toHaveBeenCalledWith("id", "cat-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory");
  });
});

describe("deleteCategory", () => {
  it("deletes when no equipment linked", async () => {
    const deleteResult = vi.fn().mockResolvedValue({ error: null });
    const deleteEqFn = vi.fn().mockReturnValue(deleteResult);
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "equipment") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
            }),
          };
        }
        if (table === "equipment_categories") return { delete: deleteFn };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      deleteCategory(buildFormData({ categoryId: "cat-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?success=Categoria excluída.");

    expect(deleteEqFn).toHaveBeenCalledWith("id", "cat-1");
  });

  it("blocks deletion when equipment is linked", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "equipment") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      deleteCategory(buildFormData({ categoryId: "cat-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test
```

Expected: FAIL — functions not found.

- [ ] **Step 3: Implement all three category actions**

```typescript
export async function createCategory(formData: FormData) {
  const context = await requireWriteRole();

  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    redirect("/inventory/categories?error=Organização não encontrada.");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/inventory/categories?error=Nome é obrigatório.");

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("equipment_categories")
    .insert({ organization_id: organizationId, name });

  if (error) redirect(`/inventory/categories?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/inventory/categories");
  redirect("/inventory/categories?success=Categoria criada.");
}

export async function renameCategory(formData: FormData) {
  await requireWriteRole();

  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!categoryId || !name) redirect("/inventory/categories?error=Dados inválidos.");

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("equipment_categories")
    .update({ name })
    .eq("id", categoryId);

  if (error) redirect(`/inventory/categories?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/inventory/categories");
  revalidatePath("/inventory");
  redirect("/inventory/categories?success=Categoria renomeada.");
}

export async function deleteCategory(formData: FormData) {
  await requireWriteRole();

  const categoryId = String(formData.get("categoryId") ?? "").trim();
  if (!categoryId) redirect("/inventory/categories?error=Categoria inválida.");

  const supabase = createSupabaseAdminClient();

  const { count, error: countError } = await supabase
    .from("equipment")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);

  if (countError) redirect(`/inventory/categories?error=${encodeURIComponent(countError.message)}`);
  if (count && count > 0) {
    redirect("/inventory/categories?error=Categoria possui equipamentos vinculados. Remova ou reatribua-os primeiro.");
  }

  const { error } = await supabase
    .from("equipment_categories")
    .delete()
    .eq("id", categoryId);

  if (error) redirect(`/inventory/categories?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/inventory/categories");
  revalidatePath("/inventory");
  redirect("/inventory/categories?success=Categoria excluída.");
}
```

- [ ] **Step 4: Run to verify all tests pass**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/inventory.actions.test.ts src/app/\(dashboard\)/inventory/actions.ts
git commit -m "feat(inventory): add createCategory, renameCategory, deleteCategory server actions"
```

---

## Task 5: Extend `listEquipmentCategories` with equipment count

**Files:**
- Modify: `src/lib/inventory.ts`

- [ ] **Step 1: Update `EquipmentCategory` interface and `listEquipmentCategories` function**

In `src/lib/inventory.ts`, change `EquipmentCategory`:

```typescript
export interface EquipmentCategory {
  id: string;
  organizationId: string;
  name: string;
  equipmentCount: number;
}
```

Replace the `listEquipmentCategories` function body:

```typescript
export async function listEquipmentCategories(organizationId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_categories")
    .select("id, organization_id, name, equipment(count)")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) throw error;

  return (
    data?.map((c) => ({
      id: c.id,
      organizationId: c.organization_id,
      name: c.name,
      equipmentCount:
        (c.equipment as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    })) ?? []
  ) satisfies EquipmentCategory[];
}
```

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: all PASS (no test changes needed — `listEquipmentCategories` isn't tested directly).

- [ ] **Step 3: Commit**

```bash
git add src/lib/inventory.ts
git commit -m "feat(inventory): extend listEquipmentCategories with equipment count"
```

---

## Task 6: Rewrite `/inventory/[id]/page.tsx` — server component with real data

**Files:**
- Rewrite: `src/app/(dashboard)/inventory/[id]/page.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Package, Layers } from "lucide-react";

import { getCurrentUserContext } from "@/lib/auth/session";
import {
  getEquipmentById,
  listEquipmentCategories,
  formatPurchaseValue,
} from "@/lib/inventory";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { deleteEquipmentUnit } from "@/app/(dashboard)/inventory/actions";

import { EditEquipmentSheet } from "@/app/(dashboard)/inventory/[id]/EditEquipmentSheet";
import { AddUnitSheet } from "@/app/(dashboard)/inventory/[id]/AddUnitSheet";
import { UnitStatusForm } from "@/app/(dashboard)/inventory/[id]/UnitStatusForm";
import { BulkAdjustDialog } from "@/app/(dashboard)/inventory/[id]/BulkAdjustDialog";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}

export default async function InventoryDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { success, error: errorMsg } = await searchParams;

  const context = await getCurrentUserContext();
  const equipment = await getEquipmentById(id);

  if (!equipment) redirect("/inventory");

  const categories = context?.primaryOrganization?.id
    ? await listEquipmentCategories(context.primaryOrganization.id)
    : [];

  const canWrite = ["super_admin", "admin", "operations", "warehouse"].includes(
    context?.role ?? ""
  );

  return (
    <div className="max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/inventory" className="transition-colors hover:text-foreground">
          Inventário
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{equipment.name}</span>
      </nav>

      {/* Toast messages */}
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

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {equipment.type === "bulk" ? (
            <Layers className="h-7 w-7 text-amber-600" />
          ) : (
            <Package className="h-7 w-7 text-amber-600" />
          )}
          <div>
            <h1 className="text-2xl font-bold">{equipment.name}</h1>
            <p className="text-sm text-muted-foreground">
              {equipment.categoryName ?? "Sem categoria"}
            </p>
          </div>
          <StatusBadge status={equipment.status} type="item" />
        </div>
        {canWrite && (
          <EditEquipmentSheet equipment={equipment} categories={categories} />
        )}
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-border bg-card p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          {equipment.brand && (
            <div>
              <dt className="text-xs text-muted-foreground">Marca</dt>
              <dd className="mt-0.5 font-medium">{equipment.brand}</dd>
            </div>
          )}
          {equipment.model && (
            <div>
              <dt className="text-xs text-muted-foreground">Modelo</dt>
              <dd className="mt-0.5 font-medium">{equipment.model}</dd>
            </div>
          )}
          {equipment.type === "serialized" && equipment.serial && (
            <div>
              <dt className="text-xs text-muted-foreground">Serial</dt>
              <dd className="mt-0.5 font-mono font-medium">{equipment.serial}</dd>
            </div>
          )}
          {equipment.patrimony && (
            <div>
              <dt className="text-xs text-muted-foreground">Patrimônio</dt>
              <dd className="mt-0.5 font-mono font-medium">{equipment.patrimony}</dd>
            </div>
          )}
          {equipment.purchaseDate && (
            <div>
              <dt className="text-xs text-muted-foreground">Aquisição</dt>
              <dd className="mt-0.5 font-medium">
                {new Date(equipment.purchaseDate).toLocaleDateString("pt-BR")}
              </dd>
            </div>
          )}
          {equipment.purchaseValueCents != null && (
            <div>
              <dt className="text-xs text-muted-foreground">Valor</dt>
              <dd className="mt-0.5 font-medium">
                {formatPurchaseValue(equipment.purchaseValueCents)}
              </dd>
            </div>
          )}
          {equipment.qrCode && (
            <div>
              <dt className="text-xs text-muted-foreground">QR Token</dt>
              <dd className="mt-0.5 font-mono text-xs">{equipment.qrCode}</dd>
            </div>
          )}
        </dl>
        {equipment.notes && (
          <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
            {equipment.notes}
          </p>
        )}
      </div>

      {/* Serialized: units table */}
      {equipment.type === "serialized" && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold">
              Unidades ({equipment.units.length})
            </h2>
            {canWrite && <AddUnitSheet equipmentId={equipment.id} />}
          </div>
          {equipment.units.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nenhuma unidade cadastrada.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Serial
                  </th>
                  <th className="hidden px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                    Patrimônio
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  {canWrite && <th className="w-10 px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {equipment.units.map((unit) => (
                  <tr key={unit.id} className="group">
                    <td className="px-5 py-3 font-mono text-xs">{unit.serial}</td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground md:table-cell">
                      {unit.patrimony ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {canWrite ? (
                        <UnitStatusForm
                          unitId={unit.id}
                          equipmentId={equipment.id}
                          currentStatus={unit.status}
                        />
                      ) : (
                        <StatusBadge status={unit.status} type="item" />
                      )}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3">
                        <DeleteConfirmDialog
                          action={deleteEquipmentUnit}
                          itemId={unit.id}
                          itemName={unit.serial}
                          itemLabel="unidade"
                          hiddenFieldName="unitId"
                          title="Remover unidade"
                          description="Esta ação remove a unidade permanentemente e não pode ser desfeita."
                          confirmLabel="Remover"
                          pendingLabel="Removendo..."
                          render={
                            <button
                              type="button"
                              className="rounded-md p-1 text-muted-foreground/40 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                            />
                          }
                        >
                          <span className="sr-only">Remover {unit.serial}</span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4h6v2" />
                          </svg>
                        </DeleteConfirmDialog>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Bulk: stock card */}
      {equipment.type === "bulk" && equipment.bulk && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Estoque</h2>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tabular-nums">
                  {equipment.bulk.availableQty}
                </span>
                <span className="text-sm text-muted-foreground">
                  / {equipment.bulk.totalQty} {equipment.bulk.unit} disponíveis
                </span>
              </div>
            </div>
            {canWrite && <BulkAdjustDialog equipment={equipment} />}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles (the Sheet components don't exist yet — expect import errors, that's OK for now)**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only about missing `EditEquipmentSheet`, `AddUnitSheet`, `UnitStatusForm`, `BulkAdjustDialog` — not about the page logic itself.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/inventory/\[id\]/page.tsx
git commit -m "feat(inventory): rewrite detail page with real data"
```

---

## Task 7: `UnitStatusForm` client component

**Files:**
- Create: `src/app/(dashboard)/inventory/[id]/UnitStatusForm.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { updateEquipmentUnitStatus } from "@/app/(dashboard)/inventory/actions";
import type { EquipmentStatus } from "@/lib/inventory";

interface UnitStatusFormProps {
  unitId: string;
  equipmentId: string;
  currentStatus: EquipmentStatus;
}

export function UnitStatusForm({ unitId, equipmentId, currentStatus }: UnitStatusFormProps) {
  return (
    <form action={updateEquipmentUnitStatus}>
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <select
        name="status"
        defaultValue={currentStatus}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="cursor-pointer rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none transition focus:border-primary/50"
      >
        <option value="available">Disponível</option>
        <option value="reserved">Reservado</option>
        <option value="in_field">Em Campo</option>
        <option value="maintenance">Manutenção</option>
        <option value="inactive">Inativo</option>
      </select>
    </form>
  );
}
```

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/inventory/\[id\]/UnitStatusForm.tsx
git commit -m "feat(inventory): add UnitStatusForm client component"
```

---

## Task 8: `EditEquipmentSheet` client component

**Files:**
- Create: `src/app/(dashboard)/inventory/[id]/EditEquipmentSheet.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { Pencil } from "lucide-react";

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
import { updateEquipment, deactivateEquipment } from "@/app/(dashboard)/inventory/actions";
import type { Equipment, EquipmentCategory } from "@/lib/inventory";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface EditEquipmentSheetProps {
  equipment: Equipment;
  categories: EquipmentCategory[];
}

export function EditEquipmentSheet({ equipment, categories }: EditEquipmentSheetProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            className="h-9 rounded-xl px-3 text-sm font-medium"
          />
        }
      >
        <Pencil className="h-3.5 w-3.5" />
        Editar
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full max-w-2xl flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Editar equipamento</SheetTitle>
          <SheetDescription>Atualize os dados do equipamento.</SheetDescription>
        </SheetHeader>

        <form
          action={updateEquipment}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <input type="hidden" name="equipmentId" value={equipment.id} />

          <div className="flex flex-col gap-5 px-6 py-6">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Nome *</span>
              <input
                name="name"
                required
                defaultValue={equipment.name}
                className={INPUT_CLASS}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Marca</span>
                <input
                  name="brand"
                  defaultValue={equipment.brand ?? ""}
                  placeholder="Ex.: Yamaha"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Modelo</span>
                <input
                  name="model"
                  defaultValue={equipment.model ?? ""}
                  placeholder="Ex.: PM7"
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Categoria</span>
              <select
                name="categoryId"
                defaultValue={equipment.categoryId ?? ""}
                className={INPUT_CLASS}
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Observações</span>
              <textarea
                name="notes"
                rows={3}
                defaultValue={equipment.notes ?? ""}
                className={INPUT_CLASS + " resize-none"}
              />
            </label>
          </div>

          <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
            <SubmitButton
              idleLabel="Salvar alterações"
              pendingLabel="Salvando..."
              className="h-11 w-full rounded-2xl text-sm font-semibold"
            />
          </div>
        </form>

        <div className="border-t border-border px-6 py-3">
          <form
            action={deactivateEquipment}
            onSubmit={(e) => {
              if (!confirm("Desativar este equipamento permanentemente?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={equipment.id} />
            <button
              type="submit"
              className="text-sm text-red-600 hover:underline"
            >
              Desativar equipamento
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/inventory/\[id\]/EditEquipmentSheet.tsx
git commit -m "feat(inventory): add EditEquipmentSheet component"
```

---

## Task 9: `AddUnitSheet` client component

**Files:**
- Create: `src/app/(dashboard)/inventory/[id]/AddUnitSheet.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { Plus } from "lucide-react";

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
import { addEquipmentUnit } from "@/app/(dashboard)/inventory/actions";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface AddUnitSheetProps {
  equipmentId: string;
}

export function AddUnitSheet({ equipmentId }: AddUnitSheetProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button size="sm" className="rounded-xl" />}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar unidade
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full max-w-lg flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Adicionar unidade</SheetTitle>
          <SheetDescription>
            Insira os dados da nova unidade serializada. Um QR Code será gerado automaticamente.
          </SheetDescription>
        </SheetHeader>

        <form action={addEquipmentUnit} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <input type="hidden" name="equipmentId" value={equipmentId} />

          <div className="flex flex-col gap-5 px-6 py-6">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Número de série *</span>
              <input
                name="serial"
                required
                placeholder="Ex.: PM7-0042"
                className={INPUT_CLASS}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Nº Patrimônio</span>
              <input
                name="patrimony"
                placeholder="Ex.: PAT-2023-042"
                className={INPUT_CLASS}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Observações</span>
              <textarea
                name="notes"
                rows={3}
                placeholder="Informações adicionais..."
                className={INPUT_CLASS + " resize-none"}
              />
            </label>
          </div>

          <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
            <SubmitButton
              idleLabel="Adicionar unidade"
              pendingLabel="Salvando..."
              className="h-11 w-full rounded-2xl text-sm font-semibold"
            />
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/inventory/\[id\]/AddUnitSheet.tsx
git commit -m "feat(inventory): add AddUnitSheet component"
```

---

## Task 10: `BulkAdjustDialog` client component

**Files:**
- Create: `src/app/(dashboard)/inventory/[id]/BulkAdjustDialog.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { updateBulkInventory } from "@/app/(dashboard)/inventory/actions";
import type { Equipment } from "@/lib/inventory";

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

interface BulkAdjustDialogProps {
  equipment: Equipment;
}

export function BulkAdjustDialog({ equipment }: BulkAdjustDialogProps) {
  const bulk = equipment.bulk!;
  const [totalQty, setTotalQty] = useState(bulk.totalQty);
  const [availableQty, setAvailableQty] = useState(bulk.availableQty);
  const invalid = availableQty > totalQty || totalQty < 0 || availableQty < 0;

  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={
          <Button variant="outline" size="sm" className="rounded-xl" />
        }
      >
        Ajustar estoque
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />

        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-border bg-[color:color-mix(in_srgb,var(--card)_94%,white)] p-6 shadow-[0_30px_80px_rgba(17,17,17,0.18)] transition duration-200 ease-in-out data-ending-style:opacity-0 data-ending-style:scale-[0.98] data-starting-style:opacity-0 data-starting-style:scale-[0.98]">
          <Dialog.Title className="mb-1 text-base font-semibold">Ajustar estoque</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            Atualize as quantidades de <strong>{equipment.name}</strong>.
          </Dialog.Description>

          <form action={updateBulkInventory} className="space-y-4">
            <input type="hidden" name="equipmentId" value={equipment.id} />

            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Total ({bulk.unit})</span>
                <input
                  type="number"
                  name="totalQty"
                  min={0}
                  value={totalQty}
                  onChange={(e) => setTotalQty(Number(e.target.value))}
                  className={INPUT_CLASS}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Disponível</span>
                <input
                  type="number"
                  name="availableQty"
                  min={0}
                  value={availableQty}
                  onChange={(e) => setAvailableQty(Number(e.target.value))}
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            {invalid && (
              <p className="text-xs text-red-600">
                Disponível não pode ser maior que total.
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-2xl px-5 text-sm font-semibold"
                  />
                }
              >
                Cancelar
              </Dialog.Close>
              <SubmitButton
                idleLabel="Salvar"
                pendingLabel="Salvando..."
                disabled={invalid}
                className="h-10 rounded-2xl px-5 text-sm font-semibold"
              />
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 3: Verify the full detail page compiles**

```bash
npx tsc --noEmit 2>&1 | grep "inventory/\[id\]"
```

Expected: no errors from the `[id]` directory.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/inventory/\[id\]/BulkAdjustDialog.tsx
git commit -m "feat(inventory): add BulkAdjustDialog component"
```

---

## Task 11: Categories page + `CategoryManager`

**Files:**
- Create: `src/app/(dashboard)/inventory/categories/page.tsx`
- Create: `src/app/(dashboard)/inventory/categories/CategoryManager.tsx`

- [ ] **Step 1: Create `CategoryManager.tsx`**

```typescript
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
          className="flex items-center gap-2 border-b border-border bg-muted/30 px-5 py-3"
        >
          <input
            name="name"
            required
            autoFocus
            placeholder="Nome da nova categoria"
            className={INPUT_CLASS + " flex-1"}
          />
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
                      className="flex items-center gap-2"
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
```

- [ ] **Step 2: Create `categories/page.tsx`**

```typescript
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
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/inventory/categories/
git commit -m "feat(inventory): add categories page and CategoryManager component"
```

---

## Task 12: Add "Categorias" link to inventory list page

**Files:**
- Modify: `src/app/(dashboard)/inventory/page.tsx`

- [ ] **Step 1: Add the link to the header section**

In `src/app/(dashboard)/inventory/page.tsx`, find the header block:

```typescript
      {canWrite && <InventorySheet categories={categories} />}
```

Replace with:

```typescript
      {canWrite && (
        <div className="flex items-center gap-2">
          <Link
            href="/inventory/categories"
            className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-amber-500/40 hover:text-amber-600 flex items-center"
          >
            Categorias
          </Link>
          <InventorySheet categories={categories} />
        </div>
      )}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/inventory/page.tsx
git commit -m "feat(inventory): add Categorias link to inventory header"
```

---

## Self-Review Checklist

- [x] Spec: detail page (real data, serialized + bulk) → Tasks 6–10
- [x] Spec: edit equipment Sheet → Task 8
- [x] Spec: add/delete/status units → Tasks 2, 7, 9 (detail page)
- [x] Spec: bulk qty adjustment dialog → Task 10
- [x] Spec: categories page (create/rename/delete) → Tasks 4, 11
- [x] Spec: Categorias link in inventory header → Task 12
- [x] Spec: `listEquipmentCategories` with count → Task 5
- [x] No placeholders or TBDs
- [x] `deleteEquipmentUnit` takes only `unitId` (single hidden field) — consistent with `DeleteConfirmDialog` usage in detail page
- [x] `EquipmentCategory.equipmentCount` is non-optional — `CategoryManager` can safely reference it
- [x] `BulkAdjustDialog` uses `equipment.bulk!` — only rendered when `equipment.bulk` is defined (guarded in detail page: `{equipment.type === "bulk" && equipment.bulk && <BulkAdjustDialog .../>}`)
