import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserContext: vi.fn(),
  generateQrToken: vi.fn((prefix: string, id: string) => `PTN-${prefix}-${id.slice(0, 12)}`),
  getEquipmentAllocations: vi.fn(),
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
  return {
    ...actual,
    generateQrToken: mocks.generateQrToken,
    getEquipmentAllocations: mocks.getEquipmentAllocations,
  };
});

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
  createEquipmentVariant,
  updateEquipmentVariant,
  deleteEquipmentVariant,
  updateBulkInventoryVariant,
  setUnitQrCode,
  deleteEquipment,
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
        has_variants: false,
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

  // ── addEquipmentUnit ──────────────────────────────────────────────

  describe("addEquipmentUnit", () => {
    // Helper: monta o mock do client para o fluxo insert(array).select("id")
    // seguido de N updates de qr_code. `unitIds` é o que o insert "retorna".
    function buildUnitsClient(unitIds: string[]) {
      const insertSelect = vi
        .fn()
        .mockResolvedValue({ data: unitIds.map((id) => ({ id })), error: null });
      const insertFn = vi.fn().mockReturnValue({ select: insertSelect });

      const updateResult = vi.fn().mockResolvedValue({ error: null });
      const updateEqFn = vi.fn().mockReturnValue(updateResult);
      const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment_units") return { insert: insertFn, update: updateFn };
          return {};
        }),
      });
      return { insertFn, insertSelect, updateFn, updateEqFn };
    }

    it("inserts a single unit, generates QR code, and redirects with success", async () => {
      const { insertFn, updateFn } = buildUnitsClient(["unit-new"]);
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

      // insert recebe um ARRAY (mesmo com 1 unidade).
      expect(insertFn).toHaveBeenCalledWith([
        expect.objectContaining({
          equipment_id: "equip-1",
          serial: "PM7-0002",
          patrimony: "PAT-002",
          status: "available",
        }),
      ]);
      expect(mocks.generateQrToken).toHaveBeenCalledWith("UN", "unit-new");
      expect(updateFn).toHaveBeenCalledTimes(1);
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory/equip-1");
    });

    it("creates N units when quantity > 1, each with its own QR code", async () => {
      const { insertFn, updateFn } = buildUnitsClient(["u1", "u2", "u3"]);
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        addEquipmentUnit(
          buildFormData({ equipmentId: "equip-1", serial: "", quantity: "3" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?success=3 unidades adicionadas.");

      // 3 rows no array, cada uma com serial null (campo opcional vazio).
      const insertedRows = insertFn.mock.calls[0][0] as Array<{ serial: string | null }>;
      expect(insertedRows).toHaveLength(3);
      expect(insertedRows.every((r) => r.serial === null)).toBe(true);

      // Um QR gerado por unidade, derivado do id de cada uma.
      expect(mocks.generateQrToken).toHaveBeenCalledTimes(3);
      expect(mocks.generateQrToken).toHaveBeenCalledWith("UN", "u1");
      expect(mocks.generateQrToken).toHaveBeenCalledWith("UN", "u2");
      expect(mocks.generateQrToken).toHaveBeenCalledWith("UN", "u3");
      expect(updateFn).toHaveBeenCalledTimes(3);
    });

    it("treats empty serial/patrimony as null (serial is optional)", async () => {
      const { insertFn } = buildUnitsClient(["unit-x"]);
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        addEquipmentUnit(
          buildFormData({ equipmentId: "equip-1", serial: "  ", patrimony: "" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?success=Unidade adicionada.");

      expect(insertFn).toHaveBeenCalledWith([
        expect.objectContaining({ serial: null, patrimony: null }),
      ]);
    });

    it("rejects when equipmentId is missing", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        addEquipmentUnit(buildFormData({ equipmentId: "", serial: "X" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Equipamento inválido.");
    });

    it("rejects when quantity is zero", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        addEquipmentUnit(buildFormData({ equipmentId: "equip-1", quantity: "0" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?error=Quantidade%20deve%20estar");
    });

    it("rejects when quantity exceeds the batch limit", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        addEquipmentUnit(buildFormData({ equipmentId: "equip-1", quantity: "201" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?error=Quantidade%20deve%20estar");
    });

    it("defaults quantity to 1 when not provided", async () => {
      const { insertFn } = buildUnitsClient(["only-unit"]);
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        addEquipmentUnit(buildFormData({ equipmentId: "equip-1", serial: "S1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?success=Unidade adicionada.");

      expect((insertFn.mock.calls[0][0] as unknown[])).toHaveLength(1);
    });
  });

  // ── setUnitQrCode ─────────────────────────────────────────────────

  describe("setUnitQrCode", () => {
    it("vincula QR ao update + revalida path", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { id: "u1", equipment_id: "eq-1" },
        error: null,
      });
      const selectFn = vi.fn().mockReturnValue({ maybeSingle });
      const eqFn = vi.fn().mockReturnValue({ select: selectFn });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ update: updateFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      const result = await setUnitQrCode("u1", "QR-001");
      expect(result.ok).toBe(true);
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          qr_code: "QR-001",
          qr_linked_at: expect.any(String),
        })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory/eq-1");
    });

    it("rejeita QR duplicado (23505)", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "23505", message: "duplicate" },
      });
      const selectFn = vi.fn().mockReturnValue({ maybeSingle });
      const eqFn = vi.fn().mockReturnValue({ select: selectFn });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ update: updateFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      const result = await setUnitQrCode("u1", "QR-DUP");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/já está vinculado/i);
    });

    it("rejeita sem permissão", async () => {
      mocks.getCurrentUserContext.mockResolvedValue({ role: "viewer" });
      const result = await setUnitQrCode("u1", "QR");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/permissão/i);
    });

    it("rejeita QR vazio", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      const result = await setUnitQrCode("u1", "   ");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/vazio/i);
    });
  });

  // ── deleteEquipmentUnit ───────────────────────────────────────────

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

  // ── updateBulkInventory ───────────────────────────────────────────

  describe("updateBulkInventory", () => {
    it("updates total and available qty and redirects with success", async () => {
      const updateResult = vi.fn().mockResolvedValue({ error: null });
      const isFn = vi.fn().mockReturnValue(updateResult);
      const eqFn = vi.fn().mockReturnValue({ is: isFn });
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
      expect(isFn).toHaveBeenCalledWith("variant_id", null);
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

  // ── createCategory ────────────────────────────────────────────────

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

      expect(insertFn).toHaveBeenCalledWith({
        organization_id: "org-1",
        name: "Vídeo",
        parent_category_id: null,
      });
    });

    it("rejects when name is empty", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        createCategory(buildFormData({ name: "" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=Nome é obrigatório.");
    });
  });

  // ── renameCategory ────────────────────────────────────────────────

  describe("renameCategory", () => {
    it("updates category name and redirects with success", async () => {
      const updateResult = vi.fn().mockResolvedValue({ error: null });
      const eqFn = vi.fn().mockReturnValue(updateResult);
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn().mockReturnValue({ update: updateFn }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      // Sem `parentCategoryId` no form → server NÃO inclui parent_category_id no update.
      await expect(
        renameCategory(buildFormData({ categoryId: "cat-1", name: "Áudio Renamed" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?success=Categoria atualizada.");

      expect(updateFn).toHaveBeenCalledWith({ name: "Áudio Renamed" });
      expect(eqFn).toHaveBeenCalledWith("id", "cat-1");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory");
    });
  });

  // ── deleteCategory ────────────────────────────────────────────────

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

  // ── Refactor E: parent_category + variantes ─────────────────────

  describe("createCategory parent_category_id", () => {
    it("rejects when parent has parent (1-level enforcement)", async () => {
      const parentFetchMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: "cat-grand",
          organization_id: "org-1",
          parent_category_id: "cat-root", // já é sub-categoria
        },
        error: null,
      });
      const parentFetchEq = vi.fn().mockReturnValue({ maybeSingle: parentFetchMaybeSingle });
      const parentFetchSelect = vi.fn().mockReturnValue({ eq: parentFetchEq });
      const insertFn = vi.fn().mockResolvedValue({ error: null });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: parentFetchSelect,
          insert: insertFn,
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        createCategory(
          buildFormData({ name: "Gaveteiro", parentCategoryId: "cat-grand" })
        )
      ).rejects.toThrow(/Permitimos apenas 1 nível/);

      expect(insertFn).not.toHaveBeenCalled();
    });

    it("accepts when parent is a root category", async () => {
      const parentFetchMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: "cat-root", organization_id: "org-1", parent_category_id: null },
        error: null,
      });
      const parentFetchEq = vi.fn().mockReturnValue({ maybeSingle: parentFetchMaybeSingle });
      const parentFetchSelect = vi.fn().mockReturnValue({ eq: parentFetchEq });
      const insertFn = vi.fn().mockResolvedValue({ error: null });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: parentFetchSelect,
          insert: insertFn,
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        createCategory(
          buildFormData({ name: "Gaveteiro", parentCategoryId: "cat-root" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?success=Categoria criada.");

      expect(insertFn).toHaveBeenCalledWith({
        organization_id: "org-1",
        name: "Gaveteiro",
        parent_category_id: "cat-root",
      });
    });
  });

  describe("createEquipmentVariant", () => {
    it("inserts variant row and flips has_variants on first create", async () => {
      const equipFetchMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: "eq-1", organization_id: "org-1", type: "bulk", has_variants: false },
        error: null,
      });
      const equipFetchEq = vi.fn().mockReturnValue({ maybeSingle: equipFetchMaybeSingle });
      const equipFetchSelect = vi.fn().mockReturnValue({ eq: equipFetchEq });

      const variantInsertSingle = vi.fn().mockResolvedValue({ data: { id: "v-1" }, error: null });
      const variantInsertSelect = vi.fn().mockReturnValue({ single: variantInsertSingle });
      const variantInsert = vi.fn().mockReturnValue({ select: variantInsertSelect });

      const bulkInsert = vi.fn().mockResolvedValue({ error: null });

      const equipUpdateEq = vi.fn().mockResolvedValue({ error: null });
      const equipUpdate = vi.fn().mockReturnValue({ eq: equipUpdateEq });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment") return { select: equipFetchSelect, update: equipUpdate };
          if (table === "equipment_variants") return { insert: variantInsert };
          if (table === "bulk_inventory") return { insert: bulkInsert };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        createEquipmentVariant(
          buildFormData({
            equipmentId: "eq-1",
            label: "5M",
            sortValue: "5",
            position: "0",
            totalQty: "10",
            unit: "metros",
          })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?success=Variante criada.");

      expect(variantInsert).toHaveBeenCalledWith({
        equipment_id: "eq-1",
        label: "5M",
        sort_value: 5,
        position: 0,
        notes: null,
      });
      expect(bulkInsert).toHaveBeenCalledWith({
        equipment_id: "eq-1",
        variant_id: "v-1",
        unit: "metros",
        total_qty: 10,
        available_qty: 10,
      });
      // Equipment ganhou has_variants=true porque estava false.
      expect(equipUpdate).toHaveBeenCalledWith({ has_variants: true });
    });

    it("rejects when label is empty", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        createEquipmentVariant(buildFormData({ equipmentId: "eq-1", label: "" }))
      ).rejects.toThrow(/Label da variante é obrigatório/);
    });
  });

  describe("deleteEquipmentVariant", () => {
    it("blocks delete when variant is in use by an OS", async () => {
      const variantFetchMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: "v-1",
          equipment_id: "eq-1",
          equipment: { organization_id: "org-1" },
        },
        error: null,
      });
      const variantFetchEq = vi.fn().mockReturnValue({ maybeSingle: variantFetchMaybeSingle });
      const variantFetchSelect = vi.fn().mockReturnValue({ eq: variantFetchEq });

      const usageEq = vi.fn().mockResolvedValue({ count: 2, error: null });
      const usageSelect = vi.fn().mockReturnValue({ eq: usageEq });

      const variantDelete = vi.fn().mockResolvedValue({ error: null });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment_variants")
            return { select: variantFetchSelect, delete: variantDelete };
          if (table === "event_equipment") return { select: usageSelect };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        deleteEquipmentVariant(buildFormData({ variantId: "v-1" }))
      ).rejects.toThrow(/vinculada%20a%20uma%20OS|vinculada a uma OS/);

      expect(variantDelete).not.toHaveBeenCalled();
    });
  });

  // ── updateEquipmentVariant ─────────────────────────────────────────

  describe("updateEquipmentVariant", () => {
    it("updates label/sortValue/position and redirects with success", async () => {
      const variantFetchMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: "v-1",
          equipment_id: "eq-1",
          equipment: { organization_id: "org-1" },
        },
        error: null,
      });
      const variantFetchEq = vi.fn().mockReturnValue({ maybeSingle: variantFetchMaybeSingle });
      const variantFetchSelect = vi.fn().mockReturnValue({ eq: variantFetchEq });

      const variantUpdateEq = vi.fn().mockResolvedValue({ error: null });
      const variantUpdate = vi.fn().mockReturnValue({ eq: variantUpdateEq });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment_variants")
            return { select: variantFetchSelect, update: variantUpdate };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        updateEquipmentVariant(
          buildFormData({
            variantId: "v-1",
            label: "10M",
            sortValue: "10",
            position: "1",
            notes: "atualizado",
          })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?success=Variante atualizada.");

      expect(variantUpdate).toHaveBeenCalledWith({
        label: "10M",
        sort_value: 10,
        position: 1,
        notes: "atualizado",
      });
      expect(variantUpdateEq).toHaveBeenCalledWith("id", "v-1");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory/eq-1");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory");
    });
  });

  // ── updateBulkInventoryVariant ─────────────────────────────────────

  describe("updateBulkInventoryVariant", () => {
    it("updates existing row when bulk_inventory entry already exists", async () => {
      const equipFetchMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: "eq-1", organization_id: "org-1", type: "bulk", has_variants: true },
        error: null,
      });
      const equipFetchEq = vi.fn().mockReturnValue({ maybeSingle: equipFetchMaybeSingle });
      const equipFetchSelect = vi.fn().mockReturnValue({ eq: equipFetchEq });

      const existingMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: "bulk-row-1" },
        error: null,
      });
      const existingEq2 = vi.fn().mockReturnValue({ maybeSingle: existingMaybeSingle });
      const existingEq1 = vi.fn().mockReturnValue({ eq: existingEq2 });
      const existingSelect = vi.fn().mockReturnValue({ eq: existingEq1 });

      const updateEq = vi.fn().mockResolvedValue({ error: null });
      const updateFn = vi.fn().mockReturnValue({ eq: updateEq });

      const bulkInsert = vi.fn().mockResolvedValue({ error: null });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment") return { select: equipFetchSelect };
          if (table === "bulk_inventory")
            return { select: existingSelect, update: updateFn, insert: bulkInsert };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        updateBulkInventoryVariant(
          buildFormData({
            equipmentId: "eq-1",
            variantId: "v-1",
            totalQty: "50",
            availableQty: "40",
            unit: "metros",
          })
        )
      ).rejects.toThrow(/success=Estoque/);

      expect(updateFn).toHaveBeenCalledWith({
        total_qty: 50,
        available_qty: 40,
        unit: "metros",
      });
      expect(updateEq).toHaveBeenCalledWith("id", "bulk-row-1");
      expect(bulkInsert).not.toHaveBeenCalled();
    });

    it("inserts new row when no bulk_inventory entry exists for the variant", async () => {
      const equipFetchMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: "eq-1", organization_id: "org-1", type: "bulk", has_variants: true },
        error: null,
      });
      const equipFetchEq = vi.fn().mockReturnValue({ maybeSingle: equipFetchMaybeSingle });
      const equipFetchSelect = vi.fn().mockReturnValue({ eq: equipFetchEq });

      const existingMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const existingEq2 = vi.fn().mockReturnValue({ maybeSingle: existingMaybeSingle });
      const existingEq1 = vi.fn().mockReturnValue({ eq: existingEq2 });
      const existingSelect = vi.fn().mockReturnValue({ eq: existingEq1 });

      const updateEq = vi.fn().mockResolvedValue({ error: null });
      const updateFn = vi.fn().mockReturnValue({ eq: updateEq });

      const bulkInsert = vi.fn().mockResolvedValue({ error: null });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment") return { select: equipFetchSelect };
          if (table === "bulk_inventory")
            return { select: existingSelect, update: updateFn, insert: bulkInsert };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        updateBulkInventoryVariant(
          buildFormData({
            equipmentId: "eq-1",
            variantId: "v-2",
            totalQty: "30",
            availableQty: "30",
            unit: "unidades",
          })
        )
      ).rejects.toThrow(/success=Estoque/);

      expect(bulkInsert).toHaveBeenCalledWith({
        equipment_id: "eq-1",
        variant_id: "v-2",
        unit: "unidades",
        total_qty: 30,
        available_qty: 30,
      });
      expect(updateFn).not.toHaveBeenCalled();
    });
  });

  // ── addEquipmentUnit (com variantId) ───────────────────────────────

  describe("addEquipmentUnit with variantId", () => {
    it("persists variant_id on every row when provided", async () => {
      const insertSelect = vi
        .fn()
        .mockResolvedValue({ data: [{ id: "unit-2" }, { id: "unit-3" }], error: null });
      const insertFn = vi.fn().mockReturnValue({ select: insertSelect });
      const updateResult = vi.fn().mockResolvedValue({ error: null });
      const updateEqFn = vi.fn().mockReturnValue(updateResult);
      const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn });

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
            equipmentId: "eq-1",
            serial: "",
            patrimony: "",
            notes: "",
            variantId: "v-5m",
            quantity: "2",
          })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?success=2 unidades adicionadas.");

      const rows = insertFn.mock.calls[0][0] as Array<{ variant_id: string }>;
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.variant_id === "v-5m")).toBe(true);
    });
  });

  // ── createEquipment hasVariants=true skip auto-create ──────────────

  describe("createEquipment with hasVariants=true", () => {
    it("skips auto-create of unit (serialized) and redirects to detail page", async () => {
      const equipUpdateResult = vi.fn().mockResolvedValue({ error: null });
      const eqUpdateEq = vi.fn().mockReturnValue(equipUpdateResult);
      const equipUpdate2 = vi.fn().mockReturnValue({ eq: eqUpdateEq });
      const equipInsertSingle = vi.fn().mockResolvedValue({
        data: { id: "eq-variants" },
        error: null,
      });
      const equipInsertSelectFn = vi.fn().mockReturnValue({ single: equipInsertSingle });
      const equipInsert = vi.fn().mockReturnValue({ select: equipInsertSelectFn });

      const unitInsert = vi.fn().mockResolvedValue({ error: null });

      let equipCalls = 0;
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment") {
            equipCalls++;
            if (equipCalls === 1) return { insert: equipInsert };
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
            name: "Cabo XLR",
            serial: "CABO-XLR-MASTER",
            hasVariants: "on",
          })
        )
      ).rejects.toThrow(
        /NEXT_REDIRECT:\/inventory\/eq-variants\?success=Equipamento%20cadastrado/
      );

      expect(equipInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Cabo XLR",
          type: "serialized",
          has_variants: true,
        })
      );
      // Auto-create de unit DEVE ser pulado.
      expect(unitInsert).not.toHaveBeenCalled();
    });

    it("skips auto-create of bulk_inventory row when type=bulk + hasVariants=on", async () => {
      const equipInsertSingle = vi.fn().mockResolvedValue({
        data: { id: "eq-bulk-var" },
        error: null,
      });
      const equipInsertSelectFn = vi.fn().mockReturnValue({ single: equipInsertSingle });
      const equipInsert = vi.fn().mockReturnValue({ select: equipInsertSelectFn });

      const bulkInsert = vi.fn().mockResolvedValue({ error: null });

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
            name: "Extensão",
            unit: "metros",
            hasVariants: "on",
          })
        )
      ).rejects.toThrow(/success=Equipamento%20cadastrado/);

      expect(equipInsert).toHaveBeenCalledWith(
        expect.objectContaining({ type: "bulk", has_variants: true })
      );
      expect(bulkInsert).not.toHaveBeenCalled();
    });
  });

  // ── updateEquipment toggling has_variants ──────────────────────────

  describe("updateEquipment has_variants toggle", () => {
    it("sets has_variants=true when checkbox is on", async () => {
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
            categoryId: "cat-1",
            hasVariants: "on",
          })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/equip-1?success=Equipamento atualizado.");

      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({ has_variants: true })
      );
    });
  });

  // ── renameCategory validation (1-level enforcement) ────────────────

  describe("renameCategory parent_category_id", () => {
    it("rejects when assigning parent that already has parent (1-level)", async () => {
      // Mock for validateCategoryParent: parent has parent → reject
      const parentFetchMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: "parent-cat",
          organization_id: "org-1",
          parent_category_id: "grandparent-cat",
        },
        error: null,
      });
      const parentFetchEq = vi.fn().mockReturnValue({ maybeSingle: parentFetchMaybeSingle });
      const parentFetchSelect = vi.fn().mockReturnValue({ eq: parentFetchEq });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: parentFetchSelect })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        renameCategory(
          buildFormData({
            categoryId: "cat-self",
            name: "Sub-Gaveteiro",
            parentCategoryId: "parent-cat",
          })
        )
      ).rejects.toThrow(/Permitimos apenas 1 n[íi]vel/);
    });
  });

  // ── createEquipment: org-not-found, validation, DB errors ──────────

  describe("createEquipment edge cases", () => {
    it("redirects when the user has no primary organization", async () => {
      mocks.getCurrentUserContext.mockResolvedValue({ role: "admin", primaryOrganization: null });
      await expect(
        createEquipment(buildFormData({ type: "serialized", name: "Mesa" }))
      ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
    });

    it("rejects invalid type/name", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        createEquipment(buildFormData({ type: "weird", name: "Mesa" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Dados inv");
    });

    it("redirects when the base equipment insert fails", async () => {
      const equipInsertSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "insert boom" },
      });
      const equipInsertSelectFn = vi.fn().mockReturnValue({ single: equipInsertSingle });
      const equipInsert = vi.fn().mockReturnValue({ select: equipInsertSelectFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ insert: equipInsert })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        createEquipment(buildFormData({ type: "serialized", name: "Mesa" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=insert%20boom");
    });

    it("rolls back equipment and redirects when serialized unit insert fails", async () => {
      const unitInsert = vi.fn().mockResolvedValue({ error: { message: "unit boom" } });
      const deleteEqResult = vi.fn().mockResolvedValue({ error: null });
      const deleteEqFn = vi.fn().mockReturnValue(deleteEqResult);
      const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn });
      const equipUpdateResult = vi.fn().mockResolvedValue({ error: null });
      const eqUpdateEq = vi.fn().mockReturnValue(equipUpdateResult);
      const equipUpdate2 = vi.fn().mockReturnValue({ eq: eqUpdateEq });
      const equipInsertSingle = vi.fn().mockResolvedValue({ data: { id: "eq-1" }, error: null });
      const equipInsertSelectFn = vi.fn().mockReturnValue({ single: equipInsertSingle });
      const equipInsert = vi.fn().mockReturnValue({ select: equipInsertSelectFn });

      let calls = 0;
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment") {
            calls++;
            if (calls === 1) return { insert: equipInsert };
            return { update: equipUpdate2, delete: deleteFn };
          }
          if (table === "equipment_units") return { insert: unitInsert };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        createEquipment(buildFormData({ type: "serialized", name: "Mesa" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=unit%20boom");

      expect(deleteFn).toHaveBeenCalled();
    });

    it("uses a provided qrCode for the unit when given (serialized, no variants)", async () => {
      const unitInsert = vi.fn().mockResolvedValue({ error: null });
      const equipUpdateResult = vi.fn().mockResolvedValue({ error: null });
      const eqUpdateEq = vi.fn().mockReturnValue(equipUpdateResult);
      const equipUpdate2 = vi.fn().mockReturnValue({ eq: eqUpdateEq });
      const equipInsertSingle = vi.fn().mockResolvedValue({ data: { id: "eq-1" }, error: null });
      const equipInsertSelectFn = vi.fn().mockReturnValue({ single: equipInsertSingle });
      const equipInsert = vi.fn().mockReturnValue({ select: equipInsertSelectFn });

      let calls = 0;
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment") {
            calls++;
            if (calls === 1) return { insert: equipInsert };
            return { update: equipUpdate2 };
          }
          if (table === "equipment_units") return { insert: unitInsert };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        createEquipment(
          buildFormData({ type: "serialized", name: "Mesa", qrCode: "STICKER-99" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?success=Equipamento cadastrado.");

      expect(unitInsert).toHaveBeenCalledWith(
        expect.objectContaining({ qr_code: "STICKER-99" })
      );
    });

    it("rolls back equipment and redirects when bulk insert fails", async () => {
      const bulkInsert = vi.fn().mockResolvedValue({ error: { message: "bulk boom" } });
      const deleteEqResult = vi.fn().mockResolvedValue({ error: null });
      const deleteEqFn = vi.fn().mockReturnValue(deleteEqResult);
      const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn });
      const equipInsertSingle = vi.fn().mockResolvedValue({ data: { id: "eq-b" }, error: null });
      const equipInsertSelectFn = vi.fn().mockReturnValue({ single: equipInsertSingle });
      const equipInsert = vi.fn().mockReturnValue({ select: equipInsertSelectFn });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment") return { insert: equipInsert, delete: deleteFn };
          if (table === "bulk_inventory") return { insert: bulkInsert };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        createEquipment(buildFormData({ type: "bulk", name: "Cabo", totalQty: "10" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=bulk%20boom");

      expect(deleteFn).toHaveBeenCalled();
    });
  });

  // ── updateEquipmentUnitStatus success + DB error ───────────────────

  describe("updateEquipmentUnitStatus", () => {
    it("updates status and revalidates on success", async () => {
      const updateResult = vi.fn().mockResolvedValue({ error: null });
      const eqFn = vi.fn().mockReturnValue(updateResult);
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ update: updateFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await updateEquipmentUnitStatus(
        buildFormData({ unitId: "u-1", status: "maintenance", equipmentId: "eq-1" })
      );

      expect(updateFn).toHaveBeenCalledWith({ status: "maintenance" });
      expect(eqFn).toHaveBeenCalledWith("id", "u-1");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory/eq-1");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory");
    });

    it("redirects with the error message when the update fails", async () => {
      const eqFn = vi.fn().mockResolvedValue({ error: { message: "boom" } });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ update: updateFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        updateEquipmentUnitStatus(
          buildFormData({ unitId: "u-1", status: "available", equipmentId: "eq-1" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=boom");
    });
  });

  // ── setUnitQrCode extra branches ───────────────────────────────────

  describe("setUnitQrCode extra branches", () => {
    it("rejects empty unitId", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      const result = await setUnitQrCode("   ", "QR");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/inválida/i);
    });

    it("returns the generic error message for non-23505 update errors", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "other", message: "weird db error" },
      });
      const selectFn = vi.fn().mockReturnValue({ maybeSingle });
      const eqFn = vi.fn().mockReturnValue({ select: selectFn });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ update: updateFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      const result = await setUnitQrCode("u1", "QR");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("weird db error");
    });

    it("returns not-found when the update matches no unit", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const selectFn = vi.fn().mockReturnValue({ maybeSingle });
      const eqFn = vi.fn().mockReturnValue({ select: selectFn });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ update: updateFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      const result = await setUnitQrCode("u1", "QR");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/não encontrada/i);
    });
  });

  // ── deactivateEquipment validation + DB error ──────────────────────

  describe("deactivateEquipment edge cases", () => {
    it("rejects when id is missing", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deactivateEquipment(buildFormData({ id: "" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Equipamento inválido.");
    });

    it("redirects with the error message when the update fails", async () => {
      const eqFn = vi.fn().mockResolvedValue({ error: { message: "boom" } });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ update: updateFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        deactivateEquipment(buildFormData({ id: "eq-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=boom");
    });
  });

  // ── deleteEquipment (full coverage) ────────────────────────────────

  describe("deleteEquipment", () => {
    function buildEquipFetch(data: unknown, error: unknown = null) {
      const maybeSingle = vi.fn().mockResolvedValue({ data, error });
      const eq2 = vi.fn().mockReturnValue({ maybeSingle });
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
      const select = vi.fn().mockReturnValue({ eq: eq1 });
      return select;
    }

    it("blocks non-admin roles (warehouse) via requireDeleteRole", async () => {
      mocks.getCurrentUserContext.mockResolvedValue({ role: "warehouse", primaryOrganization: { id: "org-1" } });
      await expect(
        deleteEquipment(buildFormData({ id: "eq-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
    });

    it("blocks unauthenticated users via requireDeleteRole", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(null);
      await expect(
        deleteEquipment(buildFormData({ id: "eq-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
    });

    it("rejects when id is missing", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipment(buildFormData({ id: "" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Equipamento inválido.");
    });

    it("redirects when the ownership fetch errors", async () => {
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: buildEquipFetch(null, { message: "fetch boom" }) })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipment(buildFormData({ id: "eq-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=fetch%20boom");
    });

    it("redirects when the equipment is not found in the org", async () => {
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: buildEquipFetch(null) })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipment(buildFormData({ id: "eq-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Equipamento n");
    });

    it("blocks deletion when the equipment is allocated to an active OS", async () => {
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: buildEquipFetch({ id: "eq-1" }) })),
      });
      mocks.getEquipmentAllocations.mockResolvedValue([{ id: "alloc-1" }]);
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipment(buildFormData({ id: "eq-1" }))
      ).rejects.toThrow(/alocado%20em%20OS/);
    });

    it("redirects when the delete fails", async () => {
      const deleteEq2 = vi.fn().mockResolvedValue({ error: { message: "del boom" } });
      const deleteEq1 = vi.fn().mockReturnValue({ eq: deleteEq2 });
      const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq1 });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: buildEquipFetch({ id: "eq-1" }), delete: deleteFn })),
      });
      mocks.getEquipmentAllocations.mockResolvedValue([]);
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipment(buildFormData({ id: "eq-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=del%20boom");
    });

    it("deletes successfully when not allocated", async () => {
      const deleteEq2 = vi.fn().mockResolvedValue({ error: null });
      const deleteEq1 = vi.fn().mockReturnValue({ eq: deleteEq2 });
      const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq1 });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: buildEquipFetch({ id: "eq-1" }), delete: deleteFn })),
      });
      mocks.getEquipmentAllocations.mockResolvedValue([]);
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipment(buildFormData({ id: "eq-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?success=Equipamento apagado.");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventory");
    });
  });

  // ── updateEquipment DB error ───────────────────────────────────────

  it("updateEquipment redirects with the error message when the update fails", async () => {
    const eqFn = vi.fn().mockResolvedValue({ error: { message: "upd boom" } });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ update: updateFn })),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEquipment(buildFormData({ equipmentId: "eq-1", name: "X" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=upd%20boom");
  });

  // ── addEquipmentUnit insert error ──────────────────────────────────

  it("addEquipmentUnit redirects when the units insert fails", async () => {
    const insertSelect = vi.fn().mockResolvedValue({ data: null, error: { message: "ins boom" } });
    const insertFn = vi.fn().mockReturnValue({ select: insertSelect });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ insert: insertFn })),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEquipmentUnit(buildFormData({ equipmentId: "eq-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=ins%20boom");
  });

  // ── deleteEquipmentUnit: not found + delete error ──────────────────

  describe("deleteEquipmentUnit edge cases", () => {
    it("redirects when the unit is not found", async () => {
      const fetchSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "nope" } });
      const fetchEq = vi.fn().mockReturnValue({ single: fetchSingle });
      const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: fetchSelect })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipmentUnit(buildFormData({ unitId: "u-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Unidade não encontrada.");
    });

    it("redirects with the error message when the delete fails", async () => {
      const fetchSingle = vi.fn().mockResolvedValue({ data: { equipment_id: "eq-1" }, error: null });
      const fetchEq = vi.fn().mockReturnValue({ single: fetchSingle });
      const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq });
      const deleteEqFn = vi.fn().mockResolvedValue({ error: { message: "del boom" } });
      const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: fetchSelect, delete: deleteFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipmentUnit(buildFormData({ unitId: "u-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=del%20boom");
    });
  });

  // ── updateBulkInventory DB error ───────────────────────────────────

  it("updateBulkInventory redirects when the update fails", async () => {
    const isFn = vi.fn().mockResolvedValue({ error: { message: "bulk boom" } });
    const eqFn = vi.fn().mockReturnValue({ is: isFn });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ update: updateFn })),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateBulkInventory(buildFormData({ equipmentId: "eq-1", totalQty: "10", availableQty: "5" }))
    ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=bulk%20boom");
  });

  // ── createCategory: org-not-found + DB error ───────────────────────

  describe("createCategory edge cases", () => {
    it("redirects when the user has no primary organization", async () => {
      mocks.getCurrentUserContext.mockResolvedValue({ role: "admin", primaryOrganization: null });
      await expect(
        createCategory(buildFormData({ name: "Áudio" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=Organiza");
    });

    it("redirects with the error message when the insert fails", async () => {
      const insertFn = vi.fn().mockResolvedValue({ error: { message: "cat boom" } });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ insert: insertFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        createCategory(buildFormData({ name: "Áudio" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=cat%20boom");
    });

    it("rejects when the parent category belongs to another org", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { id: "p", organization_id: "other-org", parent_category_id: null },
        error: null,
      });
      const eqFn = vi.fn().mockReturnValue({ maybeSingle });
      const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: selectFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        createCategory(buildFormData({ name: "Sub", parentCategoryId: "p" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=Categoria pai inválida.");
    });
  });

  // ── renameCategory: org-not-found, validation, child-block, errors ─

  describe("renameCategory edge cases", () => {
    it("redirects when the user has no primary organization", async () => {
      mocks.getCurrentUserContext.mockResolvedValue({ role: "admin", primaryOrganization: null });
      await expect(
        renameCategory(buildFormData({ categoryId: "c-1", name: "X" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=Organiza");
    });

    it("rejects when categoryId or name is missing", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        renameCategory(buildFormData({ categoryId: "", name: "X" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=Dados inválidos.");
    });

    it("rejects making a category its own parent", async () => {
      mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => ({})) });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        renameCategory(
          buildFormData({ categoryId: "c-1", name: "X", parentCategoryId: "c-1" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=Categoria não pode ser pai dela mesma.");
    });

    it("rejects making a category with children a sub-category", async () => {
      const parentMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: "parent", organization_id: "org-1", parent_category_id: null },
        error: null,
      });
      const parentEq = vi.fn().mockReturnValue({ maybeSingle: parentMaybeSingle });
      const parentSelect = vi.fn().mockReturnValue({ eq: parentEq });
      // count query for children
      const countEq = vi.fn().mockResolvedValue({ count: 2, error: null });
      const countSelect = vi.fn().mockReturnValue({ eq: countEq });

      let selectCalls = 0;
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn((...args: unknown[]) => {
            selectCalls++;
            return selectCalls === 1 ? parentSelect(...args) : countSelect(...args);
          }),
        })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        renameCategory(
          buildFormData({ categoryId: "c-1", name: "X", parentCategoryId: "parent" })
        )
      ).rejects.toThrow(/sub-categorias/);
    });

    it("redirects when the children count query errors", async () => {
      const parentMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: "parent", organization_id: "org-1", parent_category_id: null },
        error: null,
      });
      const parentEq = vi.fn().mockReturnValue({ maybeSingle: parentMaybeSingle });
      const parentSelect = vi.fn().mockReturnValue({ eq: parentEq });
      const countEq = vi.fn().mockResolvedValue({ count: null, error: { message: "count boom" } });
      const countSelect = vi.fn().mockReturnValue({ eq: countEq });

      let selectCalls = 0;
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn((...args: unknown[]) => {
            selectCalls++;
            return selectCalls === 1 ? parentSelect(...args) : countSelect(...args);
          }),
        })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        renameCategory(
          buildFormData({ categoryId: "c-1", name: "X", parentCategoryId: "parent" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=count%20boom");
    });

    it("clears parent (empty string) and updates parent_category_id to null", async () => {
      const updateResult = vi.fn().mockResolvedValue({ error: null });
      const eqFn = vi.fn().mockReturnValue(updateResult);
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ update: updateFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

      await expect(
        renameCategory(buildFormData({ categoryId: "c-1", name: "X", parentCategoryId: "" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?success=Categoria atualizada.");

      expect(updateFn).toHaveBeenCalledWith({ name: "X", parent_category_id: null });
    });

    it("redirects with the error message when the update fails", async () => {
      const eqFn = vi.fn().mockResolvedValue({ error: { message: "ren boom" } });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ update: updateFn })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        renameCategory(buildFormData({ categoryId: "c-1", name: "X" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=ren%20boom");
    });
  });

  // ── deleteCategory edge cases ──────────────────────────────────────

  describe("deleteCategory edge cases", () => {
    it("rejects when categoryId is missing", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteCategory(buildFormData({ categoryId: "" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=Categoria inválida.");
    });

    it("redirects when the count query errors", async () => {
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: null, error: { message: "count boom" } }),
          }),
        })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteCategory(buildFormData({ categoryId: "c-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=count%20boom");
    });

    it("redirects with the error message when the delete fails", async () => {
      const deleteEqFn = vi.fn().mockResolvedValue({ error: { message: "del boom" } });
      const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment") {
            return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ count: 0, error: null }) }) };
          }
          return { delete: deleteFn };
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteCategory(buildFormData({ categoryId: "c-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/categories?error=del%20boom");
    });
  });

  // ── createEquipmentVariant edge cases ──────────────────────────────

  describe("createEquipmentVariant edge cases", () => {
    function buildEquipMeta(data: unknown, error: unknown = null) {
      const maybeSingle = vi.fn().mockResolvedValue({ data, error });
      const eqFn = vi.fn().mockReturnValue({ maybeSingle });
      return vi.fn().mockReturnValue({ eq: eqFn });
    }

    it("redirects when the user has no primary organization", async () => {
      mocks.getCurrentUserContext.mockResolvedValue({ role: "admin", primaryOrganization: null });
      await expect(
        createEquipmentVariant(buildFormData({ equipmentId: "eq-1", label: "L" }))
      ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
    });

    it("rejects when the equipment is not in the org", async () => {
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: buildEquipMeta(null) })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        createEquipmentVariant(buildFormData({ equipmentId: "eq-1", label: "L" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=Equipamento inválido.");
    });

    it("creates a serialized variant without touching bulk/has_variants when already set", async () => {
      const variantInsertSingle = vi.fn().mockResolvedValue({ data: { id: "v-9" }, error: null });
      const variantInsertSelect = vi.fn().mockReturnValue({ single: variantInsertSingle });
      const variantInsert = vi.fn().mockReturnValue({ select: variantInsertSelect });
      const bulkInsert = vi.fn().mockResolvedValue({ error: null });
      const equipUpdate = vi.fn();
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment")
            return {
              select: buildEquipMeta({ id: "eq-1", organization_id: "org-1", type: "serialized", has_variants: true }),
              update: equipUpdate,
            };
          if (table === "equipment_variants") return { insert: variantInsert };
          if (table === "bulk_inventory") return { insert: bulkInsert };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        createEquipmentVariant(buildFormData({ equipmentId: "eq-1", label: "P", totalQty: "10" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?success=Variante criada.");
      // serialized → bulk insert skipped even with totalQty; has_variants already true → no update
      expect(bulkInsert).not.toHaveBeenCalled();
      expect(equipUpdate).not.toHaveBeenCalled();
    });

    it("returns a friendly message on duplicate variant (23505)", async () => {
      const variantInsertSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "23505", message: "dup" },
      });
      const variantInsertSelect = vi.fn().mockReturnValue({ single: variantInsertSingle });
      const variantInsert = vi.fn().mockReturnValue({ select: variantInsertSelect });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment")
            return { select: buildEquipMeta({ id: "eq-1", organization_id: "org-1", type: "serialized", has_variants: true }) };
          if (table === "equipment_variants") return { insert: variantInsert };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        createEquipmentVariant(buildFormData({ equipmentId: "eq-1", label: "5M" }))
      ).rejects.toThrow(/existe%20uma%20variante/);
    });

    it("redirects with the generic error message on non-23505 insert error", async () => {
      const variantInsertSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "other", message: "var boom" },
      });
      const variantInsertSelect = vi.fn().mockReturnValue({ single: variantInsertSingle });
      const variantInsert = vi.fn().mockReturnValue({ select: variantInsertSelect });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment")
            return { select: buildEquipMeta({ id: "eq-1", organization_id: "org-1", type: "serialized", has_variants: true }) };
          if (table === "equipment_variants") return { insert: variantInsert };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        createEquipmentVariant(buildFormData({ equipmentId: "eq-1", label: "5M" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=var%20boom");
    });

    it("rolls back the variant when the bulk_inventory insert fails", async () => {
      const variantInsertSingle = vi.fn().mockResolvedValue({ data: { id: "v-1" }, error: null });
      const variantInsertSelect = vi.fn().mockReturnValue({ single: variantInsertSingle });
      const variantInsert = vi.fn().mockReturnValue({ select: variantInsertSelect });
      const variantDeleteEq = vi.fn().mockResolvedValue({ error: null });
      const variantDelete = vi.fn().mockReturnValue({ eq: variantDeleteEq });
      const bulkInsert = vi.fn().mockResolvedValue({ error: { message: "bulk boom" } });

      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment")
            return { select: buildEquipMeta({ id: "eq-1", organization_id: "org-1", type: "bulk", has_variants: true }) };
          if (table === "equipment_variants") return { insert: variantInsert, delete: variantDelete };
          if (table === "bulk_inventory") return { insert: bulkInsert };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        createEquipmentVariant(buildFormData({ equipmentId: "eq-1", label: "5M", totalQty: "10" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=bulk%20boom");
      expect(variantDelete).toHaveBeenCalled();
    });
  });

  // ── updateEquipmentVariant edge cases ──────────────────────────────

  describe("updateEquipmentVariant edge cases", () => {
    function buildVariantFetch(data: unknown, error: unknown = null) {
      const maybeSingle = vi.fn().mockResolvedValue({ data, error });
      const eqFn = vi.fn().mockReturnValue({ maybeSingle });
      return vi.fn().mockReturnValue({ eq: eqFn });
    }

    it("redirects when the user has no primary organization", async () => {
      mocks.getCurrentUserContext.mockResolvedValue({ role: "admin", primaryOrganization: null });
      await expect(
        updateEquipmentVariant(buildFormData({ variantId: "v-1", label: "L" }))
      ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
    });

    it("rejects when variantId is missing", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        updateEquipmentVariant(buildFormData({ variantId: "", label: "L" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Variante inválida.");
    });

    it("rejects when label is empty", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        updateEquipmentVariant(buildFormData({ variantId: "v-1", label: "  " }))
      ).rejects.toThrow(/Label%20da%20variante/);
    });

    it("redirects when the variant is not found", async () => {
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: buildVariantFetch(null) })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        updateEquipmentVariant(buildFormData({ variantId: "v-1", label: "L" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Variante não encontrada.");
    });

    it("rejects when the variant belongs to another org", async () => {
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({
          select: buildVariantFetch({
            id: "v-1",
            equipment_id: "eq-1",
            equipment: { organization_id: "other-org" },
          }),
        })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        updateEquipmentVariant(buildFormData({ variantId: "v-1", label: "L" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Variante inválida.");
    });

    it("returns a friendly message on duplicate (23505)", async () => {
      const variantUpdateEq = vi.fn().mockResolvedValue({ error: { code: "23505", message: "dup" } });
      const variantUpdate = vi.fn().mockReturnValue({ eq: variantUpdateEq });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({
          select: buildVariantFetch({
            id: "v-1",
            equipment_id: "eq-1",
            equipment: { organization_id: "org-1" },
          }),
          update: variantUpdate,
        })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        updateEquipmentVariant(buildFormData({ variantId: "v-1", label: "10M" }))
      ).rejects.toThrow(/existe%20uma%20variante/);
    });

    it("redirects with the generic error message on non-23505 update error", async () => {
      const variantUpdateEq = vi.fn().mockResolvedValue({ error: { code: "x", message: "upd boom" } });
      const variantUpdate = vi.fn().mockReturnValue({ eq: variantUpdateEq });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({
          select: buildVariantFetch({
            id: "v-1",
            equipment_id: "eq-1",
            equipment: { organization_id: "org-1" },
          }),
          update: variantUpdate,
        })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        updateEquipmentVariant(buildFormData({ variantId: "v-1", label: "10M" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=upd%20boom");
    });
  });

  // ── deleteEquipmentVariant edge cases ──────────────────────────────

  describe("deleteEquipmentVariant edge cases", () => {
    function buildVariantFetch(data: unknown, error: unknown = null) {
      const maybeSingle = vi.fn().mockResolvedValue({ data, error });
      const eqFn = vi.fn().mockReturnValue({ maybeSingle });
      return vi.fn().mockReturnValue({ eq: eqFn });
    }
    const validVariant = {
      id: "v-1",
      equipment_id: "eq-1",
      equipment: { organization_id: "org-1" },
    };

    it("redirects when the user has no primary organization", async () => {
      mocks.getCurrentUserContext.mockResolvedValue({ role: "admin", primaryOrganization: null });
      await expect(
        deleteEquipmentVariant(buildFormData({ variantId: "v-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
    });

    it("rejects when variantId is missing", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipmentVariant(buildFormData({ variantId: "" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Variante inválida.");
    });

    it("redirects when the variant is not found", async () => {
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({ select: buildVariantFetch(null) })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipmentVariant(buildFormData({ variantId: "v-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Variante não encontrada.");
    });

    it("rejects when the variant belongs to another org", async () => {
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn(() => ({
          select: buildVariantFetch({ ...validVariant, equipment: { organization_id: "other" } }),
        })),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipmentVariant(buildFormData({ variantId: "v-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory?error=Variante inválida.");
    });

    it("redirects when the usage count query errors", async () => {
      const usageEq = vi.fn().mockResolvedValue({ count: null, error: { message: "use boom" } });
      const usageSelect = vi.fn().mockReturnValue({ eq: usageEq });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment_variants") return { select: buildVariantFetch(validVariant) };
          if (table === "event_equipment") return { select: usageSelect };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipmentVariant(buildFormData({ variantId: "v-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=use%20boom");
    });

    it("deletes successfully when not in use", async () => {
      const usageEq = vi.fn().mockResolvedValue({ count: 0, error: null });
      const usageSelect = vi.fn().mockReturnValue({ eq: usageEq });
      const deleteResult = vi.fn().mockResolvedValue({ error: null });
      const deleteEqFn = vi.fn().mockReturnValue(deleteResult);
      const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment_variants") return { select: buildVariantFetch(validVariant), delete: deleteFn };
          if (table === "event_equipment") return { select: usageSelect };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipmentVariant(buildFormData({ variantId: "v-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?success=Variante removida.");
      expect(deleteFn).toHaveBeenCalled();
    });

    it("redirects with the error message when the delete fails", async () => {
      const usageEq = vi.fn().mockResolvedValue({ count: 0, error: null });
      const usageSelect = vi.fn().mockReturnValue({ eq: usageEq });
      const deleteEqFn = vi.fn().mockResolvedValue({ error: { message: "del boom" } });
      const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment_variants") return { select: buildVariantFetch(validVariant), delete: deleteFn };
          if (table === "event_equipment") return { select: usageSelect };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteEquipmentVariant(buildFormData({ variantId: "v-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=del%20boom");
    });
  });

  // ── updateBulkInventoryVariant edge cases ──────────────────────────

  describe("updateBulkInventoryVariant edge cases", () => {
    it("redirects when the user has no primary organization", async () => {
      mocks.getCurrentUserContext.mockResolvedValue({ role: "admin", primaryOrganization: null });
      await expect(
        updateBulkInventoryVariant(
          buildFormData({ equipmentId: "eq-1", variantId: "v-1", totalQty: "5", availableQty: "5" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
    });

    it("rejects invalid quantities", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        updateBulkInventoryVariant(
          buildFormData({ equipmentId: "eq-1", variantId: "v-1", totalQty: "5", availableQty: "9" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=Quantidades inválidas.");
    });

    function buildEquipMeta() {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { id: "eq-1", organization_id: "org-1", type: "bulk", has_variants: true },
        error: null,
      });
      const eqFn = vi.fn().mockReturnValue({ maybeSingle });
      return vi.fn().mockReturnValue({ eq: eqFn });
    }

    it("redirects with the error message when the existing-row update fails", async () => {
      const existingMaybeSingle = vi.fn().mockResolvedValue({ data: { id: "b-1" }, error: null });
      const existingEq2 = vi.fn().mockReturnValue({ maybeSingle: existingMaybeSingle });
      const existingEq1 = vi.fn().mockReturnValue({ eq: existingEq2 });
      const existingSelect = vi.fn().mockReturnValue({ eq: existingEq1 });
      const updateEq = vi.fn().mockResolvedValue({ error: { message: "upd boom" } });
      const updateFn = vi.fn().mockReturnValue({ eq: updateEq });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment") return { select: buildEquipMeta() };
          if (table === "bulk_inventory") return { select: existingSelect, update: updateFn };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        updateBulkInventoryVariant(
          buildFormData({ equipmentId: "eq-1", variantId: "v-1", totalQty: "5", availableQty: "5" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=upd%20boom");
    });

    it("redirects with the error message when the insert fails", async () => {
      const existingMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const existingEq2 = vi.fn().mockReturnValue({ maybeSingle: existingMaybeSingle });
      const existingEq1 = vi.fn().mockReturnValue({ eq: existingEq2 });
      const existingSelect = vi.fn().mockReturnValue({ eq: existingEq1 });
      const insertFn = vi.fn().mockResolvedValue({ error: { message: "ins boom" } });
      mocks.createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === "equipment") return { select: buildEquipMeta() };
          if (table === "bulk_inventory") return { select: existingSelect, insert: insertFn };
          return {};
        }),
      });
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        updateBulkInventoryVariant(
          buildFormData({ equipmentId: "eq-1", variantId: "v-1", totalQty: "5", availableQty: "5" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/inventory/eq-1?error=ins%20boom");
    });
  });
});
