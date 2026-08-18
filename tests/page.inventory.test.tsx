// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

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

const maintenance = vi.hoisted(() => ({
  listResolvedMaintenanceHistory: vi.fn(async () => [
    { equipmentId: "eq-1", resolvedAt: "2026-08-17T15:30:00.000Z" },
  ]),
}));

vi.mock("@/lib/maintenance", async (orig) => ({
  ...(await orig<typeof import("@/lib/maintenance")>()),
  listResolvedMaintenanceHistory: maintenance.listResolvedMaintenanceHistory,
}));

vi.mock("@/app/(dashboard)/inventory/InventorySheet", () => ({
  InventorySheet: () => null,
}));

import InventoryPage from "@/app/(dashboard)/inventory/page";

describe("InventoryPage (RSC)", () => {
  it("oferece o download do inventário completo em PDF", async () => {
    const ui = await InventoryPage({ searchParams: Promise.resolve({ q: "mesa" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);

    const downloadLink = screen.getByRole("link", { name: "Baixar inventário em PDF" });
    expect(downloadLink).toHaveAttribute("href", "/inventory/pdf");
    expect(downloadLink).toHaveAttribute("download");
  });

  it("renderiza grid com item serializado", async () => {
    const ui = await InventoryPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("heading", { name: "Inventário" })).toBeInTheDocument();
    expect(screen.getByText("Mesa de Som X32")).toBeInTheDocument();
    expect(screen.getByText("Voltou da manutenção em 17/08/2026 às 12:30")).toBeInTheDocument();
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

  it("nao exibe nem consulta o historico para operations", async () => {
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "operations",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });

    const ui = await InventoryPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);

    expect(screen.queryByText(/Voltou da manutenção em/)).not.toBeInTheDocument();
  });
});
