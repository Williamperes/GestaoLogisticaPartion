// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((u: string) => {
    throw new Error("REDIRECT:" + u);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const auth = vi.hoisted(() => ({
  getCurrentUserContext: vi.fn(
    async () =>
      ({
        role: "admin",
        userId: "u1",
        primaryOrganization: { id: "org-1" },
      }) as { role: string | null; userId: string; primaryOrganization: { id: string } | null } | null
  ),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: auth.getCurrentUserContext,
}));

function equipmentFixture() {
  return {
    id: "eq-1",
    organizationId: "org-1",
    categoryId: "cat-1",
    categoryName: "Áudio",
    parentCategoryId: null,
    parentCategoryName: null,
    name: "Mesa de Som X32",
    brand: "Behringer",
    model: "X32",
    type: "serialized" as const,
    status: "available" as const,
    hasVariants: false,
    serial: "SN-001",
    patrimony: null,
    purchaseDate: null,
    purchaseValueCents: null,
    qrCode: null,
    notes: null,
    createdAt: "2026-01-01",
  };
}

vi.mock("@/lib/inventory", async (orig) => ({
  ...(await orig<typeof import("@/lib/inventory")>()),
  listEquipment: vi.fn(async () => [equipmentFixture()]),
  listEquipmentCategories: vi.fn(async () => []),
}));

vi.mock("@/app/(dashboard)/inventory/InventorySheet", () => ({
  InventorySheet: () => null,
}));

import InventoryPage from "@/app/(dashboard)/inventory/page";

describe("InventoryPage (RSC)", () => {
  it("renderiza grid com item serializado", async () => {
    const ui = await InventoryPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("heading", { name: "Inventário" })).toBeInTheDocument();
    expect(screen.getByText("Mesa de Som X32")).toBeInTheDocument();
  });

  it("redireciona para /login quando não há contexto", async () => {
    auth.getCurrentUserContext.mockResolvedValueOnce(null);
    await expect(
      InventoryPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/login/);
  });

  it("redireciona para /dashboard quando o papel não tem acesso", async () => {
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "warehouse",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });
    await expect(
      InventoryPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/dashboard/);
  });
});
