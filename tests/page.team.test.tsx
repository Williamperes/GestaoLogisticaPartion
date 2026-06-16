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

vi.mock("@/lib/team", async (orig) => ({
  ...(await orig<typeof import("@/lib/team")>()),
  listTeamMembers: vi.fn(async () => [
    {
      id: "m-1",
      organizationId: "org-1",
      name: "João Técnico",
      specialtyId: "sp-1",
      specialtyName: "Áudio",
      specialtySlug: "audio",
      role: "tecnico",
      phone: null,
      email: null,
      city: "São Paulo",
      available: true,
      notes: null,
      createdAt: "2026-01-01",
      userId: null,
    },
  ]),
}));

vi.mock("@/app/(dashboard)/team/TeamToolbar", () => ({
  TeamToolbar: () => null,
}));
vi.mock("@/app/(dashboard)/team/TeamToastSync", () => ({
  TeamToastSync: () => null,
}));
vi.mock("@/app/(dashboard)/team/TeamMemberCard", () => ({
  TeamMemberCard: ({ member }: { member: { name: string } }) => {
    const React = require("react");
    return React.createElement("div", null, member.name);
  },
}));

import TeamPage from "@/app/(dashboard)/team/page";

describe("TeamPage (RSC)", () => {
  it("renderiza cabeçalho e cards de membros", async () => {
    const ui = await TeamPage();
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("heading", { name: "Equipe" })).toBeInTheDocument();
    expect(screen.getByText("João Técnico")).toBeInTheDocument();
  });

  it("redireciona para /login sem contexto", async () => {
    auth.getCurrentUserContext.mockResolvedValueOnce(null);
    await expect(TeamPage()).rejects.toThrow(/REDIRECT:\/login/);
  });

  it("redireciona para /dashboard quando o papel não tem acesso", async () => {
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "warehouse",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });
    await expect(TeamPage()).rejects.toThrow(/REDIRECT:\/dashboard/);
  });
});
