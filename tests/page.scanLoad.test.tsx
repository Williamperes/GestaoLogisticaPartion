// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

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

vi.mock("@/lib/extra-material", async (o) => ({
  ...(await o<typeof import("@/lib/extra-material")>()),
  listExtraMaterialCandidates: vi.fn(),
  listExtraMaterialLog: vi.fn(),
}));

const { loadScanClient } = vi.hoisted(() => ({
  loadScanClient: vi.fn((props: unknown) => {
    void props;
    return null;
  }),
}));

vi.mock("@/app/(dashboard)/scan/load/[eventId]/LoadScanClient", () => ({
  LoadScanClient: (props: unknown) => loadScanClient(props),
}));

import ScanLoadPage from "@/app/(dashboard)/scan/load/[eventId]/page";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getEventById } from "@/lib/events";
import {
  listExtraMaterialCandidates,
  listExtraMaterialLog,
} from "@/lib/extra-material";
import { getTeamMemberByUserId, teamMemberHasEventAccess } from "@/lib/team";

const getCtx = vi.mocked(getCurrentUserContext);
const getEvent = vi.mocked(getEventById);
const getMember = vi.mocked(getTeamMemberByUserId);
const hasAccess = vi.mocked(teamMemberHasEventAccess);
const listCandidates = vi.mocked(listExtraMaterialCandidates);
const listLog = vi.mocked(listExtraMaterialLog);

const eventFixture = {
  id: "ev-1",
  name: "Show Sul",
  equipment: [
    { id: "ee1", equipmentName: "Mesa", variantLabel: null, qty: 2, loadedUnitsCount: 0, returnedUnitsCount: 0 },
  ],
} as never;

describe("ScanLoadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCandidates.mockResolvedValue([]);
    listLog.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it("renderiza o cabeçalho de carga do evento (admin)", async () => {
    getEvent.mockResolvedValue(eventFixture);
    getCtx.mockResolvedValue({ role: "admin", userId: "u1", primaryOrganization: { id: "org-1" } } as never);

    const ui = await ScanLoadPage({ params: Promise.resolve({ eventId: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("heading", { name: /Carregar/ })).toHaveTextContent("Show Sul");
    expect(listCandidates).not.toHaveBeenCalled();
    expect(listLog).not.toHaveBeenCalled();
    expect(loadScanClient).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "admin",
        extraCandidates: [],
        initialExtraLog: [],
      })
    );
  });

  it("chama notFound quando o evento não existe", async () => {
    getEvent.mockResolvedValue(null as never);
    getCtx.mockResolvedValue({ role: "admin", userId: "u1" } as never);
    await expect(
      ScanLoadPage({ params: Promise.resolve({ eventId: "x" }) })
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("warehouse sem acesso à OS é redirecionado", async () => {
    getEvent.mockResolvedValue(eventFixture);
    getCtx.mockResolvedValue({ role: "warehouse", userId: "u1", primaryOrganization: { id: "org-1" } } as never);
    getMember.mockResolvedValue({ id: "m-1" } as never);
    hasAccess.mockResolvedValue(false);
    await expect(
      ScanLoadPage({ params: Promise.resolve({ eventId: "ev-1" }) })
    ).rejects.toThrow(/REDIRECT:\/events/);
    expect(listCandidates).not.toHaveBeenCalled();
    expect(listLog).not.toHaveBeenCalled();
  });

  it("warehouse com acesso consulta e propaga os dados extras da OS e organização atuais", async () => {
    getEvent.mockResolvedValue(eventFixture);
    getCtx.mockResolvedValue({ role: "warehouse", userId: "u1", primaryOrganization: { id: "org-1" } } as never);
    getMember.mockResolvedValue({ id: "m-1" } as never);
    hasAccess.mockResolvedValue(true);
    const candidates = [{ equipmentId: "eq-extra" }] as never;
    const log = [{ id: "log-1" }] as never;
    listCandidates.mockResolvedValue(candidates);
    listLog.mockResolvedValue(log);

    const ui = await ScanLoadPage({ params: Promise.resolve({ eventId: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("heading", { name: /Carregar/ })).toHaveTextContent("Show Sul");
    expect(listCandidates).toHaveBeenCalledTimes(1);
    expect(listCandidates).toHaveBeenCalledWith("ev-1", "org-1");
    expect(listLog).toHaveBeenCalledTimes(1);
    expect(listLog).toHaveBeenCalledWith("ev-1", "org-1");
    expect(loadScanClient).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "warehouse",
        extraCandidates: candidates,
        initialExtraLog: log,
      })
    );
  });
});
