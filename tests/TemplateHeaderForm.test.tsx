// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TemplateHeaderForm } from "@/app/(dashboard)/settings/checklist-templates/[id]/TemplateHeaderForm";

vi.mock("@/app/(dashboard)/settings/checklist-templates/actions", () => ({
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));

const TEMPLATE = {
  id: "t-1",
  name: "Festival corporativo",
  description: "Checklist padrão",
  isDefault: true,
};

describe("TemplateHeaderForm", () => {
  it("preenche os campos a partir do template", () => {
    render(<TemplateHeaderForm template={TEMPLATE} />);
    expect((screen.getByDisplayValue("Festival corporativo") as HTMLInputElement).name).toBe("name");
    expect(screen.getByDisplayValue("Checklist padrão")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("trata descrição nula como string vazia", () => {
    render(
      <TemplateHeaderForm
        template={{ id: "t-2", name: "Sem desc", description: null, isDefault: false }}
      />
    );
    const textarea = screen.getByRole("textbox", { name: /Descrição/i }) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("é controlado: digitar atualiza o valor do nome", async () => {
    const user = userEvent.setup();
    render(<TemplateHeaderForm template={TEMPLATE} />);
    const nameInput = screen.getByDisplayValue("Festival corporativo") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Show Open Air");
    expect(nameInput.value).toBe("Show Open Air");
  });

  it("alterna o checkbox de template padrão", async () => {
    const user = userEvent.setup();
    render(<TemplateHeaderForm template={TEMPLATE} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("é controlado: digitar atualiza o valor da descrição", async () => {
    const user = userEvent.setup();
    render(<TemplateHeaderForm template={TEMPLATE} />);
    const textarea = screen.getByRole("textbox", {
      name: /Descrição/i,
    }) as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, "Novo checklist detalhado");
    expect(textarea.value).toBe("Novo checklist detalhado");
  });

  it("abre o diálogo de confirmação de exclusão", async () => {
    const user = userEvent.setup();
    render(<TemplateHeaderForm template={TEMPLATE} />);
    await user.click(screen.getByRole("button", { name: /Excluir template/i }));
    expect(
      await screen.findByText(/Esta ação remove o template e todos os seus itens/i)
    ).toBeInTheDocument();
    // Botão de confirmação dentro do diálogo.
    expect(screen.getByRole("button", { name: "Excluir" })).toBeInTheDocument();
  });
});
