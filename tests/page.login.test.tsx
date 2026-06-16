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
  getCurrentUserContext: vi.fn(async () => null),
}));

vi.mock("@/app/(auth)/actions", () => ({ signInWithPassword: vi.fn() }));

import LoginPage from "@/app/(auth)/login/page";
import { getCurrentUserContext } from "@/lib/auth/session";

const getCtx = vi.mocked(getCurrentUserContext);

describe("LoginPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza o formulário de login quando não há sessão", async () => {
    getCtx.mockResolvedValue(null);
    const ui = await LoginPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Partion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("voce@partion.com")).toBeInTheDocument();
  });

  it("mostra mensagem de erro vinda dos searchParams", async () => {
    getCtx.mockResolvedValue(null);
    const ui = await LoginPage({ searchParams: Promise.resolve({ error: "Credenciais inválidas" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Credenciais inválidas")).toBeInTheDocument();
  });

  it("redireciona para /dashboard quando já há sessão", async () => {
    getCtx.mockResolvedValue({ role: "admin", userId: "u1" } as never);
    await expect(
      LoginPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/dashboard/);
  });
});
