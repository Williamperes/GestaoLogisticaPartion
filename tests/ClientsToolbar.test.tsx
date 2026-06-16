// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ClientsToolbar } from "@/app/(dashboard)/clients/ClientsToolbar";

vi.mock("@/app/(dashboard)/clients/actions", () => ({
  createClient: vi.fn(),
}));

describe("ClientsToolbar", () => {
  it("renderiza a busca com o defaultQuery", () => {
    render(<ClientsToolbar defaultQuery="acme" />);
    const input = screen.getByPlaceholderText(
      "Buscar por nome, cidade, contato ou email..."
    ) as HTMLInputElement;
    expect(input).toHaveAttribute("name", "q");
    expect(input.value).toBe("acme");
  });

  it("permite digitar no campo de busca", async () => {
    const user = userEvent.setup();
    render(<ClientsToolbar defaultQuery="" />);
    const input = screen.getByPlaceholderText(
      "Buscar por nome, cidade, contato ou email..."
    ) as HTMLInputElement;
    await user.type(input, "neon");
    expect(input.value).toBe("neon");
  });

  it("abre o sheet de novo cliente ao clicar no botão", async () => {
    const user = userEvent.setup();
    render(<ClientsToolbar defaultQuery="" />);

    expect(screen.queryByText("Novo cliente")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Novo Cliente/i }));

    expect(await screen.findByText("Novo cliente")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex.: Produtora Neon")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("contato@cliente.com")).toBeInTheDocument();
  });
});
