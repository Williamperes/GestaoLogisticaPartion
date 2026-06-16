// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CreateTemplateButton } from "@/app/(dashboard)/settings/checklist-templates/CreateTemplateButton";

vi.mock("@/app/(dashboard)/settings/checklist-templates/actions", () => ({
  createTemplate: vi.fn(),
}));

describe("CreateTemplateButton", () => {
  it("renderiza o botão de trigger", () => {
    render(<CreateTemplateButton />);
    expect(screen.getByRole("button", { name: /Novo template/i })).toBeInTheDocument();
  });

  it("abre o sheet com os campos do formulário ao clicar", async () => {
    const user = userEvent.setup();
    render(<CreateTemplateButton />);

    expect(screen.queryByPlaceholderText("Ex.: Festival corporativo")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Novo template/i }));

    expect(await screen.findByPlaceholderText("Ex.: Festival corporativo")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Para que esse template é usado?")).toBeInTheDocument();
    expect(
      screen.getByText("Usar como template padrão para novas OS")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar template" })).toBeInTheDocument();
  });
});
