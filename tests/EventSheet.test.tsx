// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/events/actions", () => ({
  createEvent: vi.fn(),
}));

import { EventSheet } from "@/app/(dashboard)/events/EventSheet";
import type { ClientOrganization } from "@/lib/clients";
import type { ChecklistTemplate } from "@/lib/checklist-templates";

const CLIENTS: ClientOrganization[] = [
  {
    id: "c-1",
    name: "ACME Corp",
    city: "São Paulo",
  } as ClientOrganization,
  {
    id: "c-2",
    name: "Globo",
    city: null,
  } as ClientOrganization,
];

const TEMPLATES: ChecklistTemplate[] = [
  {
    id: "t-1",
    name: "Festival",
    isDefault: false,
    requiredCount: 3,
  } as ChecklistTemplate,
  {
    id: "t-2",
    name: "Corporativo",
    isDefault: true,
    requiredCount: 1,
  } as ChecklistTemplate,
];

describe("EventSheet", () => {
  it("renderiza o gatilho 'Nova OS'", () => {
    render(<EventSheet clients={CLIENTS} templates={TEMPLATES} />);
    expect(screen.getByRole("button", { name: /Nova OS/i })).toBeInTheDocument();
    // Conteúdo só aparece após clicar.
    expect(
      screen.queryByPlaceholderText("Ex.: Festival Aurora 2025")
    ).not.toBeInTheDocument();
  });

  it("abre o sheet e revela os campos do formulário", async () => {
    const user = userEvent.setup();
    render(<EventSheet clients={CLIENTS} templates={TEMPLATES} />);

    await user.click(screen.getByRole("button", { name: /Nova OS/i }));

    expect(
      await screen.findByPlaceholderText("Ex.: Festival Aurora 2025")
    ).toBeInTheDocument();
    expect(screen.getByText("Nova Ordem de Serviço")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex.: Arena Multiuso SP")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Criar Ordem de Serviço/i })
    ).toBeInTheDocument();
  });

  it("lista os clientes como opções do select", async () => {
    const user = userEvent.setup();
    render(<EventSheet clients={CLIENTS} templates={TEMPLATES} />);
    await user.click(screen.getByRole("button", { name: /Nova OS/i }));

    await screen.findByPlaceholderText("Ex.: Festival Aurora 2025");
    expect(screen.getByRole("option", { name: /ACME Corp · São Paulo/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Globo" })).toBeInTheDocument();
  });

  it("seleciona o template padrão e mostra os templates disponíveis", async () => {
    const user = userEvent.setup();
    render(<EventSheet clients={CLIENTS} templates={TEMPLATES} />);
    await user.click(screen.getByRole("button", { name: /Nova OS/i }));

    await screen.findByPlaceholderText("Ex.: Festival Aurora 2025");
    const select = screen.getByRole("combobox", { name: /Template de Checklist/i });
    expect((select as HTMLSelectElement).value).toBe("t-2");
    expect(
      screen.getByRole("option", { name: /Corporativo · padrão · 1 obrigatório/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Festival · 3 obrigatórios/ })
    ).toBeInTheDocument();
  });

  it("mostra aviso quando não há templates cadastrados", async () => {
    const user = userEvent.setup();
    render(<EventSheet clients={CLIENTS} templates={[]} />);
    await user.click(screen.getByRole("button", { name: /Nova OS/i }));

    expect(
      await screen.findByText(/Nenhum template cadastrado/i)
    ).toBeInTheDocument();
  });

  it("permite digitar no campo de nome", async () => {
    const user = userEvent.setup();
    render(<EventSheet clients={CLIENTS} templates={TEMPLATES} />);
    await user.click(screen.getByRole("button", { name: /Nova OS/i }));

    const nameInput = (await screen.findByPlaceholderText(
      "Ex.: Festival Aurora 2025"
    )) as HTMLInputElement;
    await user.type(nameInput, "Show Open Air");
    expect(nameInput.value).toBe("Show Open Air");
  });

  it("permite recolher e expandir todas as seções sem perder os dados", async () => {
    const user = userEvent.setup();
    render(<EventSheet clients={CLIENTS} templates={TEMPLATES} />);
    await user.click(screen.getByRole("button", { name: /Nova OS/i }));

    const sectionTitles = [
      "Dados principais",
      "Datas e valor",
      "Local do evento",
      "Detalhes operacionais (opcional)",
      "Checklist",
    ];

    for (const title of sectionTitles) {
      expect(screen.getByText(title).closest("details")).toBeInTheDocument();
    }

    const nameInput = screen.getByPlaceholderText("Ex.: Festival Aurora 2025");
    await user.type(nameInput, "Evento preservado");

    const primarySectionTitle = screen.getByText("Dados principais");
    const primarySection = primarySectionTitle.closest("details") as HTMLDetailsElement;
    expect(primarySection.open).toBe(true);

    await user.click(primarySectionTitle);
    expect(primarySection.open).toBe(false);
    expect(nameInput).toHaveValue("Evento preservado");

    await user.click(primarySectionTitle);
    expect(primarySection.open).toBe(true);
    expect(nameInput).toHaveValue("Evento preservado");
  });

  it("divide os detalhes operacionais em subseções recolhíveis", async () => {
    const user = userEvent.setup();
    render(<EventSheet clients={CLIENTS} templates={TEMPLATES} />);
    await user.click(screen.getByRole("button", { name: /Nova OS/i }));

    const operationalTitle = screen.getByText("Detalhes operacionais (opcional)");
    const operationalSection = operationalTitle.closest("details") as HTMLDetailsElement;
    await user.click(operationalTitle);

    expect(operationalSection.open).toBe(true);

    for (const title of [
      "Transporte e iluminação",
      "Cronograma operacional",
      "Agência e riscos",
      "Observações",
    ]) {
      const sectionTitle = screen
        .getAllByText(title)
        .find((element) => element.closest("summary"));
      const subsection = sectionTitle?.closest("details") as HTMLDetailsElement;
      expect(subsection).toBeInTheDocument();
      expect(subsection.open).toBe(false);
    }

    const transportTitle = screen.getByText("Transporte e iluminação");
    const transportSection = transportTitle.closest("details") as HTMLDetailsElement;
    await user.click(transportTitle);
    await user.type(screen.getByPlaceholderText("Ex.: Kombi Ilmar"), "Van branca");
    await user.click(transportTitle);

    expect(transportSection.open).toBe(false);
    expect(screen.getByPlaceholderText("Ex.: Kombi Ilmar")).toHaveValue("Van branca");
  });
});
