// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/events/actions", () => ({
  addEventExtra: vi.fn(),
  updateEventExtra: vi.fn(),
  removeEventExtra: vi.fn(),
}));

import {
  addEventExtra,
  updateEventExtra,
} from "@/app/(dashboard)/events/actions";
import { ExtrasPanel } from "@/app/(dashboard)/events/[id]/ExtrasPanel";
import type { EventExtra } from "@/lib/event-aux";

const EXTRAS: EventExtra[] = [
  {
    id: "x-1",
    eventId: "ev-1",
    kind: "generator",
    description: "Gerador 60kVA silenciado",
    qty: 2,
    supplier: "GeradoresRJ",
    unitPriceCents: 50000,
    notes: "Entrega às 8h",
    position: 0,
  },
  {
    id: "x-2",
    eventId: "ev-1",
    kind: "stage",
    description: "Palco 6x4",
    qty: 1,
    supplier: null,
    unitPriceCents: null,
    notes: null,
    position: 1,
  },
];

describe("ExtrasPanel", () => {
  it("mostra estado vazio quando não há extras", () => {
    render(<ExtrasPanel eventId="ev-1" extras={[]} canEdit />);
    expect(screen.getByText("Nenhum item extra cadastrado.")).toBeInTheDocument();
    expect(screen.getByText(/Extras \/ Terceirizados \(0\)/)).toBeInTheDocument();
  });

  it("renderiza a tabela de extras com descrição, fornecedor e tipo", () => {
    render(<ExtrasPanel eventId="ev-1" extras={EXTRAS} canEdit />);
    expect(screen.getByText("Gerador 60kVA silenciado")).toBeInTheDocument();
    expect(screen.getByText("Palco 6x4")).toBeInTheDocument();
    expect(screen.getByText("GeradoresRJ")).toBeInTheDocument();
    expect(screen.getByText("Gerador")).toBeInTheDocument();
    expect(screen.getByText("Palco")).toBeInTheDocument();
    expect(screen.getByText("Entrega às 8h")).toBeInTheDocument();
    expect(screen.getByText(/Extras \/ Terceirizados \(2\)/)).toBeInTheDocument();
  });

  it("calcula e mostra o total em BRL", () => {
    render(<ExtrasPanel eventId="ev-1" extras={EXTRAS} canEdit />);
    // 50000 cents * 2 = 100000 cents = R$ 1.000,00
    expect(screen.getByText(/Total.*1\.000,00/)).toBeInTheDocument();
  });

  it("não mostra o botão Adicionar quando canEdit é false", () => {
    render(<ExtrasPanel eventId="ev-1" extras={EXTRAS} canEdit={false} />);
    expect(
      screen.queryByRole("button", { name: /Adicionar/i })
    ).not.toBeInTheDocument();
  });

  it("abre o sheet de novo extra com os campos do formulário", async () => {
    const user = userEvent.setup();
    render(<ExtrasPanel eventId="ev-1" extras={[]} canEdit />);

    await user.click(screen.getByRole("button", { name: /Adicionar/i }));

    expect(await screen.findByText("Novo extra")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ex.: Gerador 60kVA silenciado")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar extra" })
    ).toBeInTheDocument();
  });

  it("permite digitar a descrição no formulário de novo extra", async () => {
    const user = userEvent.setup();
    render(<ExtrasPanel eventId="ev-1" extras={[]} canEdit />);
    await user.click(screen.getByRole("button", { name: /Adicionar/i }));

    const descInput = (await screen.findByPlaceholderText(
      "Ex.: Gerador 60kVA silenciado"
    )) as HTMLInputElement;
    await user.type(descInput, "Box truss 3m");
    expect(descInput.value).toBe("Box truss 3m");
  });

  it("submete o formulário de novo extra (addEventExtra)", async () => {
    const user = userEvent.setup();
    vi.mocked(addEventExtra).mockResolvedValueOnce(undefined as never);
    render(<ExtrasPanel eventId="ev-1" extras={[]} canEdit />);
    await user.click(screen.getByRole("button", { name: /Adicionar/i }));
    const desc = await screen.findByPlaceholderText(
      "Ex.: Gerador 60kVA silenciado"
    );
    await user.type(desc, "Projetor 5000 lumens");
    await user.click(screen.getByRole("button", { name: "Adicionar extra" }));
    await waitFor(() => expect(addEventExtra).toHaveBeenCalled());
  });

  it("abre o sheet de editar e submete (updateEventExtra)", async () => {
    const user = userEvent.setup();
    vi.mocked(updateEventExtra).mockResolvedValueOnce(undefined as never);
    render(<ExtrasPanel eventId="ev-1" extras={EXTRAS} canEdit />);
    await user.click(screen.getAllByTitle("Editar")[0]);

    expect(await screen.findByText("Editar extra")).toBeInTheDocument();
    const desc = screen.getByDisplayValue("Gerador 60kVA silenciado");
    await user.clear(desc);
    await user.type(desc, "Gerador 80kVA");
    await user.click(
      screen.getByRole("button", { name: "Salvar alterações" })
    );
    await waitFor(() => expect(updateEventExtra).toHaveBeenCalled());
  });

  it("abre o diálogo de remover extra", async () => {
    const user = userEvent.setup();
    render(<ExtrasPanel eventId="ev-1" extras={EXTRAS} canEdit />);
    await user.click(screen.getAllByTitle("Remover")[0]);
    expect(await screen.findByText("Remover extra")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Remover" })
    ).toBeInTheDocument();
  });
});
