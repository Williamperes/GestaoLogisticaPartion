import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserContext: vi.fn(),
  generateQrToken: vi.fn((prefix: string, id: string) => `PTN-${prefix}-${id.slice(0, 12)}`),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: mocks.getCurrentUserContext,
}));
vi.mock("@/lib/inventory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/inventory")>();
  return { ...actual, generateQrToken: mocks.generateQrToken };
});

import {
  createEquipment,
  deactivateEquipment,
  updateEquipmentUnitStatus,
  updateEquipment,
} from "@/app/(dashboard)/inventory/actions";

function buildFormData(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const ADMIN_CONTEXT = {
  role: "admin",
  userId: "user-1",
  primaryOrganization: { id: "org-1" },
};

describe("inventory actions", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Autorização ──────────────────────────────────────────────────

  it("blocks unauthenticated users", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);
    await expect(
      createEquipment(buildFormData({ type: "serialized", name: "Mesa" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
  });

  it("blocks users with insufficient role", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "client" });
    await expect(
      createEquipment(buildFormData({ type: "serialized", name: "Mesa" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
  });

  // ── Serializado ──────────────────────────────────────────────────

  it("creates a serialized equipment with a unit and QR code", async () => {
    const unitInsert = vi.fn().mockResolvedValue({ error: null });
    const equipUpdateResult = vi.fn().mockResolvedValue({ error: null });
    const eqUpdateEq = vi.fn().mockReturnValue(equipUpdateResult);
    const equipUpdate2 = vi.fn().mockReturnValue({ eq: eqUpdateEq });
    // single() must return { data, error } not just data
    const equipInsertSingle = vi.fn().mockResolvedValue({
      data: { id: "equip-abc" },
      error: null,
    });
    const equipInsertSelectFn = vi.fn().mockReturnValue({ single: equipInsertSingle });
    const equipInsert = vi.fn().mockReturnValue({ select: equipInsertSelectFn });

    let callCount = 0;
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "equipment") {
          callCount++;
          if (callCount === 1) return { insert: equipInsert };
          return { update: equipUpdate2 };
        }
        if (table === "equipment_units") return { insert: unitInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      createEquipment(
        buildFormData({
          type: "serialized",
          name: "Mesa Yamaha PM7",
          brand: "Yamaha",
          model: "PM7",
          serial: "PM7-0001",
          patrimony: "PAT-001",
          purchaseDate: "2024-01-15",
          purchaseValue: "15000",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/inventory?success=Equipamento cadastrado.");

    expect(equipInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        name: "Mesa Yamaha PM7",
        type: "serialized",
      })
    );
    expect(unitInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        equipment_id: "equip-abc",
        serial: "PM7-0001",
        status: "available",
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory");
  });

  // ── Lote ─────────────────────────────────────────────────────────

  it("creates a bulk equipment with bulk_inventory row", async () => {
    const bulkInsert = vi.fn().mockResolvedValue({ error: null });
    const equipInsertSingle = vi.fn().mockResolvedValue({
      data: { id: "equip-bulk-1" },
      error: null,
    });
    const equipInsertSelectFn = vi.fn().mockReturnValue({ single: equipInsertSingle });
    const equipInsert = vi.fn().mockReturnValue({ select: equipInsertSelectFn });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "equipment") return { insert: equipInsert };
        if (table === "bulk_inventory") return { insert: bulkInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      createEquipment(
        buildFormData({
          type: "bulk",
          name: "Cabo NL4",
          brand: "Neutrik",
          totalQty: "500",
          unit: "metros",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/inventory?success=Equipamento cadastrado.");

    expect(bulkInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        equipment_id: "equip-bulk-1",
        unit: "metros",
        total_qty: 500,
        available_qty: 500,
      })
    );
  });

  it("rejects bulk creation when totalQty is zero or invalid", async () => {
    const deleteEqChain = vi.fn().mockResolvedValue({ error: null });
    const deleteEq = vi.fn().mockReturnValue({ eq: deleteEqChain });
    const equipInsertSingle = vi.fn().mockResolvedValue({
      data: { id: "equip-bulk-bad" },
      error: null,
    });
    const equipInsertSelectFn = vi.fn().mockReturnValue({ single: equipInsertSingle });
    const equipInsert = vi.fn().mockReturnValue({ select: equipInsertSelectFn });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "equipment") return { insert: equipInsert, delete: deleteEq };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      createEquipment(buildFormData({ type: "bulk", name: "Cabo", totalQty: "0", unit: "metros" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Quantidade inv");
  });

  // ── Soft-delete ───────────────────────────────────────────────────

  it("soft-deletes equipment by setting status to inactive", async () => {
    const update = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockReturnValue(update);
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      deactivateEquipment(buildFormData({ id: "equip-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory?success=Equipamento desativado.");

    expect(updateFn).toHaveBeenCalledWith({ status: "inactive" });
    expect(updateEq).toHaveBeenCalledWith("id", "equip-1");
  });

  // ── Status de unit ───────────────────────────────────────────────

  it("rejects invalid status values", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      updateEquipmentUnitStatus(
        buildFormData({ unitId: "unit-1", status: "exploded", equipmentId: "equip-1" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?error=Status inválido.");
  });

  // ── updateEquipment ───────────────────────────────────────────────

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
});
