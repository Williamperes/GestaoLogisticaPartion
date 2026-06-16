// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

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
  getCurrentUserContext: vi.fn(async () => ({
    role: "admin" as string | null,
    userId: "u1",
    primaryOrganization: { id: "org-1" } as { id: string } | null,
  })),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: auth.getCurrentUserContext,
}));

function eventFixture() {
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
    status: "planning",
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
    checklistTotal: 2,
    checklistDone: 1,
  };
}

vi.mock("@/lib/events", async (orig) => ({
  ...(await orig<typeof import("@/lib/events")>()),
  listEvents: vi.fn(async () => [eventFixture()]),
  getEventsWithInsufficientStock: vi.fn(async () => new Set<string>()),
}));

vi.mock("@/lib/clients", async (orig) => ({
  ...(await orig<typeof import("@/lib/clients")>()),
  listClientOrganizations: vi.fn(async () => []),
}));

vi.mock("@/lib/checklist-templates", async (orig) => ({
  ...(await orig<typeof import("@/lib/checklist-templates")>()),
  listChecklistTemplates: vi.fn(async () => []),
}));

vi.mock("@/lib/team", async (orig) => ({
  ...(await orig<typeof import("@/lib/team")>()),
  getTeamMemberByUserId: vi.fn(async () => ({ id: "m-1" })),
}));

// EventSheet é client — stub.
vi.mock("@/app/(dashboard)/events/EventSheet", () => ({
  EventSheet: () => null,
}));

import EventsPage from "@/app/(dashboard)/events/page";

describe("EventsPage (RSC)", () => {
  it("renderiza tabela com o evento listado", async () => {
    const ui = await EventsPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("heading", { name: /Eventos/ })).toBeInTheDocument();
    expect(screen.getByText("Show Acústico")).toBeInTheDocument();
  });

  it("mostra vazio quando o filtro de status não casa nenhum evento", async () => {
    const ui = await EventsPage({
      searchParams: Promise.resolve({ status: "completed" }),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText(/Nenhuma OS cadastrada/)).toBeInTheDocument();
  });
});
