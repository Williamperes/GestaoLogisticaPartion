// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────

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

vi.mock("@/lib/dashboard", async (orig) => ({
  ...(await orig<typeof import("@/lib/dashboard")>()),
  getDashboardKPIs: vi.fn(async () => ({
    eventsThisMonth: 3,
    eventsNextMonth: 2,
    itemsInMaintenance: 1,
    utilizationRate: 42,
    pendingReturns: 1,
  })),
  getCategoryStats: vi.fn(async () => []),
  getUtilizationHistory: vi.fn(async () => []),
}));

vi.mock("@/lib/events", async (orig) => ({
  ...(await orig<typeof import("@/lib/events")>()),
  listEvents: vi.fn(async () => [
    {
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
    },
  ]),
}));

// DashboardCharts é client (recharts) — stub para não quebrar no jsdom.
vi.mock("@/app/(dashboard)/dashboard/DashboardCharts", () => ({
  DashboardCharts: () => null,
}));

import DashboardPage from "@/app/(dashboard)/dashboard/page";

describe("DashboardPage (RSC)", () => {
  it("renderiza KPIs e eventos recentes para admin", async () => {
    const ui = await DashboardPage();
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Visão Geral")).toBeInTheDocument();
    expect(screen.getByText("Eventos Recentes")).toBeInTheDocument();
    expect(screen.getByText("Show Acústico")).toBeInTheDocument();
  });

  it("redireciona warehouse para /scan", async () => {
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "warehouse",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });
    await expect(DashboardPage()).rejects.toThrow(/REDIRECT:\/scan/);
  });

  it("redireciona employee para /events", async () => {
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "employee",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });
    await expect(DashboardPage()).rejects.toThrow(/REDIRECT:\/events/);
  });
});
