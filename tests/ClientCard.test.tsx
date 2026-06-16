// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ClientCard } from "@/app/(dashboard)/clients/ClientCard";
import type { ClientOrganization } from "@/lib/clients";

vi.mock("@/app/(dashboard)/clients/actions", () => ({
  updateClient: vi.fn(),
  deleteClient: vi.fn(),
}));

const FULL: ClientOrganization = {
  id: "c-1",
  name: "Produtora Neon",
  slug: "produtora-neon",
  contactName: "Ana Souza",
  contactEmail: "ana@neon.com",
  contactPhone: "11999887766",
  address: "Rua das Flores, 100",
  city: "São Paulo",
  isActive: true,
  createdAt: "2026-01-01",
};

describe("ClientCard", () => {
  it("renderiza os dados do cliente preenchidos", () => {
    render(<ClientCard client={FULL} />);
    expect(screen.getByRole("heading", { name: "Produtora Neon" })).toBeInTheDocument();
    expect(screen.getByText("produtora-neon")).toBeInTheDocument();
    expect(screen.getByText("ana@neon.com")).toBeInTheDocument();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("São Paulo")).toBeInTheDocument();
    // Telefone formatado
    expect(screen.getByText("(11) 99988-7766")).toBeInTheDocument();
    // Endereço aparece no subtítulo
    expect(screen.getByText("Rua das Flores, 100")).toBeInTheDocument();
  });

  it("usa fallbacks quando campos opcionais são nulos", () => {
    const empty: ClientOrganization = {
      id: "c-2",
      name: "Sem Dados",
      slug: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      address: null,
      city: null,
      isActive: true,
      createdAt: "2026-01-01",
    };
    render(<ClientCard client={empty} />);
    expect(screen.getByText("Sem slug")).toBeInTheDocument();
    expect(screen.getByText("Email não informado")).toBeInTheDocument();
    expect(screen.getByText("Telefone não informado")).toBeInTheDocument();
    expect(screen.getByText("Contato principal não informado")).toBeInTheDocument();
    expect(screen.getByText("Cidade não informada")).toBeInTheDocument();
    expect(screen.getByText("Endereço não informado")).toBeInTheDocument();
  });

  it("abre o sheet de edição com os dados pré-preenchidos ao clicar no lápis", async () => {
    const user = userEvent.setup();
    render(<ClientCard client={FULL} />);

    expect(screen.queryByText("Editar cliente")).not.toBeInTheDocument();

    // O primeiro botão é o trigger de edição (ícone de lápis).
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);

    expect(await screen.findByText("Editar cliente")).toBeInTheDocument();
    const nameInput = screen.getByDisplayValue("Produtora Neon");
    expect(nameInput).toHaveAttribute("name", "name");
    expect(screen.getByDisplayValue("ana@neon.com")).toBeInTheDocument();
  });
});
