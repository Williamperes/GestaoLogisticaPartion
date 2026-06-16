// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/settings/checklist-templates/actions", () => ({
  addTemplateItem: vi.fn(),
  updateTemplateItem: vi.fn(),
  deleteTemplateItem: vi.fn(),
}));

import {
  addTemplateItem,
  updateTemplateItem,
} from "@/app/(dashboard)/settings/checklist-templates/actions";
import { TemplateItemsEditor } from "@/app/(dashboard)/settings/checklist-templates/[id]/TemplateItemsEditor";
import type { ChecklistTemplateItem } from "@/lib/checklist-templates";

const ITEMS: ChecklistTemplateItem[] = [
  {
    id: "i-1",
    templateId: "t-1",
    label: "Conferir cabos",
    section: "operational",
    position: 0,
    required: true,
  },
  {
    id: "i-2",
    templateId: "t-1",
    label: "Foto do palco",
    section: "operational",
    position: 1,
    required: false,
  },
];

describe("TemplateItemsEditor", () => {
  it("mostra estado vazio e contagem zero", () => {
    render(
      <TemplateItemsEditor
        templateId="t-1"
        section="operational"
        sectionLabel="Operacional"
        items={[]}
      />
    );
    expect(screen.getByText("Operacional")).toBeInTheDocument();
    expect(screen.getByText("0 itens")).toBeInTheDocument();
    expect(screen.getByText(/Nenhum item nessa seção/i)).toBeInTheDocument();
  });

  it("usa singular para 1 item", () => {
    render(
      <TemplateItemsEditor
        templateId="t-1"
        section="operational"
        sectionLabel="Operacional"
        items={[ITEMS[0]]}
      />
    );
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("lista itens e marca os opcionais", () => {
    render(
      <TemplateItemsEditor
        templateId="t-1"
        section="operational"
        sectionLabel="Operacional"
        items={ITEMS}
      />
    );
    expect(screen.getByText("2 itens")).toBeInTheDocument();
    expect(screen.getByText("Conferir cabos")).toBeInTheDocument();
    expect(screen.getByText("Foto do palco")).toBeInTheDocument();
    // Só o item não-obrigatório recebe o badge "Opcional".
    expect(screen.getByText("Opcional")).toBeInTheDocument();
  });

  it("abre o form inline de criação com checkbox 'obrigatório' marcado por padrão", async () => {
    const user = userEvent.setup();
    render(
      <TemplateItemsEditor
        templateId="t-1"
        section="operational"
        sectionLabel="Operacional"
        items={ITEMS}
      />
    );
    await user.click(screen.getByRole("button", { name: /^Item$/i }));

    expect(screen.getByPlaceholderText("Texto do item")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: /Obrigatório/i });
    expect(checkbox).toBeChecked();
    // hidden fields refletem o template e a seção.
    const section = document.querySelector('input[name="section"]') as HTMLInputElement;
    expect(section.value).toBe("operational");
  });

  it("entra no modo de edição com valores pré-preenchidos", async () => {
    const user = userEvent.setup();
    render(
      <TemplateItemsEditor
        templateId="t-1"
        section="operational"
        sectionLabel="Operacional"
        items={ITEMS}
      />
    );
    const editButtons = screen.getAllByTitle("Editar");
    await user.click(editButtons[1]); // item opcional "Foto do palco"

    expect(screen.getByDisplayValue("Foto do palco")).toBeInTheDocument();
    // O checkbox reflete required=false do item.
    const checkbox = screen.getByRole("checkbox", { name: /Obrigatório/i });
    expect(checkbox).not.toBeChecked();
  });

  it("adiciona um item e fecha o form ao submeter", async () => {
    const user = userEvent.setup();
    vi.mocked(addTemplateItem).mockResolvedValueOnce(undefined as never);
    render(
      <TemplateItemsEditor
        templateId="t-1"
        section="operational"
        sectionLabel="Operacional"
        items={ITEMS}
      />
    );
    await user.click(screen.getByRole("button", { name: /^Item$/i }));
    await user.type(screen.getByPlaceholderText("Texto do item"), "Novo item");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(addTemplateItem).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Texto do item")).not.toBeInTheDocument()
    );
  });

  it("cancela o form de criação pelo X", async () => {
    const user = userEvent.setup();
    render(
      <TemplateItemsEditor
        templateId="t-1"
        section="operational"
        sectionLabel="Operacional"
        items={ITEMS}
      />
    );
    await user.click(screen.getByRole("button", { name: /^Item$/i }));
    const form = screen
      .getByPlaceholderText("Texto do item")
      .closest("form") as HTMLFormElement;
    const cancel = within(form)
      .getAllByRole("button")
      .find((b) => b.getAttribute("type") === "button")!;
    await user.click(cancel);
    expect(screen.queryByPlaceholderText("Texto do item")).not.toBeInTheDocument();
  });

  it("edita um item e fecha o modo de edição ao submeter", async () => {
    const user = userEvent.setup();
    vi.mocked(updateTemplateItem).mockResolvedValueOnce(undefined as never);
    render(
      <TemplateItemsEditor
        templateId="t-1"
        section="operational"
        sectionLabel="Operacional"
        items={ITEMS}
      />
    );
    await user.click(screen.getAllByTitle("Editar")[0]);
    const input = screen.getByDisplayValue("Conferir cabos");
    await user.clear(input);
    await user.type(input, "Conferir todos os cabos");
    // Toggle do checkbox obrigatório.
    await user.click(screen.getByRole("checkbox", { name: /Obrigatório/i }));
    const form = input.closest("form") as HTMLFormElement;
    await user.click(within(form).getByTitle("Salvar"));
    await waitFor(() => expect(updateTemplateItem).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Conferir todos os cabos")).not.toBeInTheDocument()
    );
  });

  it("cancela a edição pelo X", async () => {
    const user = userEvent.setup();
    render(
      <TemplateItemsEditor
        templateId="t-1"
        section="operational"
        sectionLabel="Operacional"
        items={ITEMS}
      />
    );
    await user.click(screen.getAllByTitle("Editar")[0]);
    const input = screen.getByDisplayValue("Conferir cabos");
    const form = input.closest("form") as HTMLFormElement;
    const cancel = within(form)
      .getAllByRole("button")
      .find((b) => b.getAttribute("type") === "button")!;
    await user.click(cancel);
    expect(screen.queryByDisplayValue("Conferir cabos")).not.toBeInTheDocument();
    expect(screen.getByText("Conferir cabos")).toBeInTheDocument();
  });

  it("abre o diálogo de remover item", async () => {
    const user = userEvent.setup();
    render(
      <TemplateItemsEditor
        templateId="t-1"
        section="operational"
        sectionLabel="Operacional"
        items={ITEMS}
      />
    );
    const removeButtons = screen.getAllByTitle("Remover");
    await user.click(removeButtons[0]);
    expect(await screen.findByText(/Remover item/i)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Remover" })).toBeInTheDocument();
  });
});
