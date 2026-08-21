// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error("REDIRECT:" + url); }),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: vi.fn(async () => null),
  getDefaultAppPathForUser: vi.fn(async () => "/dashboard"),
}));

vi.mock("@/app/(auth)/actions", () => ({
  signInWithPassword: vi.fn(),
}));

import LoginPage from "@/app/(auth)/login/page";
import { getCurrentUserContext, getDefaultAppPathForUser } from "@/lib/auth/session";

const getCtx = vi.mocked(getCurrentUserContext);
const getDefaultPath = vi.mocked(getDefaultAppPathForUser);

describe("LoginPage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("renderiza somente o login principal", async () => {
    getCtx.mockResolvedValue(null);
    const ui = await LoginPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Partion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("voce@partion.com")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Equipe interna" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Funcionários" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Criar conta" })).not.toBeInTheDocument();
  });

  it("mostra mensagem de erro vinda dos searchParams", async () => {
    getCtx.mockResolvedValue(null);
    const ui = await LoginPage({ searchParams: Promise.resolve({ error: "Credenciais inválidas" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Credenciais inválidas")).toBeInTheDocument();
  });

  it("redireciona para o destino do perfil quando ja ha sessao", async () => {
    getCtx.mockResolvedValue({ role: "admin", userId: "u1" } as never);
    getDefaultPath.mockResolvedValue("/dashboard");
    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT:\/dashboard/);
    expect(getDefaultPath).toHaveBeenCalledWith("u1");
  });

  it("ignora parametros antigos do portal de funcionarios", async () => {
    getCtx.mockResolvedValue(null);
    const ui = await LoginPage({ searchParams: Promise.resolve({ portal: "employee" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.queryByText("Acesso de funcionários")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Criar conta" })).not.toBeInTheDocument();
  });

  it("redireciona funcionario autenticado para /events", async () => {
    getCtx.mockResolvedValue({ role: "employee", userId: "employee-1" } as never);
    getDefaultPath.mockResolvedValue("/events");
    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT:\/events/);
  });
});
