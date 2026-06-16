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

vi.mock("@/lib/inventory", async (orig) => ({
  ...(await orig<typeof import("@/lib/inventory")>()),
  listEquipmentCategories: vi.fn(async () => [
    {
      id: "cat-1",
      organizationId: "org-1",
      name: "Áudio",
      parentCategoryId: null,
      parentCategoryName: null,
      equipmentCount: 3,
    },
  ]),
}));

vi.mock("@/app/(dashboard)/inventory/categories/CategoryManager", () => ({
  CategoryManager: () => null,
}));

import CategoriesPage from "@/app/(dashboard)/inventory/categories/page";

describe("CategoriesPage (RSC)", () => {
  it("renderiza cabeçalho e contagem de categorias", async () => {
    const ui = await CategoriesPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(
      screen.getByRole("heading", { name: "Categorias de Equipamento" })
    ).toBeInTheDocument();
    expect(screen.getByText(/1 categoria cadastrada/)).toBeInTheDocument();
  });

  it("renderiza mensagem de sucesso quando presente", async () => {
    const ui = await CategoriesPage({
      searchParams: Promise.resolve({ success: "Categoria criada" }),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Categoria criada")).toBeInTheDocument();
  });

  it("redireciona para /inventory quando o papel não pode escrever", async () => {
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "viewer" as unknown as string,
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });
    await expect(
      CategoriesPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/inventory/);
  });
});
