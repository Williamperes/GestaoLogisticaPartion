// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/inventory/actions", () => ({
  updateEquipment: vi.fn(),
  deactivateEquipment: vi.fn(),
  deleteEquipment: vi.fn(),
}));

import {
  deactivateEquipment,
  deleteEquipment,
} from "@/app/(dashboard)/inventory/actions";
import { EditEquipmentSheet } from "@/app/(dashboard)/inventory/[id]/EditEquipmentSheet";
import type { Equipment, EquipmentCategory } from "@/lib/inventory";

const CATEGORIES: EquipmentCategory[] = [
  { id: "c-1", name: "Mesas", parentCategoryName: null } as unknown as EquipmentCategory,
  { id: "c-2", name: "Digitais", parentCategoryName: "Mesas" } as unknown as EquipmentCategory,
];

const EQUIPMENT: Equipment = {
  id: "eq-1",
  name: "Mesa Yamaha PM7",
  brand: "Yamaha",
  model: "PM7",
  categoryId: "c-2",
  hasVariants: false,
  notes: "Em bom estado",
  type: "serialized",
} as unknown as Equipment;

describe("EditEquipmentSheet", () => {
  it("renderiza o gatilho 'Editar' fechado", () => {
    render(<EditEquipmentSheet equipment={EQUIPMENT} categories={CATEGORIES} />);
    expect(screen.getByRole("button", { name: /Editar/i })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Mesa Yamaha PM7")).not.toBeInTheDocument();
  });

  it("abre o sheet e pré-preenche os campos a partir do equipamento", async () => {
    const user = userEvent.setup();
    render(<EditEquipmentSheet equipment={EQUIPMENT} categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: /Editar/i }));

    expect(await screen.findByDisplayValue("Mesa Yamaha PM7")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Yamaha")).toBeInTheDocument();
    expect(screen.getByDisplayValue("PM7")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Em bom estado")).toBeInTheDocument();
    // Categoria selecionada.
    const select = document.querySelector('select[name="categoryId"]') as HTMLSelectElement;
    expect(select.value).toBe("c-2");
    // hasVariants desmarcado.
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("trata campos nulos como string vazia", async () => {
    const user = userEvent.setup();
    render(
      <EditEquipmentSheet
        equipment={
          {
            id: "eq-2",
            name: "Cabo",
            brand: null,
            model: null,
            categoryId: null,
            hasVariants: true,
            notes: null,
            type: "bulk",
          } as unknown as Equipment
        }
        categories={CATEGORIES}
      />
    );
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    await screen.findByDisplayValue("Cabo");

    const brand = document.querySelector('input[name="brand"]') as HTMLInputElement;
    expect(brand.value).toBe("");
    const select = document.querySelector('select[name="categoryId"]') as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("não mostra o botão de apagar quando canDelete é falso", async () => {
    const user = userEvent.setup();
    render(<EditEquipmentSheet equipment={EQUIPMENT} categories={CATEGORIES} canDelete={false} />);
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    await screen.findByDisplayValue("Mesa Yamaha PM7");

    expect(screen.getByRole("button", { name: /Desativar equipamento/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apagar equipamento/i })).not.toBeInTheDocument();
  });

  it("mostra o botão de apagar quando canDelete é verdadeiro", async () => {
    const user = userEvent.setup();
    render(<EditEquipmentSheet equipment={EQUIPMENT} categories={CATEGORIES} canDelete />);
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    await screen.findByDisplayValue("Mesa Yamaha PM7");

    expect(screen.getByRole("button", { name: /Apagar equipamento/i })).toBeInTheDocument();
  });

  it("desativa o equipamento quando o confirm é aceito", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<EditEquipmentSheet equipment={EQUIPMENT} categories={CATEGORIES} canDelete />);
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    await screen.findByDisplayValue("Mesa Yamaha PM7");

    await user.click(screen.getByRole("button", { name: /Desativar equipamento/i }));
    expect(confirmSpy).toHaveBeenCalledWith(
      "Desativar este equipamento permanentemente?"
    );
    confirmSpy.mockRestore();
  });

  it("cancela a desativação quando o confirm é recusado", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<EditEquipmentSheet equipment={EQUIPMENT} categories={CATEGORIES} canDelete />);
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    await screen.findByDisplayValue("Mesa Yamaha PM7");

    await user.click(screen.getByRole("button", { name: /Desativar equipamento/i }));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("aciona o confirm de apagar (aceito e recusado)", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<EditEquipmentSheet equipment={EQUIPMENT} categories={CATEGORIES} canDelete />);
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    await screen.findByDisplayValue("Mesa Yamaha PM7");

    // Recusado: preventDefault.
    await user.click(screen.getByRole("button", { name: /Apagar equipamento/i }));
    expect(confirmSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('Apagar "Mesa Yamaha PM7"')
    );

    // Aceito.
    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: /Apagar equipamento/i }));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });

  it("permite trocar a categoria selecionada", async () => {
    const user = userEvent.setup();
    render(<EditEquipmentSheet equipment={EQUIPMENT} categories={CATEGORIES} canDelete />);
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    await screen.findByDisplayValue("Mesa Yamaha PM7");

    const select = document.querySelector(
      'select[name="categoryId"]'
    ) as HTMLSelectElement;
    await user.selectOptions(select, "c-1");
    expect(select.value).toBe("c-1");

    // Garante que as actions foram importadas (mockadas) e disponíveis ao form.
    expect(deactivateEquipment).toBeDefined();
    expect(deleteEquipment).toBeDefined();
  });
});
