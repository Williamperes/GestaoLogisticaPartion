// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/events/actions", () => ({
  addEventDate: vi.fn(),
  updateEventDate: vi.fn(),
  removeEventDate: vi.fn(),
  addEventDateTeamMember: vi.fn(),
  removeEventDateTeamMember: vi.fn(),
}));

import {
  addEventDate,
  updateEventDate,
} from "@/app/(dashboard)/events/actions";
import { EventDatesPanel } from "@/app/(dashboard)/events/[id]/EventDatesPanel";
import type { EventDate } from "@/lib/event-dates";

const TEAM_MEMBERS = [
  { id: "tm-1", name: "Ana Paula", specialty: "Áudio" },
  { id: "tm-2", name: "Bruno", specialty: null },
];

const DATE_WITH_TEAM: EventDate = {
  id: "d-1",
  eventId: "ev-1",
  date: "2026-07-15",
  position: 0,
  eventStartTime: "08:00:00",
  eventEndTime: "18:00:00",
  notes: "Chegar cedo",
  teamMembers: [
    {
      id: "a-1",
      eventDateId: "d-1",
      teamMemberId: "tm-1",
      externalName: null,
      role: "audio",
      customRole: null,
      notes: null,
      teamMemberName: "Ana Paula",
      displayName: "Ana Paula",
    },
  ],
};

describe("EventDatesPanel", () => {
  it("mostra estado vazio quando não há datas", () => {
    render(
      <EventDatesPanel
        eventId="ev-1"
        dates={[]}
        teamMembers={TEAM_MEMBERS}
        canEdit
      />
    );
    expect(
      screen.getByText(/Adicione as datas do evento e a escala de equipe por dia./i)
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma data adicionada.")).toBeInTheDocument();
  });

  it("renderiza um card de data com horário, observação e escala", () => {
    render(
      <EventDatesPanel
        eventId="ev-1"
        dates={[DATE_WITH_TEAM]}
        teamMembers={TEAM_MEMBERS}
        canEdit
      />
    );
    expect(screen.getByText("1 data agendada.")).toBeInTheDocument();
    expect(screen.getByText("08:00 – 18:00")).toBeInTheDocument();
    expect(screen.getByText("Chegar cedo")).toBeInTheDocument();
    expect(screen.getByText("Ana Paula")).toBeInTheDocument();
  });

  it("mostra 'Nenhuma pessoa na escala.' quando a data não tem equipe", () => {
    render(
      <EventDatesPanel
        eventId="ev-1"
        dates={[{ ...DATE_WITH_TEAM, id: "d-2", teamMembers: [] }]}
        teamMembers={TEAM_MEMBERS}
        canEdit
      />
    );
    expect(screen.getByText("Nenhuma pessoa na escala.")).toBeInTheDocument();
  });

  it("não mostra controles de edição quando canEdit é false", () => {
    render(
      <EventDatesPanel
        eventId="ev-1"
        dates={[DATE_WITH_TEAM]}
        teamMembers={TEAM_MEMBERS}
        canEdit={false}
      />
    );
    expect(
      screen.queryByRole("button", { name: /Adicionar data/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle("Editar data")).not.toBeInTheDocument();
  });

  it("abre o sheet de nova data ao clicar em 'Adicionar data'", async () => {
    const user = userEvent.setup();
    render(
      <EventDatesPanel
        eventId="ev-1"
        dates={[]}
        teamMembers={TEAM_MEMBERS}
        canEdit
      />
    );
    await user.click(screen.getByRole("button", { name: /Adicionar data/i }));

    expect(await screen.findByText("Nova data do evento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
  });

  it("abre o sheet de edição pré-preenchido com a data", async () => {
    const user = userEvent.setup();
    render(
      <EventDatesPanel
        eventId="ev-1"
        dates={[DATE_WITH_TEAM]}
        teamMembers={TEAM_MEMBERS}
        canEdit
      />
    );
    await user.click(screen.getByTitle("Editar data"));

    expect(await screen.findByText("Editar data")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-07-15")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Chegar cedo")).toBeInTheDocument();
  });

  it("submete o sheet de nova data (addEventDate)", async () => {
    const user = userEvent.setup();
    vi.mocked(addEventDate).mockResolvedValueOnce(undefined as never);
    render(
      <EventDatesPanel
        eventId="ev-1"
        dates={[]}
        teamMembers={TEAM_MEMBERS}
        canEdit
      />
    );
    await user.click(screen.getByRole("button", { name: /Adicionar data/i }));
    await screen.findByText("Nova data do evento");
    const dateInput = document.querySelector(
      'input[name="date"]'
    ) as HTMLInputElement;
    await user.type(dateInput, "2026-08-01");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(addEventDate).toHaveBeenCalled());
  });

  it("submete o sheet de editar data (updateEventDate)", async () => {
    const user = userEvent.setup();
    vi.mocked(updateEventDate).mockResolvedValueOnce(undefined as never);
    render(
      <EventDatesPanel
        eventId="ev-1"
        dates={[DATE_WITH_TEAM]}
        teamMembers={TEAM_MEMBERS}
        canEdit
      />
    );
    await user.click(screen.getByTitle("Editar data"));
    await screen.findByText("Editar data");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(updateEventDate).toHaveBeenCalled());
  });

  it("abre o form de escala, alterna entre 'Da equipe' e 'Nome livre'", async () => {
    const user = userEvent.setup();
    render(
      <EventDatesPanel
        eventId="ev-1"
        dates={[DATE_WITH_TEAM]}
        teamMembers={TEAM_MEMBERS}
        canEdit
      />
    );
    await user.click(screen.getByText("Adicionar pessoa"));

    // Por padrão "Da equipe" está marcado e mostra o select de membros.
    const fromTeam = screen.getByRole("radio", { name: /Da equipe/i });
    const freeName = screen.getByRole("radio", { name: /Nome livre/i });
    expect(fromTeam).toBeChecked();
    expect(
      document.querySelector('select[name="teamMemberId"]')
    ).toBeInTheDocument();

    // Troca para nome livre: aparece o input de texto.
    await user.click(freeName);
    expect(freeName).toBeChecked();
    expect(
      screen.getByPlaceholderText("Nome da pessoa")
    ).toBeInTheDocument();

    // Volta para "Da equipe".
    await user.click(fromTeam);
    expect(
      document.querySelector('select[name="teamMemberId"]')
    ).toBeInTheDocument();
  });

  it("mostra o campo de papel personalizado ao escolher 'outro'", async () => {
    const user = userEvent.setup();
    render(
      <EventDatesPanel
        eventId="ev-1"
        dates={[DATE_WITH_TEAM]}
        teamMembers={TEAM_MEMBERS}
        canEdit
      />
    );
    await user.click(screen.getByText("Adicionar pessoa"));
    const roleSelect = document.querySelector(
      'select[name="role"]'
    ) as HTMLSelectElement;
    await user.selectOptions(roleSelect, "outro");
    expect(
      screen.getByPlaceholderText("Papel personalizado *")
    ).toBeInTheDocument();
  });

  it("abre o diálogo de remover pessoa da escala", async () => {
    const user = userEvent.setup();
    render(
      <EventDatesPanel
        eventId="ev-1"
        dates={[DATE_WITH_TEAM]}
        teamMembers={TEAM_MEMBERS}
        canEdit
      />
    );
    // O botão de remover pessoa tem title "Remover".
    await user.click(screen.getByTitle("Remover"));
    expect(
      await screen.findByText("Remover pessoa da escala")
    ).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Remover" })
    ).toBeInTheDocument();
  });
});
