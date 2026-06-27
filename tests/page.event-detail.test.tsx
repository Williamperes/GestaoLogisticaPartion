// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

vi.mock("framer-motion", () => {
  const React = require("react");
  const passthrough = (tag: string) =>
    React.forwardRef(({ children, ...props }: Record<string, unknown>, ref: unknown) => {
      const { animate, initial, exit, transition, ...rest } = props as Record<string, unknown>;
      void animate;
      void initial;
      void exit;
      void transition;
      return React.createElement(tag, { ...rest, ref }, children as React.ReactNode);
    });
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("next/navigation", () => ({
  redirect: vi.fn((u: string) => {
    throw new Error("REDIRECT:" + u);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const auth = vi.hoisted(() => ({
  getCurrentUserContext: vi.fn(
    async () =>
      ({
        role: "admin",
        userId: "u1",
        primaryOrganization: { id: "org-1" },
      }) as { role: string | null; userId: string; primaryOrganization: { id: string } | null } | null
  ),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: auth.getCurrentUserContext,
}));

const ev = vi.hoisted(() => ({
  getEventById: vi.fn(),
}));

function eventDetail() {
  return {
    id: "ev-1",
    organizationId: "org-1",
    clientOrganizationId: "cli-1",
    clientName: "Cliente X",
    name: "Show Acústico",
    venue: "Arena",
    city: "São Paulo",
    venueNotes: null,
    startDate: "2026-02-01",
    endDate: "2026-02-02",
    status: "planning" as const,
    createdAt: "2026-01-01",
    vehicle: null,
    lightingColor: null,
    assemblyAt: null,
    teardownAt: null,
    agencyName: null,
    notes: null,
    executivePresent: false,
    isRecorded: false,
    isLivestreamed: false,
    clientDemanding: false,
    agencyDetailed: false,
    previousDayAssembly: false,
    requiresAdvanceCredential: false,
    strictVenueHours: false,
    checklist: [
      {
        id: "c1",
        eventId: "ev-1",
        label: "Rider técnico revisado",
        position: 1,
        section: "strategic" as const,
        required: true,
        templateItemId: null,
        done: true,
        doneAt: null,
        doneBy: null,
      },
    ],
    equipment: [],
    speakers: [],
    extras: [],
  };
}

vi.mock("@/lib/events", async (orig) => ({
  ...(await orig<typeof import("@/lib/events")>()),
  getEventById: ev.getEventById,
}));

vi.mock("@/lib/inventory", async (orig) => ({
  ...(await orig<typeof import("@/lib/inventory")>()),
  listEquipment: vi.fn(async () => []),
  getEquipmentAvailability: vi.fn(async () => new Map()),
}));

vi.mock("@/lib/clients", async (orig) => ({
  ...(await orig<typeof import("@/lib/clients")>()),
  listClientOrganizations: vi.fn(async () => []),
}));

// Não fazemos spread do original: o módulo importa "server-only" (não
// resolvível sob vitest). Mockamos só a função usada pela página.
vi.mock("@/lib/event-dates.server", () => ({
  listEventDates: vi.fn(async () => []),
}));

vi.mock("@/lib/equipmentTemplates", () => ({
  listEquipmentTemplates: vi.fn(async () => []),
}));

vi.mock("@/app/(dashboard)/events/[id]/ApplyTemplateButton", () => ({
  ApplyTemplateButton: () => null,
}));

vi.mock("@/lib/team", async (orig) => ({
  ...(await orig<typeof import("@/lib/team")>()),
  listTeamMembers: vi.fn(async () => []),
  getTeamMemberByUserId: vi.fn(async () => ({ id: "m-1" })),
  teamMemberHasEventAccess: vi.fn(async () => true),
}));

// Server actions module.
vi.mock("@/app/(dashboard)/events/actions", () => ({
  toggleChecklistItem: vi.fn(),
  promoteToReadyToLoad: vi.fn(),
  removeEquipmentFromEvent: vi.fn(),
  toggleEquipmentSeparated: vi.fn(),
  deleteEvent: vi.fn(),
}));

// Tabs: render ALL TabsContent eagerly (base-ui only mounts the active
// panel). Stubbing the primitives lets the page's per-tab inline JSX run.
vi.mock("@/components/ui/tabs", () => {
  const React = require("react");
  return {
    Tabs: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    TabsList: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    TabsTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement("button", null, children),
    TabsContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});

// Client children — stubs. Marker children kept tiny so a branch that must
// render a child still executes the surrounding page markup.
vi.mock("@/app/(dashboard)/events/[id]/AddEquipmentSheet", () => ({
  AddEquipmentSheet: () => {
    const React = require("react");
    return React.createElement("div", null, "ADD_EQUIPMENT_SHEET");
  },
}));
vi.mock("@/app/(dashboard)/events/[id]/EditEventDetailsSheet", () => ({
  EditEventDetailsSheet: () => {
    const React = require("react");
    return React.createElement("div", null, "EDIT_EVENT_SHEET");
  },
}));
vi.mock("@/app/(dashboard)/events/[id]/EventDatesPanel", () => ({
  EventDatesPanel: () => {
    const React = require("react");
    return React.createElement("div", null, "DATES_PANEL");
  },
}));
vi.mock("@/app/(dashboard)/events/[id]/SpeakersPanel", () => ({
  SpeakersPanel: () => {
    const React = require("react");
    return React.createElement("div", null, "SPEAKERS_PANEL");
  },
}));
vi.mock("@/app/(dashboard)/events/[id]/ExtrasPanel", () => ({
  ExtrasPanel: () => {
    const React = require("react");
    return React.createElement("div", null, "EXTRAS_PANEL");
  },
}));
vi.mock("@/app/(dashboard)/events/[id]/EventToastSync", () => ({ EventToastSync: () => null }));
vi.mock("@/components/ui/delete-confirm-dialog", () => ({ DeleteConfirmDialog: () => null }));

import EventDetailPage from "@/app/(dashboard)/events/[id]/page";

describe("EventDetailPage (RSC)", () => {
  it("renderiza header, cliente e checklist", async () => {
    ev.getEventById.mockResolvedValueOnce(eventDetail());
    const ui = await EventDetailPage({ params: Promise.resolve({ id: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("heading", { name: "Show Acústico" })).toBeInTheDocument();
    expect(screen.getByText("Rider técnico revisado")).toBeInTheDocument();
  });

  it("dispara notFound quando o evento não existe", async () => {
    ev.getEventById.mockResolvedValueOnce(null);
    await expect(
      EventDetailPage({ params: Promise.resolve({ id: "nope" }) })
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("redireciona warehouse sem acesso à OS", async () => {
    ev.getEventById.mockResolvedValueOnce(eventDetail());
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "warehouse",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });
    const team = await import("@/lib/team");
    vi.mocked(team.teamMemberHasEventAccess).mockResolvedValueOnce(false);
    await expect(
      EventDetailPage({ params: Promise.resolve({ id: "ev-1" }) })
    ).rejects.toThrow(/REDIRECT:\/events/);
  });

  it("warehouse COM acesso renderiza a página (não redireciona)", async () => {
    ev.getEventById.mockResolvedValueOnce(eventDetail());
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "warehouse",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });
    const team = await import("@/lib/team");
    vi.mocked(team.teamMemberHasEventAccess).mockResolvedValueOnce(true);
    const ui = await EventDetailPage({ params: Promise.resolve({ id: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    // warehouse pode gerir checklist (botão submit), mas não promover.
    expect(screen.getByRole("heading", { name: "Show Acústico" })).toBeInTheDocument();
    // EditEventDetailsSheet é gated por canPromote → não deve aparecer.
    expect(screen.queryByText("EDIT_EVENT_SHEET")).not.toBeInTheDocument();
  });

  it("equipamento bloqueado (planning): mostra aviso de lista bloqueada", async () => {
    ev.getEventById.mockResolvedValueOnce(eventDetail());
    const team = await import("@/lib/team");
    vi.mocked(team.listTeamMembers).mockResolvedValueOnce([
      { id: "tm-1", name: "Maria", specialtyName: "Áudio" },
    ] as never);
    const ui = await EventDetailPage({ params: Promise.resolve({ id: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Lista de equipamentos bloqueada")).toBeInTheDocument();
    // Datas/Speakers/Extras panels renderizam (filhos stubbed como marcadores).
    expect(screen.getByText("DATES_PANEL")).toBeInTheDocument();
    expect(screen.getByText("SPEAKERS_PANEL")).toBeInTheDocument();
    expect(screen.getByText("EXTRAS_PANEL")).toBeInTheDocument();
    // canPromote (admin) → EditEventDetailsSheet aparece.
    expect(screen.getByText("EDIT_EVENT_SHEET")).toBeInTheDocument();
  });

  it("checklist completo + planning: banner de gate e botão de liberar (admin)", async () => {
    const e = eventDetail();
    e.checklist = e.checklist.map((c) => ({ ...c, done: true }));
    ev.getEventById.mockResolvedValueOnce(e);
    const ui = await EventDetailPage({ params: Promise.resolve({ id: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText(/Checklist 100% concluído/)).toBeInTheDocument();
    expect(screen.getAllByText(/Liberar para Carga/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Clique em "Liberar para Carga"/)).toBeInTheDocument();
  });

  it("ready_to_load com equipamento populado: tabela, banner liberado, AddEquipmentSheet e Bipar carregamento", async () => {
    const e = eventDetail();
    e.status = "ready_to_load";
    e.checklist = e.checklist.map((c) => ({ ...c, done: true }));
    e.equipment = [
      {
        id: "ee-1",
        eventId: "ev-1",
        equipmentId: "eq-1",
        equipmentName: "Mesa de Som",
        variantId: "v-1",
        variantLabel: "Grande",
        unitId: "u-1",
        unitSerial: "SN-9",
        unitStatus: "available",
        qty: 1,
        separated: true,
        separatedAt: null,
        separatedBy: null,
        loaded: false,
        loadedAt: null,
        loadedBy: null,
        returnedAt: null,
        loadedUnitsCount: 0,
        returnedUnitsCount: 0,
        notes: null,
      },
      {
        id: "ee-2",
        eventId: "ev-1",
        equipmentId: "eq-2",
        equipmentName: "Cabo XLR",
        variantId: null,
        variantLabel: null,
        unitId: null,
        unitSerial: null,
        unitStatus: null,
        qty: 12,
        separated: false,
        separatedAt: null,
        separatedBy: null,
        loaded: true,
        loadedAt: null,
        loadedBy: null,
        returnedAt: null,
        loadedUnitsCount: 0,
        returnedUnitsCount: 0,
        notes: null,
      },
    ];
    ev.getEventById.mockResolvedValueOnce(e);
    // canEditEquipment (admin + ready_to_load) → listEquipment é chamado.
    const inventory = await import("@/lib/inventory");
    vi.mocked(inventory.listEquipment).mockResolvedValueOnce([
      {
        id: "eq-1",
        organizationId: "org-1",
        categoryId: null,
        categoryName: "Áudio",
        parentCategoryId: null,
        parentCategoryName: null,
        name: "Mesa de Som",
        brand: null,
        model: null,
        type: "serialized",
        status: "available",
        hasVariants: true,
        serial: null,
        patrimony: null,
        purchaseDate: null,
        purchaseValueCents: null,
        qrCode: null,
        notes: null,
        createdAt: "2026-01-01",
        variants: [
          { id: "v-1", equipmentId: "eq-1", label: "Grande", sortValue: null, position: 0, notes: null },
        ],
      },
      {
        id: "eq-2",
        organizationId: "org-1",
        categoryId: null,
        categoryName: "Cabos",
        parentCategoryId: null,
        parentCategoryName: null,
        name: "Cabo XLR",
        brand: null,
        model: null,
        type: "bulk",
        status: "available",
        hasVariants: false,
        serial: null,
        patrimony: null,
        purchaseDate: null,
        purchaseValueCents: null,
        qrCode: null,
        notes: null,
        createdAt: "2026-01-01",
      },
    ] as never);
    vi.mocked(inventory.getEquipmentAvailability).mockResolvedValueOnce(
      new Map<string, { total: number; allocated: number; available: number }>([
        ["eq-1", { total: 5, allocated: 1, available: 4 }],
        ["eq-1:v-1", { total: 3, allocated: 0, available: 3 }],
        ["eq-2", { total: 20, allocated: 8, available: 12 }],
      ]) as never
    );
    const ui = await EventDetailPage({ params: Promise.resolve({ id: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Mesa de Som")).toBeInTheDocument();
    expect(screen.getByText("Grande")).toBeInTheDocument();
    expect(screen.getByText("SN-9")).toBeInTheDocument();
    expect(screen.getByText("12 un")).toBeInTheDocument();
    expect(screen.getByText(/Gate liberado/)).toBeInTheDocument();
    expect(screen.getByText("ADD_EQUIPMENT_SHEET")).toBeInTheDocument();
    expect(screen.getByText(/Bipar carregamento/)).toBeInTheDocument();
    expect(screen.getByText(/Liberado para carga/)).toBeInTheDocument();
  });

  it("in_field: links de Bipar carregamento e Bipar retorno", async () => {
    const e = eventDetail();
    e.status = "in_field";
    e.checklist = e.checklist.map((c) => ({ ...c, done: true }));
    e.equipment = [
      {
        id: "ee-3",
        eventId: "ev-1",
        equipmentId: "eq-3",
        equipmentName: "Projetor",
        variantId: null,
        variantLabel: null,
        unitId: null,
        unitSerial: null,
        unitStatus: null,
        qty: 2,
        separated: false,
        separatedAt: null,
        separatedBy: null,
        loaded: false,
        loadedAt: null,
        loadedBy: null,
        returnedAt: null,
        loadedUnitsCount: 0,
        returnedUnitsCount: 0,
        notes: null,
      },
    ];
    ev.getEventById.mockResolvedValueOnce(e);
    const ui = await EventDetailPage({ params: Promise.resolve({ id: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    // in_field NÃO é editável (canEditEquipment exige ready_to_load) →
    // sem AddEquipmentSheet, mas com os atalhos de scan no cabeçalho.
    expect(screen.getByText(/Bipar carregamento/)).toBeInTheDocument();
    expect(screen.getByText(/Bipar retorno/)).toBeInTheDocument();
    expect(screen.queryByText("ADD_EQUIPMENT_SHEET")).not.toBeInTheDocument();
    // equipamento desbloqueado + sem permissão de edição → texto de leitura.
    expect(screen.getByText("Projetor")).toBeInTheDocument();
  });

  it("ready_to_load sem equipamento e sem permissão (viewer): estado vazio de leitura", async () => {
    const e = eventDetail();
    e.status = "ready_to_load";
    e.checklist = e.checklist.map((c) => ({ ...c, done: true }));
    e.equipment = [];
    ev.getEventById.mockResolvedValueOnce(e);
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "viewer",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });
    const ui = await EventDetailPage({ params: Promise.resolve({ id: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Nenhum equipamento adicionado à OS.")).toBeInTheDocument();
    // viewer não gere checklist → sem botão de submit; item via div.
    expect(screen.queryByText("ADD_EQUIPMENT_SHEET")).not.toBeInTheDocument();
  });

  it("OperationalInfoCard preenchido: veículo, agência, flags de atenção e observações", async () => {
    const e = eventDetail();
    e.vehicle = "Van Branca";
    e.lightingColor = "Âmbar";
    e.assemblyAt = "2026-02-01T08:00:00.000Z";
    e.teardownAt = "2026-02-02T22:00:00.000Z";
    e.agencyName = "Agência Z";
    e.notes = "Cuidado com o piso.";
    e.executivePresent = true;
    e.clientDemanding = true;
    e.isRecorded = true;
    ev.getEventById.mockResolvedValueOnce(e);
    const ui = await EventDetailPage({ params: Promise.resolve({ id: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Informações operacionais")).toBeInTheDocument();
    expect(screen.getByText("Van Branca")).toBeInTheDocument();
    expect(screen.getByText("Âmbar")).toBeInTheDocument();
    expect(screen.getByText("Agência Z")).toBeInTheDocument();
    expect(screen.getByText("Diretoria / CEO presente")).toBeInTheDocument();
    expect(screen.getByText("Cliente exigente (estética)")).toBeInTheDocument();
    expect(screen.getByText("Evento gravado")).toBeInTheDocument();
    expect(screen.getByText("Cuidado com o piso.")).toBeInTheDocument();
  });

  it("OperationalInfoCard vazio: placeholder de detalhes operacionais", async () => {
    ev.getEventById.mockResolvedValueOnce(eventDetail());
    const ui = await EventDetailPage({ params: Promise.resolve({ id: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(
      screen.getByText(/Nenhum detalhe operacional preenchido/)
    ).toBeInTheDocument();
  });

  it("evento sem cliente/venue/notes e org ausente: caminhos opcionais e teamMembers vazio", async () => {
    const e = eventDetail();
    e.clientName = null;
    e.venue = null;
    e.city = null;
    e.venueNotes = "Entrada pelos fundos";
    e.endDate = e.startDate; // sem intervalo de data
    e.speakers = [
      { id: "s-1", eventId: "ev-1", name: "João", role: null, organization: null, notes: null, position: 0 },
    ] as never;
    e.extras = [
      { id: "x-1", eventId: "ev-1", kind: "catering", description: "Coffee break", qty: 1, supplier: null, unitPriceCents: null, notes: null, position: 0 },
    ] as never;
    ev.getEventById.mockResolvedValueOnce(e);
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "admin",
      userId: "u1",
      primaryOrganization: null,
    });
    const ui = await EventDetailPage({ params: Promise.resolve({ id: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Entrada pelos fundos")).toBeInTheDocument();
    // clientName null → card de Cliente na visão geral não renderiza.
    expect(screen.queryByText("Cliente X")).not.toBeInTheDocument();
  });
});
