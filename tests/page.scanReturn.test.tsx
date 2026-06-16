// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((u: string) => {
    throw new Error("REDIRECT:" + u);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: vi.fn(),
}));

vi.mock("@/lib/events", async (o) => ({
  ...(await o<typeof import("@/lib/events")>()),
  getEventById: vi.fn(),
}));

vi.mock("@/lib/team", async (o) => ({
  ...(await o<typeof import("@/lib/team")>()),
  getTeamMemberByUserId: vi.fn(),
  teamMemberHasEventAccess: vi.fn(),
}));

vi.mock("@/app/(dashboard)/scan/return/[eventId]/ReturnScanClient", () => ({
  ReturnScanClient: () => null,
}));

import ScanReturnPage from "@/app/(dashboard)/scan/return/[eventId]/page";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getEventById } from "@/lib/events";
import { getTeamMemberByUserId, teamMemberHasEventAccess } from "@/lib/team";

const getCtx = vi.mocked(getCurrentUserContext);
const getEvent = vi.mocked(getEventById);
const getMember = vi.mocked(getTeamMemberByUserId);
const hasAccess = vi.mocked(teamMemberHasEventAccess);

const eventFixture = {
  id: "ev-1",
  name: "Show Sul",
  equipment: [
    { id: "ee1", equipmentName: "Mesa", variantLabel: null, loadedUnitsCount: 2, returnedUnitsCount: 0 },
    { id: "ee2", equipmentName: "Caixa", variantLabel: null, loadedUnitsCount: 0, returnedUnitsCount: 0 },
  ],
} as never;

describe("ScanReturnPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza o cabeçalho de retorno do evento (admin)", async () => {
    getEvent.mockResolvedValue(eventFixture);
    getCtx.mockResolvedValue({ role: "admin", userId: "u1", primaryOrganization: { id: "org-1" } } as never);

    const ui = await ScanReturnPage({ params: Promise.resolve({ eventId: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("heading", { name: /Retornar/ })).toHaveTextContent("Show Sul");
  });

  it("chama notFound quando o evento não existe", async () => {
    getEvent.mockResolvedValue(null as never);
    getCtx.mockResolvedValue({ role: "admin", userId: "u1" } as never);
    await expect(
      ScanReturnPage({ params: Promise.resolve({ eventId: "x" }) })
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("warehouse sem acesso à OS é redirecionado", async () => {
    getEvent.mockResolvedValue(eventFixture);
    getCtx.mockResolvedValue({ role: "warehouse", userId: "u1", primaryOrganization: { id: "org-1" } } as never);
    getMember.mockResolvedValue({ id: "m-1" } as never);
    hasAccess.mockResolvedValue(false);
    await expect(
      ScanReturnPage({ params: Promise.resolve({ eventId: "ev-1" }) })
    ).rejects.toThrow(/REDIRECT:\/events/);
  });
});
