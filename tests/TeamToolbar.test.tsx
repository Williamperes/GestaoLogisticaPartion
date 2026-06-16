// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TeamToolbar } from "@/app/(dashboard)/team/TeamToolbar";

vi.mock("@/app/(dashboard)/team/actions", () => ({
  createTeamMember: vi.fn(),
}));

describe("TeamToolbar", () => {
  it("abre o sheet de novo técnico com os campos base", async () => {
    const user = userEvent.setup();
    render(<TeamToolbar canProvision={false} />);

    await user.click(screen.getByRole("button", { name: /Novo Técnico/i }));

    expect(await screen.findByText("Novo técnico")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex.: Diego Almeida")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex.: Operador FOH")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("tecnico@partion.com")).toBeInTheDocument();
  });

  it("não mostra a seção de acesso quando canProvision é false", async () => {
    const user = userEvent.setup();
    render(<TeamToolbar canProvision={false} />);
    await user.click(screen.getByRole("button", { name: /Novo Técnico/i }));
    await screen.findByText("Novo técnico");
    expect(screen.queryByText("Criar acesso ao app")).not.toBeInTheDocument();
  });

  it("revela senha e permissão ao marcar 'Criar acesso ao app'", async () => {
    const user = userEvent.setup();
    render(<TeamToolbar canProvision />);
    await user.click(screen.getByRole("button", { name: /Novo Técnico/i }));
    await screen.findByText("Novo técnico");

    const checkbox = screen.getByLabelText("Criar acesso ao app");
    expect(screen.queryByPlaceholderText("Mínimo 8 caracteres")).not.toBeInTheDocument();

    await user.click(checkbox);
    expect(screen.getByPlaceholderText("Mínimo 8 caracteres")).toBeInTheDocument();
    expect(screen.getByText("Almoxarife (bipa carregar/retornar)")).toBeInTheDocument();
  });

  it("o botão 'Gerar' preenche a senha temporária", async () => {
    const user = userEvent.setup();
    render(<TeamToolbar canProvision />);
    await user.click(screen.getByRole("button", { name: /Novo Técnico/i }));
    await screen.findByText("Novo técnico");
    await user.click(screen.getByLabelText("Criar acesso ao app"));

    const pwd = screen.getByPlaceholderText("Mínimo 8 caracteres") as HTMLInputElement;
    expect(pwd.value).toBe("");
    // Digitar dispara o onChange controlado (linha 138).
    await user.type(pwd, "manual88");
    expect(pwd.value).toBe("manual88");
    await user.click(screen.getByRole("button", { name: "Gerar" }));
    expect(pwd.value.length).toBeGreaterThanOrEqual(8);
    expect(pwd.value).not.toBe("manual88");
  });

  it("gera senha via fallback Math.random quando window.crypto está ausente", async () => {
    const user = userEvent.setup();
    const originalCrypto = window.crypto;
    Object.defineProperty(window, "crypto", {
      value: undefined,
      configurable: true,
    });
    try {
      render(<TeamToolbar canProvision />);
      await user.click(screen.getByRole("button", { name: /Novo Técnico/i }));
      await screen.findByText("Novo técnico");
      await user.click(screen.getByLabelText("Criar acesso ao app"));
      const pwd = screen.getByPlaceholderText("Mínimo 8 caracteres") as HTMLInputElement;
      await user.click(screen.getByRole("button", { name: "Gerar" }));
      expect(pwd.value.length).toBe(14);
    } finally {
      Object.defineProperty(window, "crypto", {
        value: originalCrypto,
        configurable: true,
      });
    }
  });
});
