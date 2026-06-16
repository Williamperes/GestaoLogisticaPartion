// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/events/actions", () => ({
  updateEventDetails: vi.fn(),
}));

import { EditEventDetailsSheet } from "@/app/(dashboard)/events/[id]/EditEventDetailsSheet";
import { updateEventDetails } from "@/app/(dashboard)/events/actions";
import type { EventDetail } from "@/lib/events";
import type { ClientOrganization } from "@/lib/clients";

const CLIENTS: ClientOrganization[] = [
  { id: "c-1", name: "ACME Corp", city: "São Paulo" } as ClientOrganization,
  { id: "c-2", name: "Globo", city: null } as ClientOrganization,
];

const EVENT = {
  id: "ev-1",
  organizationId: "org-1",
  clientOrganizationId: "c-1",
  clientName: "ACME Corp",
  name: "Festival Aurora",
  venue: "Arena SP",
  city: "São Paulo",
  venueNotes: "Portão B",
  startDate: "2026-08-01",
  endDate: "2026-08-03",
  status: "planning",
  createdAt: "2026-01-01T00:00:00+00:00",
  vehicle: "Kombi Ilmar",
  lightingColor: "DMX",
  assemblyAt: "2026-07-31T14:00:00+00:00",
  teardownAt: null,
  agencyName: "Agência X",
  notes: "Notas livres",
  executivePresent: true,
  isRecorded: false,
  isLivestreamed: true,
  clientDemanding: false,
  agencyDetailed: false,
  previousDayAssembly: true,
  requiresAdvanceCredential: false,
  strictVenueHours: false,
  checklist: [],
  equipment: [],
  speakers: [],
  extras: [],
} as unknown as EventDetail;

describe("EditEventDetailsSheet", () => {
  it("renderiza o gatilho 'Editar OS'", () => {
    render(<EditEventDetailsSheet event={EVENT} clients={CLIENTS} />);
    expect(screen.getByRole("button", { name: /Editar OS/i })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Festival Aurora")).not.toBeInTheDocument();
  });

  it("abre o sheet e pré-preenche os campos a partir do evento", async () => {
    const user = userEvent.setup();
    render(<EditEventDetailsSheet event={EVENT} clients={CLIENTS} />);

    await user.click(screen.getByRole("button", { name: /Editar OS/i }));

    expect(await screen.findByDisplayValue("Festival Aurora")).toBeInTheDocument();
    expect(screen.getByText("Editar Ordem de Serviço")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Arena SP")).toBeInTheDocument();
    expect(screen.getByDisplayValue("São Paulo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Kombi Ilmar")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Agência X")).toBeInTheDocument();
  });

  it("converte assemblyAt ISO para o formato datetime-local", async () => {
    const user = userEvent.setup();
    render(<EditEventDetailsSheet event={EVENT} clients={CLIENTS} />);
    await user.click(screen.getByRole("button", { name: /Editar OS/i }));
    await screen.findByDisplayValue("Festival Aurora");

    expect(screen.getByDisplayValue("2026-07-31T14:00")).toBeInTheDocument();
  });

  it("reflete as flags de risco nos checkboxes", async () => {
    const user = userEvent.setup();
    render(<EditEventDetailsSheet event={EVENT} clients={CLIENTS} />);
    await user.click(screen.getByRole("button", { name: /Editar OS/i }));
    await screen.findByDisplayValue("Festival Aurora");

    expect(
      screen.getByRole("checkbox", { name: /Diretoria \/ CEO presente/i })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Transmissão ao vivo/i })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Evento gravado/i })
    ).not.toBeChecked();
  });

  it("seleciona o cliente vinculado no select", async () => {
    const user = userEvent.setup();
    render(<EditEventDetailsSheet event={EVENT} clients={CLIENTS} />);
    await user.click(screen.getByRole("button", { name: /Editar OS/i }));
    await screen.findByDisplayValue("Festival Aurora");

    const select = screen.getByRole("combobox", { name: /Cliente/i }) as HTMLSelectElement;
    expect(select.value).toBe("c-1");
  });

  it("permite editar o nome do evento", async () => {
    const user = userEvent.setup();
    render(<EditEventDetailsSheet event={EVENT} clients={CLIENTS} />);
    await user.click(screen.getByRole("button", { name: /Editar OS/i }));

    const nameInput = (await screen.findByDisplayValue(
      "Festival Aurora"
    )) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Festival Boreal");
    expect(nameInput.value).toBe("Festival Boreal");
  });

  it("submete o formulário chamando updateEventDetails e fecha o sheet", async () => {
    const user = userEvent.setup();
    render(<EditEventDetailsSheet event={EVENT} clients={CLIENTS} />);
    await user.click(screen.getByRole("button", { name: /Editar OS/i }));
    await screen.findByDisplayValue("Festival Aurora");

    await user.click(screen.getByRole("button", { name: /Salvar alterações/i }));

    expect(updateEventDetails).toHaveBeenCalledTimes(1);
    const fd = (updateEventDetails as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as FormData;
    expect(fd.get("eventId")).toBe("ev-1");

    // Após salvar, o sheet fecha e os campos somem do DOM.
    expect(
      await screen.findByRole("button", { name: /Editar OS/i })
    ).toBeInTheDocument();
  });
});
