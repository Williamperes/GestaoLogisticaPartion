// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(dashboard)/inventory/actions", () => ({
  updateEquipmentUnitStatus: vi.fn(),
}));

import { UnitStatusForm } from "@/app/(dashboard)/inventory/[id]/UnitStatusForm";

describe("UnitStatusForm", () => {
  it("renderiza os campos ocultos e o status atual selecionado", () => {
    const { container } = render(
      <UnitStatusForm unitId="u-1" equipmentId="eq-1" currentStatus="maintenance" />
    );
    expect(container.querySelector("input[name=unitId]")).toHaveValue("u-1");
    expect(container.querySelector("input[name=equipmentId]")).toHaveValue("eq-1");
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("maintenance");
  });

  it("oferece todas as opções de status", () => {
    render(<UnitStatusForm unitId="u-1" equipmentId="eq-1" currentStatus="available" />);
    expect(screen.getByRole("option", { name: "Disponível" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Reservado" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Em Campo" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Manutenção" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Inativo" })).toBeInTheDocument();
  });

  it("submete o form ao alterar o select", () => {
    render(<UnitStatusForm unitId="u-1" equipmentId="eq-1" currentStatus="available" />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const requestSubmit = vi.fn();
    Object.defineProperty(select, "form", { value: { requestSubmit }, configurable: true });
    select.value = "in_field";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(requestSubmit).toHaveBeenCalled();
  });
});
