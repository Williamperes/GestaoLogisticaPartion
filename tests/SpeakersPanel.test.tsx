// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/events/actions", () => ({
  addEventSpeaker: vi.fn(),
  updateEventSpeaker: vi.fn(),
  removeEventSpeaker: vi.fn(),
}));

import {
  addEventSpeaker,
  updateEventSpeaker,
} from "@/app/(dashboard)/events/actions";
import { SpeakersPanel } from "@/app/(dashboard)/events/[id]/SpeakersPanel";
import type { EventSpeaker } from "@/lib/event-aux";

const SPEAKERS: EventSpeaker[] = [
  {
    id: "s-1",
    eventId: "ev-1",
    name: "Dra. Ana Souza",
    organization: "ACME Corp",
    needsMic: true,
    needsNotebook: false,
    needsAdapter: true,
    needsDedicatedTech: false,
    notes: "Idioma: inglês",
    position: 0,
  },
  {
    id: "s-2",
    eventId: "ev-1",
    name: "João Lima",
    organization: null,
    needsMic: false,
    needsNotebook: false,
    needsAdapter: false,
    needsDedicatedTech: false,
    notes: null,
    position: 1,
  },
];

describe("SpeakersPanel", () => {
  it("mostra estado vazio quando não há palestrantes", () => {
    render(<SpeakersPanel eventId="ev-1" speakers={[]} canEdit />);
    expect(screen.getByText("Nenhum palestrante cadastrado.")).toBeInTheDocument();
    expect(screen.getByText(/Palestrantes \/ Artistas \(0\)/)).toBeInTheDocument();
  });

  it("renderiza palestrantes com organização, demandas e observações", () => {
    render(<SpeakersPanel eventId="ev-1" speakers={SPEAKERS} canEdit />);
    expect(screen.getByText("Dra. Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("· ACME Corp")).toBeInTheDocument();
    expect(screen.getByText("João Lima")).toBeInTheDocument();
    expect(screen.getByText("Idioma: inglês")).toBeInTheDocument();
    // Demandas técnicas ativas viram badges.
    expect(screen.getByText("Mic")).toBeInTheDocument();
    expect(screen.getByText("Adaptador")).toBeInTheDocument();
    expect(screen.getByText(/Palestrantes \/ Artistas \(2\)/)).toBeInTheDocument();
  });

  it("não mostra o botão Adicionar quando canEdit é false", () => {
    render(<SpeakersPanel eventId="ev-1" speakers={SPEAKERS} canEdit={false} />);
    expect(
      screen.queryByRole("button", { name: /Adicionar/i })
    ).not.toBeInTheDocument();
  });

  it("abre o sheet de novo palestrante com os campos do formulário", async () => {
    const user = userEvent.setup();
    render(<SpeakersPanel eventId="ev-1" speakers={[]} canEdit />);

    await user.click(screen.getByRole("button", { name: /Adicionar/i }));

    expect(await screen.findByText("Novo palestrante")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex.: Dra. Ana Souza")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex.: ACME Corp")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Microfone/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar palestrante" })
    ).toBeInTheDocument();
  });

  it("alterna uma demanda técnica no formulário", async () => {
    const user = userEvent.setup();
    render(<SpeakersPanel eventId="ev-1" speakers={[]} canEdit />);
    await user.click(screen.getByRole("button", { name: /Adicionar/i }));

    const micCheckbox = (await screen.findByRole("checkbox", {
      name: /Microfone/i,
    })) as HTMLInputElement;
    expect(micCheckbox).not.toBeChecked();
    await user.click(micCheckbox);
    expect(micCheckbox).toBeChecked();
  });

  it("abre o sheet de edição pré-preenchido com o palestrante", async () => {
    const user = userEvent.setup();
    render(<SpeakersPanel eventId="ev-1" speakers={SPEAKERS} canEdit />);

    const editButtons = screen.getAllByTitle("Editar");
    await user.click(editButtons[0]);

    expect(await screen.findByText("Editar palestrante")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Dra. Ana Souza")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ACME Corp")).toBeInTheDocument();
  });

  it("submete o formulário de novo palestrante (addEventSpeaker)", async () => {
    const user = userEvent.setup();
    vi.mocked(addEventSpeaker).mockResolvedValueOnce(undefined as never);
    render(<SpeakersPanel eventId="ev-1" speakers={[]} canEdit />);
    await user.click(screen.getByRole("button", { name: /Adicionar/i }));
    await user.type(
      await screen.findByPlaceholderText("Ex.: Dra. Ana Souza"),
      "Carlos Dias"
    );
    await user.click(screen.getByRole("checkbox", { name: /Microfone/i }));
    await user.click(
      screen.getByRole("button", { name: "Adicionar palestrante" })
    );
    await waitFor(() => expect(addEventSpeaker).toHaveBeenCalled());
  });

  it("submete a edição de um palestrante (updateEventSpeaker)", async () => {
    const user = userEvent.setup();
    vi.mocked(updateEventSpeaker).mockResolvedValueOnce(undefined as never);
    render(<SpeakersPanel eventId="ev-1" speakers={SPEAKERS} canEdit />);
    await user.click(screen.getAllByTitle("Editar")[0]);
    const name = await screen.findByDisplayValue("Dra. Ana Souza");
    await user.clear(name);
    await user.type(name, "Dra. Ana S.");
    // Alterna uma demanda existente.
    await user.click(screen.getByRole("checkbox", { name: /Notebook/i }));
    await user.click(
      screen.getByRole("button", { name: "Salvar alterações" })
    );
    await waitFor(() => expect(updateEventSpeaker).toHaveBeenCalled());
  });

  it("abre o diálogo de remover palestrante", async () => {
    const user = userEvent.setup();
    render(<SpeakersPanel eventId="ev-1" speakers={SPEAKERS} canEdit />);
    await user.click(screen.getAllByTitle("Remover")[0]);
    expect(await screen.findByText("Remover palestrante")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Remover" })
    ).toBeInTheDocument();
  });
});
