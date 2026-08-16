import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserContext: vi.fn(),
  getCurrentAuthUser: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: mocks.getCurrentUserContext,
  getCurrentAuthUser: mocks.getCurrentAuthUser,
}));

import { resolveMaintenance } from "@/app/(dashboard)/maintenance/actions";

function installSupabase(record: Record<string, unknown> | null) {
  const recordFilters: Array<[string, string]> = [];
  const maintenanceFilters: Array<[string, string]> = [];
  const unitFilters: Array<[string, string]> = [];
  const maintenanceUpdate = vi.fn();
  const unitUpdate = vi.fn();

  const recordBuilder = {
    eq(column: string, value: string) {
      recordFilters.push([column, value]);
      return recordBuilder;
    },
    async maybeSingle() {
      const scoped = recordFilters.some(
        ([column, value]) => column === "organization_id" && value === "org-1"
      ) && record?.organization_id === "org-1";
      return { data: scoped ? record : null, error: null };
    },
  };

  const maintenanceBuilder = {
    error: null,
    eq(column: string, value: string) {
      maintenanceFilters.push([column, value]);
      return maintenanceBuilder;
    },
  };
  const unitBuilder = {
    error: null,
    eq(column: string, value: string) {
      unitFilters.push([column, value]);
      return unitBuilder;
    },
  };

  mocks.createSupabaseAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "equipment_maintenance") {
        return {
          select: vi.fn(() => recordBuilder),
          update: maintenanceUpdate.mockImplementation(() => maintenanceBuilder),
        };
      }
      if (table === "equipment_units") {
        return { update: unitUpdate.mockImplementation(() => unitBuilder) };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  });

  return {
    recordFilters,
    maintenanceFilters,
    unitFilters,
    maintenanceUpdate,
    unitUpdate,
  };
}

describe("resolveMaintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAuthUser.mockResolvedValue({ id: "legacy-user" });
  });

  it("allows employee to resolve maintenance in its organization", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "employee",
      userId: "employee-1",
      primaryOrganization: { id: "org-1" },
    });
    const db = installSupabase({
      id: "m1",
      organization_id: "org-1",
      equipment_id: "eq1",
      equipment_unit_id: "unit1",
      status: "open",
    });

    await expect(resolveMaintenance("m1")).resolves.toEqual({ ok: true });
    expect(db.recordFilters).toContainEqual(["organization_id", "org-1"]);
    expect(db.maintenanceFilters).toContainEqual(["organization_id", "org-1"]);
    expect(db.unitFilters).toContainEqual(["equipment_id", "eq1"]);
    expect(db.maintenanceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "resolved",
      resolved_by: "employee-1",
    }));
    expect(db.unitUpdate).toHaveBeenCalledWith({ status: "available" });
  });

  it("rejects roles without maintenance permission before creating an admin client", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "finance",
      userId: "finance-1",
      primaryOrganization: { id: "org-1" },
    });
    installSupabase(null);

    await expect(resolveMaintenance("m1")).resolves.toEqual({
      ok: false,
      error: "Sem permissão",
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("does not resolve a record outside the primary organization", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "employee",
      userId: "employee-1",
      primaryOrganization: { id: "org-1" },
    });
    const db = installSupabase({
      id: "m-other",
      organization_id: "org-2",
      equipment_id: "eq2",
      equipment_unit_id: "unit2",
      status: "open",
    });

    await expect(resolveMaintenance("m-other")).resolves.toEqual({
      ok: false,
      error: "Ocorrência não encontrada",
    });
    expect(db.maintenanceUpdate).not.toHaveBeenCalled();
    expect(db.unitUpdate).not.toHaveBeenCalled();
  });
});
