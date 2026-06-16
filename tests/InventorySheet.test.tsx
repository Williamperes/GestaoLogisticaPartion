// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/inventory/actions", () => ({
  createEquipment: vi.fn(),
}));

import { InventorySheet } from "@/app/(dashboard)/inventory/InventorySheet";
import type { EquipmentCategory } from "@/lib/inventory";

const CATEGORIES: EquipmentCategory[] = [
  {
    id: "c-1",
    organizationId: "org-1",
    name: "Mesas",
    parentCategoryId: null,
    parentCategoryName: null,
    equipmentCount: 3,
  } as unknown as EquipmentCategory,
  {
    id: "c-2",
    organizationId: "org-1",
    name: "Digitais",
    parentCategoryId: "c-1",
    parentCategoryName: "Mesas",
    equipmentCount: 1,
  } as unknown as EquipmentCategory,
];

describe("InventorySheet", () => {
  it("renderiza o gatilho 'Novo Item' sem abrir o formulário", () => {
    render(<InventorySheet categories={CATEGORIES} />);
    expect(screen.getByRole("button", { name: /Novo Item/i })).toBeInTheDocument();
    expect(screen.queryByText("Cadastrar equipamento")).not.toBeInTheDocument();
  });

  it("abre o sheet com os campos e categorias ao clicar", async () => {
    const user = userEvent.setup();
    render(<InventorySheet categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: /Novo Item/i }));

    expect(await screen.findByPlaceholderText("Ex.: Mesa Yamaha PM7")).toBeInTheDocument();
    // Categoria-raiz e subcategoria formatada com ›.
    expect(screen.getByRole("option", { name: "Mesas" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mesas › Digitais" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sem categoria" })).toBeInTheDocument();
  });

  it("inicia em 'serializado' e mostra a seção de identificação da unidade", async () => {
    const user = userEvent.setup();
    render(<InventorySheet categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: /Novo Item/i }));

    expect(await screen.findByText("Identificação da unidade")).toBeInTheDocument();
    // Campos exclusivos do tipo serializado.
    expect(screen.getByPlaceholderText("Ex.: PAT-2023-042")).toBeInTheDocument();
    expect(screen.queryByText("Estoque do lote")).not.toBeInTheDocument();
  });

  it("alterna para 'em lote' e troca a seção para estoque do lote", async () => {
    const user = userEvent.setup();
    render(<InventorySheet categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: /Novo Item/i }));
    await screen.findByPlaceholderText("Ex.: Mesa Yamaha PM7");

    await user.click(screen.getByRole("button", { name: /Em lote/i }));

    expect(await screen.findByText("Estoque do lote")).toBeInTheDocument();
    expect(screen.queryByText("Identificação da unidade")).not.toBeInTheDocument();
    // O hidden input de type reflete a escolha.
    const hidden = document.querySelector('input[name="type"]') as HTMLInputElement;
    expect(hidden.value).toBe("bulk");
  });

  it("marca o checkbox de variantes e desabilita o campo de QR no modo serializado", async () => {
    const user = userEvent.setup();
    render(<InventorySheet categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: /Novo Item/i }));
    await screen.findByPlaceholderText("Ex.: Mesa Yamaha PM7");

    const qrInput = screen.getByPlaceholderText("Bipe ou digite o código") as HTMLInputElement;
    expect(qrInput).not.toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(qrInput).toBeDisabled();
    expect(screen.getByText(/não será criada \(variantes ativas\)/i)).toBeInTheDocument();
  });

  it("no modo lote com variantes, desabilita a quantidade inicial", async () => {
    const user = userEvent.setup();
    render(<InventorySheet categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: /Novo Item/i }));
    await screen.findByPlaceholderText("Ex.: Mesa Yamaha PM7");
    await user.click(screen.getByRole("button", { name: /Em lote/i }));
    await screen.findByText("Estoque do lote");

    const qtyInput = document.querySelector('input[name="totalQty"]') as HTMLInputElement;
    expect(qtyInput).not.toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(qtyInput).toBeDisabled();
  });
});
