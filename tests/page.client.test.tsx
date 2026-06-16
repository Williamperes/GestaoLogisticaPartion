// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: vi.fn(),
}));

vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));

import ClientHomePage from "@/app/client/page";
import { getCurrentUserContext } from "@/lib/auth/session";

const getCtx = vi.mocked(getCurrentUserContext);

describe("ClientHomePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza o portal com nome, organização e role", async () => {
    getCtx.mockResolvedValue({
      role: "client",
      userId: "u1",
      email: "cliente@x.com",
      profile: { fullName: "Maria Cliente" },
      primaryOrganization: { id: "org-1", name: "Org Cliente" },
    } as never);

    const ui = await ClientHomePage();
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Maria Cliente")).toBeInTheDocument();
    expect(screen.getByText("Org Cliente")).toBeInTheDocument();
    expect(screen.getByText("client")).toBeInTheDocument();
    expect(screen.getByText("Portal do Cliente")).toBeInTheDocument();
  });

  it("retorna null (não renderiza) quando não há contexto", async () => {
    getCtx.mockResolvedValue(null);
    const ui = await ClientHomePage();
    expect(ui).toBeNull();
  });
});
