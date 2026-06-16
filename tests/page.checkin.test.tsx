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

vi.mock("@/app/(dashboard)/checkin/actions", () => ({
  returnCheckinItem: vi.fn(),
  finalizeCheckin: vi.fn(),
}));

import CheckinPage from "@/app/(dashboard)/checkin/page";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getEventById } from "@/lib/events";

const getCtx = vi.mocked(getCurrentUserContext);
const getEvent = vi.mocked(getEventById);

const inFieldEvent = {
  id: "ev-1",
  name: "Show Centro",
  clientName: "Cliente Y",
  status: "in_field",
  startDate: "2026-06-01",
  endDate: "2026-06-02",
  equipment: [
    { id: "ee1", equipmentName: "Mesa", variantLabel: null, qty: 1, loaded: true, unitId: "u-1", unitStatus: "in_field", unitSerial: "S1" },
    { id: "ee2", equipmentName: "Caixa", variantLabel: null, qty: 1, loaded: true, unitId: "u-2", unitStatus: "available", unitSerial: "S2" },
  ],
} as never;

describe("CheckinPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza o portal de retorno com progresso e itens", async () => {
    getEvent.mockResolvedValue(inFieldEvent);
    getCtx.mockResolvedValue({ role: "operations", userId: "u1" } as never);

    const ui = await CheckinPage({ searchParams: Promise.resolve({ eventId: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Show Centro")).toBeInTheDocument();
    expect(screen.getByText("Portal de Retorno")).toBeInTheDocument();
    expect(screen.getByText("Mesa")).toBeInTheDocument();
    expect(screen.getByText("Caixa")).toBeInTheDocument();
  });

  it("redireciona para /events quando não há eventId", async () => {
    getCtx.mockResolvedValue({ role: "admin", userId: "u1" } as never);
    getEvent.mockResolvedValue(inFieldEvent);
    await expect(
      CheckinPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/events/);
  });

  it("redireciona para o evento quando não está em campo", async () => {
    getEvent.mockResolvedValue({ ...inFieldEvent, status: "planning" } as never);
    getCtx.mockResolvedValue({ role: "admin", userId: "u1" } as never);
    await expect(
      CheckinPage({ searchParams: Promise.resolve({ eventId: "ev-1" }) })
    ).rejects.toThrow(/REDIRECT:\/events\/ev-1/);
  });
});
