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

vi.mock("@/app/(dashboard)/checkout/actions", () => ({
  confirmCheckoutItem: vi.fn(),
  finalizeCheckout: vi.fn(),
}));

import CheckoutPage from "@/app/(dashboard)/checkout/page";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getEventById } from "@/lib/events";

const getCtx = vi.mocked(getCurrentUserContext);
const getEvent = vi.mocked(getEventById);

const readyEvent = {
  id: "ev-1",
  name: "Show Leste",
  clientName: "Cliente Z",
  status: "ready_to_load",
  startDate: "2026-06-01",
  endDate: "2026-06-02",
  equipment: [
    { id: "ee1", equipmentName: "Mesa", variantLabel: null, qty: 1, loaded: true, unitSerial: "S1" },
    { id: "ee2", equipmentName: "Caixa", variantLabel: null, qty: 1, loaded: false, unitSerial: "S2" },
  ],
} as never;

describe("CheckoutPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza o portal de checkout com lista de conferência", async () => {
    getEvent.mockResolvedValue(readyEvent);
    getCtx.mockResolvedValue({ role: "operations", userId: "u1" } as never);

    const ui = await CheckoutPage({ searchParams: Promise.resolve({ eventId: "ev-1" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Show Leste")).toBeInTheDocument();
    expect(screen.getByText("Portal de Checkout")).toBeInTheDocument();
    expect(screen.getByText("1/2 itens confirmados")).toBeInTheDocument();
    expect(screen.getByText("Mesa")).toBeInTheDocument();
  });

  it("redireciona para /events quando não há eventId", async () => {
    getCtx.mockResolvedValue({ role: "admin", userId: "u1" } as never);
    getEvent.mockResolvedValue(readyEvent);
    await expect(
      CheckoutPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/events/);
  });

  it("redireciona para o evento quando concluído/cancelado", async () => {
    getEvent.mockResolvedValue({ ...readyEvent, status: "completed" } as never);
    getCtx.mockResolvedValue({ role: "admin", userId: "u1" } as never);
    await expect(
      CheckoutPage({ searchParams: Promise.resolve({ eventId: "ev-1" }) })
    ).rejects.toThrow(/REDIRECT:\/events\/ev-1/);
  });
});
