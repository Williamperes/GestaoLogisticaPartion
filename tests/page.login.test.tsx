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
  signInEmployeeWithPassword: vi.fn(),
  registerEmployee: vi.fn(),
}));

import LoginPage from "@/app/(auth)/login/page";
import { getCurrentUserContext, getDefaultAppPathForUser } from "@/lib/auth/session";

const getCtx = vi.mocked(getCurrentUserContext);
const getDefaultPath = vi.mocked(getDefaultAppPathForUser);

describe("LoginPage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("renderiza o login interno e as duas abas por padrao", async () => {
    getCtx.mockResolvedValue(null);
    const ui = await LoginPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Partion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("voce@partion.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Equipe interna" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Funcionários" })).toBeInTheDocument();
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

  it("mostra login de funcionarios na aba correspondente", async () => {
    getCtx.mockResolvedValue(null);
    const ui = await LoginPage({ searchParams: Promise.resolve({ portal: "employee" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("link", { name: "Funcionários" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Acesso de funcionários")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar conta" })).toBeInTheDocument();
  });

  it("mostra somente os quatro campos permitidos no cadastro", async () => {
    getCtx.mockResolvedValue(null);
    const ui = await LoginPage({ searchParams: Promise.resolve({ portal: "employee", mode: "register" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByLabelText("Nome completo")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toHaveAttribute("minlength", "8");
    expect(screen.getByLabelText("Confirmar senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar conta" })).toBeInTheDocument();
    expect(document.querySelector('[name="role"]')).not.toBeInTheDocument();
    expect(document.querySelector('[name="organization_id"]')).not.toBeInTheDocument();
  });

  it("mantem mensagem na aba e modo selecionados", async () => {
    getCtx.mockResolvedValue(null);
    const ui = await LoginPage({ searchParams: Promise.resolve({ portal: "employee", mode: "register", error: "As senhas nao coincidem." }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("As senhas nao coincidem.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar conta" })).toBeInTheDocument();
  });

  it("redireciona funcionario autenticado para /events", async () => {
    getCtx.mockResolvedValue({ role: "employee", userId: "employee-1" } as never);
    getDefaultPath.mockResolvedValue("/events");
    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT:\/events/);
  });
});
