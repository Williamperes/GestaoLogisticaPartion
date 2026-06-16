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

vi.mock("@/lib/clients", async (orig) => ({
  ...(await orig<typeof import("@/lib/clients")>()),
  listClientOrganizations: vi.fn(async () => [
    {
      id: "cli-1",
      name: "Acme Eventos",
      slug: "acme-eventos",
      contactName: "Maria",
      contactEmail: "maria@acme.com",
      contactPhone: "+5511999999999",
      address: "Rua A, 100",
      city: "São Paulo",
      isActive: true,
      createdAt: "2026-01-01",
    },
  ]),
}));

// Children client components — stubs.
vi.mock("@/app/(dashboard)/clients/ClientsToolbar", () => ({
  ClientsToolbar: () => null,
}));
vi.mock("@/app/(dashboard)/clients/ClientsToastSync", () => ({
  ClientsToastSync: () => null,
}));
vi.mock("@/app/(dashboard)/clients/ClientCard", () => ({
  ClientCard: ({ client }: { client: { name: string } }) => {
    const React = require("react");
    return React.createElement("div", null, client.name);
  },
}));

import ClientsPage from "@/app/(dashboard)/clients/page";

describe("ClientsPage (RSC)", () => {
  it("renderiza cabeçalho e cards de clientes", async () => {
    const ui = await ClientsPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("heading", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.getByText("Acme Eventos")).toBeInTheDocument();
  });

  it("redireciona para /login sem contexto", async () => {
    auth.getCurrentUserContext.mockResolvedValueOnce(null);
    await expect(
      ClientsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/login/);
  });

  it("redireciona para /dashboard quando o papel não tem acesso", async () => {
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "warehouse",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });
    await expect(
      ClientsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/dashboard/);
  });
});
