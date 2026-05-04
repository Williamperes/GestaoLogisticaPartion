# Equipment Registration — Design Spec
**Date:** 2026-05-04
**Status:** Approved

## Scope

Complete the equipment registration feature:
1. Detail page `/inventory/[id]` — replace mock data with real DB data
2. Edit equipment (name, brand, model, category, notes)
3. Unit management for serialized equipment (add, change status, delete)
4. Bulk inventory adjustment (totalQty + availableQty)
5. Category management at `/inventory/categories` (create, rename, delete)

## Architecture

### Approach
Sheet-based inline editing — consistent with existing `InventorySheet` and `EventSheet` patterns. No new API routes. All mutations via server actions + `revalidatePath`.

### New Files

```
src/app/(dashboard)/inventory/[id]/page.tsx              ← rewrite (mock → real)
src/app/(dashboard)/inventory/[id]/EditEquipmentSheet.tsx
src/app/(dashboard)/inventory/[id]/AddUnitSheet.tsx
src/app/(dashboard)/inventory/categories/page.tsx
src/app/(dashboard)/inventory/categories/CategoryManager.tsx
```

### New Server Actions (in `inventory/actions.ts`)

| Action | Description |
|--------|-------------|
| `updateEquipment(formData)` | Edit name, brand, model, category, notes |
| `addEquipmentUnit(formData)` | Add a unit to an existing serialized equipment |
| `deleteEquipmentUnit(formData)` | Remove a unit (hard delete) |
| `updateBulkInventory(formData)` | Adjust totalQty and availableQty |
| `createCategory(formData)` | Create a new category for the org |
| `renameCategory(formData)` | Rename an existing category |
| `deleteCategory(formData)` | Delete category — blocked if equipment is linked |

Existing actions (`updateEquipmentUnitStatus`, `deactivateEquipment`) remain unchanged.

## Detail Page `/inventory/[id]`

**Type:** Server component
**Data:** `getEquipmentById(id)` from `lib/inventory.ts` — already implemented. Redirects to `/inventory` if `null`.

### Serialized Layout

```
Header
  - Equipment name + StatusBadge
  - "Editar" button → opens EditEquipmentSheet

Info card
  - Brand, model, category, patrimony, serial, QR token
  - Purchase date, purchase value
  - Notes

Units table
  Columns: serial | patrimony | status (StatusBadge) | actions
  Actions per row:
    - Change status dropdown (available / reserved / maintenance / inactive / in_field)
    - Delete unit button → DeleteConfirmDialog → deleteEquipmentUnit
  Table footer: "Adicionar unidade" button → opens AddUnitSheet
```

### Bulk Layout

```
Header
  - Equipment name + StatusBadge
  - "Editar" button → opens EditEquipmentSheet

Info card
  - Brand, model, category, notes

Stock card
  - totalQty / availableQty / unit of measure displayed
  - "Ajustar estoque" button → opens a Dialog modal (not a Sheet) with two number inputs (totalQty, availableQty)
  - Client-side validation: availableQty <= totalQty before submit
  - DB constraint `bulk_inventory_available_lte_total` enforces the same rule as a hard backstop
  - Calls updateBulkInventory
```

## EditEquipmentSheet

**Type:** Client component (Sheet)
**Editable fields:** name, brand, model, category (select), notes
**Not editable:** type (serialized/bulk) — changing type would corrupt unit/bulk data
**Footer:** "Desativar equipamento" button → calls existing `deactivateEquipment` action (soft delete, sets status = inactive)

## AddUnitSheet

**Type:** Client component (Sheet)
**Fields:** serial (required), patrimony (optional), notes (optional)
**Action:** `addEquipmentUnit` → inserts into `equipment_units`, sets status = `available`, generates QR token via `generateQrToken("UN", equipmentId)`

## Categories Page `/inventory/categories`

**Type:** Server component for page; `CategoryManager` is a client component for inline interactions.

**Data:** `listEquipmentCategories` extended to include equipment count per category (add `equipment(count)` to select query — no new function needed).

### Layout

```
Header
  - "Categorias de Equipamento" title
  - "← Inventário" back link
  - "Nova Categoria" button → reveals inline input form at top of table

Table
  Columns: name | equipment count | actions
  Actions:
    - Rename (✎): click converts cell to inline input, submit calls renameCategory
    - Delete (🗑): disabled if count > 0; if count = 0, opens DeleteConfirmDialog → deleteCategory
```

### Delete Guard

`deleteCategory` server action checks equipment count before deleting. If count > 0, returns error. The UI also disables the button client-side, but server enforces as the source of truth.

### Navigation

Link to `/inventory/categories` accessible from the inventory page header as a text link "Categorias" placed next to the "Novo Item" button — visible only to roles with write access.

## Access Control

Follows existing role patterns:

| Action | Roles |
|--------|-------|
| View detail | all members |
| Edit equipment, manage units, adjust bulk | super_admin, admin, operations, warehouse |
| Delete unit, deactivate equipment | super_admin, admin, operations, warehouse |
| Manage categories | super_admin, admin, operations, warehouse |

All enforced via `requireWriteRole()` in server actions (already implemented).

## Error Handling

- Server actions redirect to `?error=<message>` on failure (consistent with existing pattern)
- Success redirects to `?success=<message>`
- Client-side form validation for required fields before submit

## Data Layer Changes

- `listEquipmentCategories` in `lib/inventory.ts`: extend select to include `equipment(count)` for the categories page
- No other changes to `lib/inventory.ts` — all existing fetch functions are sufficient
