// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/inventory/actions", () => ({
  createEquipmentVariant: vi.fn(),
  updateEquipmentVariant: vi.fn(),
  deleteEquipmentVariant: vi.fn(),
  updateBulkInventoryVariant: vi.fn(),
}));

import {
  createEquipmentVariant,
  updateEquipmentVariant,
  updateBulkInventoryVariant,
} from "@/app/(dashboard)/inventory/actions";
import { VariantManager } from "@/app/(dashboard)/inventory/[id]/VariantManager";
import type { EquipmentVariant } from "@/lib/inventory";

const VARIANTS: EquipmentVariant[] = [
  {
    id: "v-1",
    equipmentId: "eq-1",
    label: "5M",
    sortValue: 5,
    position: 0,
    notes: null,
    totalQty: 10,
    availableQty: 7,
  },
  {
    id: "v-2",
    equipmentId: "eq-1",
    label: "10M",
    sortValue: 10,
    position: 1,
    notes: "novo lote",
    totalQty: 4,
    availableQty: 4,
  },
];

describe("VariantManager", () => {
  it("mostra estado vazio quando não há variantes", () => {
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={[]} canWrite />
    );
    expect(screen.getByText(/Nenhuma variante cadastrada/i)).toBeInTheDocument();
    expect(screen.getByText("Variantes (0)")).toBeInTheDocument();
  });

  it("lista variantes com estoque e contador", () => {
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={VARIANTS} canWrite />
    );
    expect(screen.getByText("Variantes (2)")).toBeInTheDocument();
    expect(screen.getByText("5M")).toBeInTheDocument();
    expect(screen.getByText("10M")).toBeInTheDocument();
    expect(screen.getByText("· novo lote")).toBeInTheDocument();
    expect(screen.getByText("7/10")).toBeInTheDocument();
    expect(screen.getByText("4/4")).toBeInTheDocument();
  });

  it("oculta os controles de escrita quando canWrite é falso", () => {
    render(
      <VariantManager
        equipmentId="eq-1"
        equipmentType="bulk"
        variants={VARIANTS}
        canWrite={false}
      />
    );
    expect(screen.queryByRole("button", { name: /Nova variante/i })).not.toBeInTheDocument();
    // Sem botão de ajustar estoque por linha.
    expect(screen.queryByTitle("Ajustar estoque")).not.toBeInTheDocument();
  });

  it("abre o formulário inline de criação com campo de estoque (bulk)", async () => {
    const user = userEvent.setup();
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={VARIANTS} canWrite />
    );
    await user.click(screen.getByRole("button", { name: /Nova variante/i }));

    expect(
      screen.getByPlaceholderText("Ex.: 5M, 10M, Tamanho P")
    ).toBeInTheDocument();
    // Em bulk, o campo de estoque inicial aparece.
    expect(screen.getByPlaceholderText("Estoque inicial")).toBeInTheDocument();
  });

  it("não mostra campo de estoque inicial no modo serializado", async () => {
    const user = userEvent.setup();
    render(
      <VariantManager
        equipmentId="eq-1"
        equipmentType="serialized"
        variants={VARIANTS}
        canWrite
      />
    );
    await user.click(screen.getByRole("button", { name: /Nova variante/i }));
    expect(screen.getByPlaceholderText("Ex.: 5M, 10M, Tamanho P")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Estoque inicial")).not.toBeInTheDocument();
  });

  it("entra no modo de renomear ao clicar no lápis", async () => {
    const user = userEvent.setup();
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={VARIANTS} canWrite />
    );
    const renameButtons = screen.getAllByTitle("Renomear");
    await user.click(renameButtons[0]);
    expect(screen.getByDisplayValue("5M")).toBeInTheDocument();
  });

  it("entra no modo de ajuste de estoque ao clicar no lápis de estoque (bulk)", async () => {
    const user = userEvent.setup();
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={VARIANTS} canWrite />
    );
    const stockButtons = screen.getAllByTitle("Ajustar estoque");
    await user.click(stockButtons[0]);
    const total = document.querySelector('input[name="totalQty"]') as HTMLInputElement;
    const avail = document.querySelector('input[name="availableQty"]') as HTMLInputElement;
    expect(total.value).toBe("10");
    expect(avail.value).toBe("7");
  });

  it("cria uma variante e fecha o formulário ao submeter (bulk)", async () => {
    const user = userEvent.setup();
    vi.mocked(createEquipmentVariant).mockResolvedValueOnce(undefined as never);
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={VARIANTS} canWrite />
    );
    await user.click(screen.getByRole("button", { name: /Nova variante/i }));
    const label = screen.getByPlaceholderText("Ex.: 5M, 10M, Tamanho P");
    await user.type(label, "15M");
    await user.type(screen.getByPlaceholderText("Estoque inicial"), "8");
    await user.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(createEquipmentVariant).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText("Ex.: 5M, 10M, Tamanho P")
      ).not.toBeInTheDocument()
    );
  });

  it("cancela o formulário de criação", async () => {
    const user = userEvent.setup();
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={VARIANTS} canWrite />
    );
    await user.click(screen.getByRole("button", { name: /Nova variante/i }));
    const form = screen
      .getByPlaceholderText("Ex.: 5M, 10M, Tamanho P")
      .closest("form") as HTMLFormElement;
    // O botão de cancelar é o X (type=button) dentro do form.
    const cancel = within(form).getAllByRole("button").find(
      (b) => b.getAttribute("type") === "button"
    )!;
    await user.click(cancel);
    expect(
      screen.queryByPlaceholderText("Ex.: 5M, 10M, Tamanho P")
    ).not.toBeInTheDocument();
  });

  it("renomeia uma variante e sai do modo de edição ao submeter", async () => {
    const user = userEvent.setup();
    vi.mocked(updateEquipmentVariant).mockResolvedValueOnce(undefined as never);
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={VARIANTS} canWrite />
    );
    await user.click(screen.getAllByTitle("Renomear")[0]);
    const input = screen.getByDisplayValue("5M");
    await user.clear(input);
    await user.type(input, "5.5M");
    const form = input.closest("form") as HTMLFormElement;
    // O primeiro botão do form é o check (type=submit).
    await user.click(within(form).getAllByRole("button")[0]);
    await waitFor(() => expect(updateEquipmentVariant).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByDisplayValue("5.5M")).not.toBeInTheDocument()
    );
  });

  it("cancela a renomeação ao clicar no X", async () => {
    const user = userEvent.setup();
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={VARIANTS} canWrite />
    );
    await user.click(screen.getAllByTitle("Renomear")[0]);
    const input = screen.getByDisplayValue("5M");
    const form = input.closest("form") as HTMLFormElement;
    const buttons = within(form).getAllByRole("button");
    // segundo botão é o X (cancelar)
    await user.click(buttons[1]);
    expect(screen.queryByDisplayValue("5M")).not.toBeInTheDocument();
    expect(screen.getByText("5M")).toBeInTheDocument();
  });

  it("ajusta o estoque e sai do modo de edição ao submeter (bulk)", async () => {
    const user = userEvent.setup();
    vi.mocked(updateBulkInventoryVariant).mockResolvedValueOnce(undefined as never);
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={VARIANTS} canWrite />
    );
    await user.click(screen.getAllByTitle("Ajustar estoque")[0]);
    const total = document.querySelector('input[name="totalQty"]') as HTMLInputElement;
    await user.clear(total);
    await user.type(total, "12");
    const form = total.closest("form") as HTMLFormElement;
    await user.click(within(form).getAllByRole("button")[0]);
    await waitFor(() => expect(updateBulkInventoryVariant).toHaveBeenCalled());
  });

  it("cancela a edição de estoque com o X", async () => {
    const user = userEvent.setup();
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={VARIANTS} canWrite />
    );
    await user.click(screen.getAllByTitle("Ajustar estoque")[0]);
    const total = document.querySelector('input[name="totalQty"]') as HTMLInputElement;
    const form = total.closest("form") as HTMLFormElement;
    const buttons = within(form).getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);
    expect(document.querySelector('input[name="totalQty"]')).toBeNull();
  });

  it("abre o diálogo de remover variante", async () => {
    const user = userEvent.setup();
    render(
      <VariantManager equipmentId="eq-1" equipmentType="bulk" variants={VARIANTS} canWrite />
    );
    const removeButtons = screen.getAllByTitle("Remover");
    await user.click(removeButtons[0]);
    expect(await screen.findByText(/Remover variante/i)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Remover" })).toBeInTheDocument();
  });
});
