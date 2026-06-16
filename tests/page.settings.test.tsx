// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((u: string) => {
    throw new Error("REDIRECT:" + u);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: vi.fn(),
}));

import SettingsPage from "@/app/(dashboard)/settings/page";
import { getCurrentUserContext } from "@/lib/auth/session";

const getCtx = vi.mocked(getCurrentUserContext);

describe("SettingsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza a lista de configurações para admin", async () => {
    getCtx.mockResolvedValue({
      role: "admin",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    } as never);

    const ui = await SettingsPage();
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Configurações")).toBeInTheDocument();
    expect(screen.getByText("Templates de Checklist")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("redireciona para /login quando não há contexto", async () => {
    getCtx.mockResolvedValue(null);
    await expect(SettingsPage()).rejects.toThrow(/REDIRECT:\/login/);
  });

  it("redireciona para /dashboard quando o papel não é admin", async () => {
    getCtx.mockResolvedValue({
      role: "warehouse",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    } as never);
    await expect(SettingsPage()).rejects.toThrow(/REDIRECT:\/dashboard/);
  });
});
