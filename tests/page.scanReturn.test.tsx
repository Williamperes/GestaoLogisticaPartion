// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  returnScanClient: vi.fn(() => null),
}));

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
  ReturnScanClient: mocks.returnScanClient,
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
  organizationId: "org-1",
  name: "Show Sul",
  status: "in_field",
  equipment: [
    { id: "ee1", equipmentName: "Mesa", variantLabel: null, equipmentType: "serialized", loadedUnitsCount: 2, returnedUnitsCount: 0 },
    { id: "ee2", equipmentName: "Caixa", variantLabel: null, equipmentType: "bulk", loadedUnitsCount: 0, returnedUnitsCount: 0 },
  ],
};

describe("ScanReturnPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza o cabeçalho de retorno do evento (admin)", async () => {
    getEvent.mockResolvedValue(eventFixture as never);
    getCtx.mockResolvedValue({ role: "admin", userId: "u1", primaryOrganization: { id: "org-1" } } as never);

    const ui = await ScanReturnPage({ params: Promise.resolve({ eventId: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("heading", { name: /Retornar/ })).toHaveTextContent("Show Sul");
    expect(mocks.returnScanClient).toHaveBeenCalledWith(
      expect.objectContaining({
        canReturnBulk: false,
        canReturnSerialized: true,
        canFinalizeReturn: true,
      }),
      undefined
    );
  });

  it("chama notFound quando o evento não existe", async () => {
    getEvent.mockResolvedValue(null as never);
    getCtx.mockResolvedValue({ role: "admin", userId: "u1" } as never);
    await expect(
      ScanReturnPage({ params: Promise.resolve({ eventId: "x" }) })
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("warehouse sem acesso à OS é redirecionado", async () => {
    getEvent.mockResolvedValue(eventFixture as never);
    getCtx.mockResolvedValue({ role: "warehouse", userId: "u1", primaryOrganization: { id: "org-1" } } as never);
    getMember.mockResolvedValue({ id: "m-1" } as never);
    hasAccess.mockResolvedValue(false);
    await expect(
      ScanReturnPage({ params: Promise.resolve({ eventId: "ev-1" }) })
    ).rejects.toThrow(/REDIRECT:\/events/);
  });

  it("warehouse vinculado recebe controles bulk e finalização", async () => {
    getEvent.mockResolvedValue(eventFixture as never);
    getCtx.mockResolvedValue({
      role: "warehouse",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    } as never);
    getMember.mockResolvedValue({ id: "m-1" } as never);
    hasAccess.mockResolvedValue(true);

    const ui = await ScanReturnPage({ params: Promise.resolve({ eventId: "ev-1" }) });
    const { render } = await import("@testing-library/react");
    render(ui);

    expect(mocks.returnScanClient).toHaveBeenCalledWith(
      expect.objectContaining({
        canReturnBulk: true,
        canReturnSerialized: true,
        canFinalizeReturn: true,
      }),
      undefined
    );
  });

  it("papel sem permissão recebe retorno somente leitura", async () => {
    getEvent.mockResolvedValue(eventFixture as never);
    getCtx.mockResolvedValue({
      role: "finance",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    } as never);

    const ui = await ScanReturnPage({ params: Promise.resolve({ eventId: "ev-1" }) });
    const { render } = await import("@testing-library/react");
    render(ui);

    expect(mocks.returnScanClient).toHaveBeenCalledWith(
      expect.objectContaining({
        canReturnBulk: false,
        canReturnSerialized: false,
        canFinalizeReturn: false,
      }),
      undefined
    );
  });

  it("propaga o tipo e os contadores agregados de lote para o client", async () => {
    getEvent.mockResolvedValue({
      ...eventFixture,
      equipment: [
        {
          id: "ee-bulk",
          equipmentName: "Cabo XLR",
          variantLabel: null,
          equipmentType: "bulk",
          loadedUnitsCount: 5,
          returnedUnitsCount: 2,
        },
      ],
    } as never);
    getCtx.mockResolvedValue({
      role: "admin",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    } as never);

    const ui = await ScanReturnPage({ params: Promise.resolve({ eventId: "ev-1" }) });
    const { render } = await import("@testing-library/react");
    render(ui);

    expect(mocks.returnScanClient).toHaveBeenCalledWith(
      expect.objectContaining({
        initialItems: [
          {
            id: "ee-bulk",
            equipmentName: "Cabo XLR",
            variantLabel: null,
            equipmentType: "bulk",
            loadedUnitsCount: 5,
            returnedUnitsCount: 2,
          },
        ],
      }),
      undefined
    );
  });
});
