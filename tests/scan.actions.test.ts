import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEquipmentUnitByQrCode: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentAuthUser: vi.fn(),
}));

vi.mock("@/lib/inventory", async () => {
  const actual = await vi.importActual<typeof import("@/lib/inventory")>("@/lib/inventory");
  return { ...actual, getEquipmentUnitByQrCode: mocks.getEquipmentUnitByQrCode };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentAuthUser: mocks.getCurrentAuthUser,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { scanLoadUnit } from "@/app/(dashboard)/scan/actions";

describe("scan actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scanLoadUnit: rejeita QR não cadastrado", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(null);
    mocks.getCurrentAuthUser.mockResolvedValue({ id: "u1" });
    const result = await scanLoadUnit("evt-1", "QR-MISSING");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado|not found/i);
  });

  it("scanLoadUnit: rejeita QR cadastrado mas não vinculado à OS", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue({
      id: "unit-1",
      equipmentId: "eq-A",
      organizationId: "org-1",
      variantId: null,
      status: "available",
    });
    mocks.getCurrentAuthUser.mockResolvedValue({ id: "u1" });
    const fakeQuery = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mocks.createSupabaseAdminClient.mockReturnValue(fakeQuery);

    const result = await scanLoadUnit("evt-1", "QR-OTHER-EQUIP");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não está/i);
  });

  it("scanLoadUnit: rejeita sem autenticação", async () => {
    mocks.getCurrentAuthUser.mockResolvedValue(null);
    const result = await scanLoadUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/autentic/i);
  });

  it("scanLoadUnit: rejeita QR vazio", async () => {
    mocks.getCurrentAuthUser.mockResolvedValue({ id: "u1" });
    const result = await scanLoadUnit("evt-1", "  ");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vazio/i);
  });
});
