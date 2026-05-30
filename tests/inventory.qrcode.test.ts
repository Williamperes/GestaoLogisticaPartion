import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { getEquipmentUnitByQrCode } from "@/lib/inventory";

function fakeSupabase(unit: unknown) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: unit, error: null })),
        })),
      })),
    })),
  };
}

describe("getEquipmentUnitByQrCode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolve QR → unidade quando existe", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        id: "u1",
        equipment_id: "e1",
        variant_id: null,
        status: "available",
        equipment: { organization_id: "org1" },
      })
    );

    const result = await getEquipmentUnitByQrCode("QR-ABC");
    expect(result).toMatchObject({
      id: "u1",
      equipmentId: "e1",
      organizationId: "org1",
    });
  });

  it("retorna null quando QR não existe", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(fakeSupabase(null));
    const result = await getEquipmentUnitByQrCode("QR-MISSING");
    expect(result).toBeNull();
  });
});
