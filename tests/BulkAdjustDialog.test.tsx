// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/inventory/actions", () => ({
  updateBulkInventory: vi.fn(),
}));

import { BulkAdjustDialog } from "@/app/(dashboard)/inventory/[id]/BulkAdjustDialog";
import type { Equipment } from "@/lib/inventory";

function makeEquipment(totalQty: number, availableQty: number): Equipment {
  return {
    id: "eq-1",
    name: "Cabo de áudio",
    type: "bulk",
    bulk: {
      id: "b-1",
      equipmentId: "eq-1",
      variantId: null,
      unit: "metros",
      totalQty,
      availableQty,
    },
  } as unknown as Equipment;
}

describe("BulkAdjustDialog", () => {
  it("renderiza o gatilho fechado", () => {
    render(<BulkAdjustDialog equipment={makeEquipment(50, 40)} />);
    expect(screen.getByRole("button", { name: /Ajustar estoque/i })).toBeInTheDocument();
    expect(screen.queryByText(/Atualize as quantidades/i)).not.toBeInTheDocument();
  });

  it("abre o diálogo com os valores iniciais e a unidade", async () => {
    const user = userEvent.setup();
    render(<BulkAdjustDialog equipment={makeEquipment(50, 40)} />);
    await user.click(screen.getByRole("button", { name: /Ajustar estoque/i }));

    expect(await screen.findByText(/Atualize as quantidades/i)).toBeInTheDocument();
    expect(screen.getByText("Total (metros)")).toBeInTheDocument();
    const total = document.querySelector('input[name="totalQty"]') as HTMLInputElement;
    const avail = document.querySelector('input[name="availableQty"]') as HTMLInputElement;
    expect(total.value).toBe("50");
    expect(avail.value).toBe("40");
    // Estado válido → botão Salvar habilitado e sem aviso.
    expect(screen.getByRole("button", { name: "Salvar" })).not.toBeDisabled();
    expect(screen.queryByText(/Disponível não pode ser maior/i)).not.toBeInTheDocument();
  });

  it("mostra erro e desabilita Salvar quando disponível > total", async () => {
    const user = userEvent.setup();
    render(<BulkAdjustDialog equipment={makeEquipment(50, 40)} />);
    await user.click(screen.getByRole("button", { name: /Ajustar estoque/i }));
    await screen.findByText(/Atualize as quantidades/i);

    const avail = document.querySelector('input[name="availableQty"]') as HTMLInputElement;
    await user.clear(avail);
    await user.type(avail, "80");

    expect(await screen.findByText(/Disponível não pode ser maior que total/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("recupera o estado válido ao corrigir os valores", async () => {
    const user = userEvent.setup();
    render(<BulkAdjustDialog equipment={makeEquipment(50, 40)} />);
    await user.click(screen.getByRole("button", { name: /Ajustar estoque/i }));
    await screen.findByText(/Atualize as quantidades/i);

    const total = document.querySelector('input[name="totalQty"]') as HTMLInputElement;
    await user.clear(total);
    await user.type(total, "100");

    expect(screen.queryByText(/Disponível não pode ser maior/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).not.toBeDisabled();
  });
});
