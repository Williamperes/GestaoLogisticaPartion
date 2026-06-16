// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/inventory/actions", () => ({
  addEquipmentUnit: vi.fn(),
}));

import { AddUnitSheet } from "@/app/(dashboard)/inventory/[id]/AddUnitSheet";

describe("AddUnitSheet", () => {
  it("renderiza o gatilho fechado", () => {
    render(<AddUnitSheet equipmentId="eq-1" />);
    expect(screen.getByRole("button", { name: /Adicionar unidade/i })).toBeInTheDocument();
    expect(screen.queryByText(/Informe a quantidade de unidades/i)).not.toBeInTheDocument();
  });

  it("abre o sheet com os campos padrão (sem seletor de variante)", async () => {
    const user = userEvent.setup();
    render(<AddUnitSheet equipmentId="eq-1" />);
    await user.click(screen.getByRole("button", { name: /Adicionar unidade/i }));

    expect(await screen.findByText(/Informe a quantidade de unidades/i)).toBeInTheDocument();
    const qty = document.querySelector('input[name="quantity"]') as HTMLInputElement;
    expect(qty).toBeInTheDocument();
    expect(qty.value).toBe("1");
    // Sem variantes → não há select.
    expect(document.querySelector('select[name="variantId"]')).toBeNull();
    expect(screen.getByPlaceholderText("Opcional — ex.: PM7-0042")).toBeInTheDocument();
  });

  it("hidden equipmentId é injetado no form", async () => {
    const user = userEvent.setup();
    render(<AddUnitSheet equipmentId="eq-42" />);
    await user.click(screen.getByRole("button", { name: /Adicionar unidade/i }));
    await screen.findByText(/Informe a quantidade de unidades/i);

    const hidden = document.querySelector('input[name="equipmentId"]') as HTMLInputElement;
    expect(hidden.value).toBe("eq-42");
  });

  it("mostra seletor de variante quando há variantes", async () => {
    const user = userEvent.setup();
    render(
      <AddUnitSheet
        equipmentId="eq-1"
        variants={[
          { id: "v-1", label: "5M" },
          { id: "v-2", label: "10M" },
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: /Adicionar unidade/i }));
    await screen.findByText(/Informe a quantidade de unidades/i);

    const select = document.querySelector('select[name="variantId"]') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select).toBeRequired();
    expect(screen.getByRole("option", { name: "5M" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "10M" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Selecione uma variante/i })).toBeInTheDocument();
  });

  it("não mostra seletor de variante com array vazio", async () => {
    const user = userEvent.setup();
    render(<AddUnitSheet equipmentId="eq-1" variants={[]} />);
    await user.click(screen.getByRole("button", { name: /Adicionar unidade/i }));
    await screen.findByText(/Informe a quantidade de unidades/i);
    expect(document.querySelector('select[name="variantId"]')).toBeNull();
  });
});
