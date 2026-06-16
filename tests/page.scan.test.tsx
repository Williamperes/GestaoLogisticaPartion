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

vi.mock("@/lib/team", async (o) => ({
  ...(await o<typeof import("@/lib/team")>()),
  getTeamMemberByUserId: vi.fn(),
}));

vi.mock("@/lib/events", async (o) => ({
  ...(await o<typeof import("@/lib/events")>()),
  listMyScanEvents: vi.fn(async () => []),
}));

import ScanHubPage from "@/app/(dashboard)/scan/page";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getTeamMemberByUserId } from "@/lib/team";
import { listMyScanEvents } from "@/lib/events";

const getCtx = vi.mocked(getCurrentUserContext);
const getMember = vi.mocked(getTeamMemberByUserId);
const listScan = vi.mocked(listMyScanEvents);

const opCtx = {
  role: "operations",
  userId: "u1",
  profile: { fullName: "Bruno Técnico" },
  primaryOrganization: { id: "org-1" },
} as never;

describe("ScanHubPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza estado sem OS quando o técnico não tem eventos", async () => {
    getCtx.mockResolvedValue(opCtx);
    getMember.mockResolvedValue({ id: "m-1" } as never);
    listScan.mockResolvedValue([]);

    const ui = await ScanHubPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Olá, Bruno Técnico")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma OS atribuída a você no momento.")).toBeInTheDocument();
  });

  it("renderiza cards de OS agrupados por estado", async () => {
    getCtx.mockResolvedValue(opCtx);
    getMember.mockResolvedValue({ id: "m-1" } as never);
    listScan.mockResolvedValue([
      {
        id: "ev-1",
        name: "Festival Norte",
        clientName: "Cliente X",
        venue: "Arena",
        city: "SP",
        startDate: "2030-01-01",
        endDate: "2030-01-02",
        state: "to_load",
        totalQty: 4,
        loadedCount: 0,
        returnedCount: 0,
      },
    ] as never);

    const ui = await ScanHubPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Festival Norte")).toBeInTheDocument();
    expect(screen.getByText("Aguardando carga")).toBeInTheDocument();
    expect(screen.getByText("Próximos")).toBeInTheDocument();
  });

  it("renderiza aviso quando o usuário não tem ficha de técnico", async () => {
    getCtx.mockResolvedValue(opCtx);
    getMember.mockResolvedValue(null as never);

    const ui = await ScanHubPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(
      screen.getByText(/não está vinculado a uma ficha de técnico/)
    ).toBeInTheDocument();
  });

  it("redireciona para /login quando não há contexto", async () => {
    getCtx.mockResolvedValue(null);
    await expect(
      ScanHubPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/login/);
  });

  it("redireciona para /dashboard quando o papel não pode bipar", async () => {
    getCtx.mockResolvedValue({ role: "client", userId: "u1", primaryOrganization: { id: "org-1" } } as never);
    await expect(
      ScanHubPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/dashboard/);
  });

  it("redireciona para /dashboard quando não há organização primária", async () => {
    getCtx.mockResolvedValue({
      role: "operations",
      userId: "u1",
      primaryOrganization: null,
    } as never);
    await expect(
      ScanHubPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/dashboard/);
  });

  it("agrupa todos os estados e renderiza os CTAs/links de cada um", async () => {
    getCtx.mockResolvedValue(opCtx);
    getMember.mockResolvedValue({ id: "m-1" } as never);

    // Datas relativas a "hoje" para exercitar as branches de groupByPeriod.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const todayISO = iso(today);
    const future = new Date(today);
    future.setDate(future.getDate() + 30);
    const past = new Date(today);
    past.setDate(past.getDate() - 30);

    listScan.mockResolvedValue([
      // done -> grupo "Concluídos", href /events/:id (linha 53), branch 70
      {
        id: "ev-done",
        name: "OS Concluída",
        clientName: null,
        venue: null,
        city: null,
        startDate: iso(past),
        endDate: iso(past),
        state: "done",
        totalQty: 2,
        loadedCount: 2,
        returnedCount: 2,
      },
      // to_return -> "Aguardando retorno", href /scan/return (linha 39), branch 72
      {
        id: "ev-ret",
        name: "OS Retorno",
        clientName: "C",
        venue: "V",
        city: "RJ",
        startDate: todayISO,
        endDate: todayISO,
        state: "to_return",
        totalQty: 3,
        loadedCount: 3,
        returnedCount: 1,
      },
      // returning -> mesmo grupo, href /scan/return (linha 46)
      {
        id: "ev-ing",
        name: "OS Retornando",
        clientName: "C",
        venue: "V",
        city: "RJ",
        startDate: todayISO,
        endDate: todayISO,
        state: "returning",
        totalQty: 3,
        loadedCount: 3,
        returnedCount: 2,
      },
      // loading hoje -> grupo "Hoje" (branch 74), href /scan/load (linha 32)
      {
        id: "ev-load",
        name: "OS Hoje",
        clientName: "C",
        venue: "V",
        city: "SP",
        startDate: todayISO,
        endDate: todayISO,
        state: "loading",
        totalQty: 5,
        loadedCount: 2,
        returnedCount: 0,
      },
      // to_load no passado mas não done/return -> fallback "Aguardando retorno" (branch 79)
      {
        id: "ev-past",
        name: "OS Passada",
        clientName: "C",
        venue: "V",
        city: "SP",
        startDate: iso(past),
        endDate: iso(past),
        state: "to_load",
        totalQty: 1,
        loadedCount: 0,
        returnedCount: 0,
      },
    ] as never);

    const ui = await ScanHubPage({ searchParams: Promise.resolve({ error: "Algo falhou" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);

    expect(screen.getByText("Concluído")).toBeInTheDocument();
    expect(screen.getByText("Ver detalhes")).toBeInTheDocument();
    expect(screen.getByText("Continuar retornando")).toBeInTheDocument();
    expect(screen.getByText("Retornar")).toBeInTheDocument();
    expect(screen.getByText("Continuar carregando")).toBeInTheDocument();
    expect(screen.getByText("Hoje")).toBeInTheDocument();
    expect(screen.getByText("Concluídos")).toBeInTheDocument();

    // O banner de erro vindo de searchParams é exibido.
    expect(screen.getByText("Algo falhou")).toBeInTheDocument();

    // href do card "done" aponta para /events/:id (linha 53).
    expect(
      screen.getByText("OS Concluída").closest("a")
    ).toHaveAttribute("href", "/events/ev-done");
    // href do card de retorno aponta para /scan/return/:id (linha 39).
    expect(
      screen.getByText("OS Retorno").closest("a")
    ).toHaveAttribute("href", "/scan/return/ev-ret");
    // href do card "loading" aponta para /scan/load/:id (linha 32).
    expect(
      screen.getByText("OS Hoje").closest("a")
    ).toHaveAttribute("href", "/scan/load/ev-load");
  });
});
