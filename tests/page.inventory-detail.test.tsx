// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { createElement } from "react";

afterEach(() => cleanup());

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

const inv = vi.hoisted(() => ({
  getEquipmentById: vi.fn(),
}));

const maintenance = vi.hoisted(() => ({
  listResolvedMaintenanceHistory: vi.fn(async () => []),
}));

function equipmentWithUnits() {
  return {
    id: "eq-1",
    organizationId: "org-1",
    categoryId: "cat-1",
    categoryName: "Áudio",
    parentCategoryId: null,
    parentCategoryName: null,
    name: "Mesa de Som X32",
    brand: "Behringer",
    model: "X32",
    type: "serialized" as const,
    status: "available" as const,
    hasVariants: false,
    serial: "SN-001",
    patrimony: "PAT-1",
    purchaseDate: null,
    purchaseValueCents: null,
    qrCode: null,
    notes: null,
    createdAt: "2026-01-01",
    units: [
      {
        id: "u-1",
        equipmentId: "eq-1",
        variantId: null,
        serial: "SN-001",
        patrimony: "PAT-1",
        status: "available" as const,
        qrCode: null,
        qrLinkedAt: null,
        notes: null,
        createdAt: "2026-01-01",
      },
    ],
  };
}

vi.mock("@/lib/inventory", async (orig) => ({
  ...(await orig<typeof import("@/lib/inventory")>()),
  getEquipmentById: inv.getEquipmentById,
  getEquipmentAllocations: vi.fn(async () => []),
  listEquipmentCategories: vi.fn(async () => []),
}));

vi.mock("@/lib/maintenance", async (orig) => ({
  ...(await orig<typeof import("@/lib/maintenance")>()),
  listResolvedMaintenanceHistory: maintenance.listResolvedMaintenanceHistory,
}));

// Client children — stubs rendered as tiny markers so permission-gated
// branches that mount them still execute the page's surrounding markup.
function marker(text: string) {
  function Marker() {
    return createElement("div", null, text);
  }
  Marker.displayName = `Marker(${text})`;
  return Marker;
}
vi.mock("@/components/inventory/QrCodeDisplay", () => ({ QrCodeDisplay: marker("QR_DISPLAY") }));
vi.mock("@/components/inventory/LinkQrButton", () => ({ LinkQrButton: marker("LINK_QR") }));
vi.mock("@/app/(dashboard)/inventory/[id]/EditEquipmentSheet", () => ({
  EditEquipmentSheet: marker("EDIT_EQUIPMENT"),
}));
vi.mock("@/app/(dashboard)/inventory/[id]/AddUnitSheet", () => ({ AddUnitSheet: marker("ADD_UNIT") }));
vi.mock("@/app/(dashboard)/inventory/[id]/UnitStatusForm", () => ({ UnitStatusForm: marker("UNIT_STATUS") }));
vi.mock("@/app/(dashboard)/inventory/[id]/VariantManager", () => ({ VariantManager: marker("VARIANT_MANAGER") }));
vi.mock("@/app/(dashboard)/inventory/[id]/BulkAdjustDialog", () => ({ BulkAdjustDialog: marker("BULK_ADJUST") }));
vi.mock("@/components/ui/delete-confirm-dialog", () => ({ DeleteConfirmDialog: () => null }));

import InventoryDetailPage from "@/app/(dashboard)/inventory/[id]/page";

describe("InventoryDetailPage (RSC)", () => {
  it("renderiza detalhes do equipamento e tabela de unidades", async () => {
    inv.getEquipmentById.mockResolvedValueOnce(equipmentWithUnits());
    const ui = await InventoryDetailPage({
      params: Promise.resolve({ id: "eq-1" }),
      searchParams: Promise.resolve({}),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByRole("heading", { name: "Mesa de Som X32" })).toBeInTheDocument();
    expect(screen.getByText("Behringer")).toBeInTheDocument();
    expect(screen.getByText(/Unidades \(1\)/)).toBeInTheDocument();
  });

  it("redireciona para /inventory quando o equipamento não existe", async () => {
    inv.getEquipmentById.mockResolvedValueOnce(null);
    await expect(
      InventoryDetailPage({
        params: Promise.resolve({ id: "nope" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/REDIRECT:\/inventory/);
  });

  it("toasts de sucesso e erro a partir dos searchParams", async () => {
    inv.getEquipmentById.mockResolvedValueOnce(equipmentWithUnits());
    const ui = await InventoryDetailPage({
      params: Promise.resolve({ id: "eq-1" }),
      searchParams: Promise.resolve({
        success: encodeURIComponent("Unidade criada"),
        error: encodeURIComponent("Algo falhou"),
      }),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Unidade criada")).toBeInTheDocument();
    expect(screen.getByText("Algo falhou")).toBeInTheDocument();
  });

  it("equipamento serializado com variantes, QR e unidades (admin)", async () => {
    const eq = equipmentWithUnits();
    eq.hasVariants = true;
    eq.brand = null;
    eq.model = null;
    eq.purchaseDate = "2026-01-15";
    eq.purchaseValueCents = 150000;
    eq.qrCode = "QR-TOKEN-EQ";
    eq.notes = "Frágil";
    (eq as Record<string, unknown>).variants = [
      { id: "v-1", equipmentId: "eq-1", label: "Preta", sortValue: null, position: 0, notes: null },
    ];
    eq.units = [
      {
        id: "u-1",
        equipmentId: "eq-1",
        variantId: "v-1",
        serial: "SN-001",
        patrimony: "PAT-1",
        status: "available",
        qrCode: "QR-UNIT-1",
        qrLinkedAt: "2026-02-01",
        notes: null,
        createdAt: "2026-01-01",
      },
      {
        id: "u-2",
        equipmentId: "eq-1",
        variantId: null,
        serial: null,
        patrimony: null,
        status: "maintenance",
        qrCode: null,
        qrLinkedAt: null,
        notes: null,
        createdAt: "2026-01-01",
      },
    ];
    inv.getEquipmentById.mockResolvedValueOnce(eq);
    const inventory = await import("@/lib/inventory");
    vi.mocked(inventory.listEquipmentCategories).mockResolvedValueOnce([] as never);
    const ui = await InventoryDetailPage({
      params: Promise.resolve({ id: "eq-1" }),
      searchParams: Promise.resolve({}),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("VARIANT_MANAGER")).toBeInTheDocument();
    expect(screen.getByText("ADD_UNIT")).toBeInTheDocument();
    expect(screen.getByText("Preta")).toBeInTheDocument(); // variant label da unidade
    expect(screen.getByText("QR-TOKEN-EQ")).toBeInTheDocument(); // QR token do equipamento
    expect(screen.getByText("Frágil")).toBeInTheDocument();
    expect(screen.getAllByText("QR_DISPLAY").length).toBeGreaterThan(0); // unit com QR
    expect(screen.getAllByText("LINK_QR").length).toBeGreaterThan(0); // botão vincular QR
    expect(screen.getAllByText("UNIT_STATUS").length).toBeGreaterThan(0);
  });

  it("bulk sem variantes com estoque cadastrado", async () => {
    const eq = equipmentWithUnits() as Record<string, unknown>;
    eq.type = "bulk";
    eq.hasVariants = false;
    eq.units = [];
    eq.bulk = {
      id: "b-1",
      equipmentId: "eq-1",
      variantId: null,
      unit: "metros",
      totalQty: 100,
      availableQty: 80,
    };
    inv.getEquipmentById.mockResolvedValueOnce(eq);
    const ui = await InventoryDetailPage({
      params: Promise.resolve({ id: "eq-1" }),
      searchParams: Promise.resolve({}),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Estoque do lote")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("BULK_ADJUST")).toBeInTheDocument();
    // serialized table não renderiza para bulk.
    expect(screen.queryByText(/Unidades \(/)).not.toBeInTheDocument();
  });

  it("bulk sem variantes e sem estoque: aviso", async () => {
    const eq = equipmentWithUnits() as Record<string, unknown>;
    eq.type = "bulk";
    eq.hasVariants = false;
    eq.units = [];
    eq.bulk = undefined;
    inv.getEquipmentById.mockResolvedValueOnce(eq);
    const ui = await InventoryDetailPage({
      params: Promise.resolve({ id: "eq-1" }),
      searchParams: Promise.resolve({}),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(
      screen.getByText("Este lote ainda não tem estoque cadastrado.")
    ).toBeInTheDocument();
  });

  it("alocações por OS populadas (com e sem variante/intervalo)", async () => {
    inv.getEquipmentById.mockResolvedValueOnce(equipmentWithUnits());
    const inventory = await import("@/lib/inventory");
    vi.mocked(inventory.getEquipmentAllocations).mockResolvedValueOnce([
      {
        eventId: "ev-1",
        eventName: "Festival A",
        eventStatus: "in_field",
        startDate: "2026-03-01",
        endDate: "2026-03-03",
        variantId: "v-1",
        variantLabel: "Grande",
        qty: 4,
      },
      {
        eventId: "ev-2",
        eventName: "Show B",
        eventStatus: "ready_to_load",
        startDate: "2026-04-01",
        endDate: "2026-04-01",
        variantId: null,
        variantLabel: null,
        qty: 2,
      },
    ] as never);
    const ui = await InventoryDetailPage({
      params: Promise.resolve({ id: "eq-1" }),
      searchParams: Promise.resolve({}),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText(/Em uso por OS \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("Festival A")).toBeInTheDocument();
    expect(screen.getByText("Show B")).toBeInTheDocument();
    expect(screen.getByText("Grande")).toBeInTheDocument();
  });

  it("viewer (sem permissões): leitura sem botões de edição", async () => {
    const eq = equipmentWithUnits();
    eq.units = [
      {
        id: "u-1",
        equipmentId: "eq-1",
        variantId: null,
        serial: "SN-001",
        patrimony: "PAT-1",
        status: "available",
        qrCode: "QR-UNIT-1",
        qrLinkedAt: null,
        notes: null,
        createdAt: "2026-01-01",
      },
      {
        id: "u-2",
        equipmentId: "eq-1",
        variantId: null,
        serial: "SN-002",
        patrimony: null,
        status: "available",
        qrCode: null,
        qrLinkedAt: null,
        notes: null,
        createdAt: "2026-01-01",
      },
    ];
    inv.getEquipmentById.mockResolvedValueOnce(eq);
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "viewer",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });
    const ui = await InventoryDetailPage({
      params: Promise.resolve({ id: "eq-1" }),
      searchParams: Promise.resolve({}),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    // viewer não vê EditEquipmentSheet, AddUnit, LinkQr, UnitStatusForm.
    expect(screen.queryByText("EDIT_EQUIPMENT")).not.toBeInTheDocument();
    expect(screen.queryByText("ADD_UNIT")).not.toBeInTheDocument();
    expect(screen.queryByText("LINK_QR")).not.toBeInTheDocument();
    expect(screen.queryByText("UNIT_STATUS")).not.toBeInTheDocument();
    // unidade sem QR → texto "Sem QR" (caminho de leitura).
    expect(screen.getByText("Sem QR")).toBeInTheDocument();
    // unidade com QR exibe QrCodeDisplay sem botão de link.
    expect(screen.getByText("QR_DISPLAY")).toBeInTheDocument();
  });

  it("admin ve o ultimo retorno e todo o historico de manutencao", async () => {
    inv.getEquipmentById.mockResolvedValueOnce(equipmentWithUnits());
    maintenance.listResolvedMaintenanceHistory.mockResolvedValueOnce([
      {
        id: "m-2",
        organizationId: "org-1",
        equipmentId: "eq-1",
        equipmentName: "Mesa de Som X32",
        equipmentUnitId: "u-1",
        unitSerial: "SN-001",
        eventId: "event-2",
        eventName: "Evento B",
        condition: "damaged",
        note: "Troca de cabo",
        status: "resolved",
        resolvedAt: "2026-08-17T15:30:00.000Z",
        createdAt: "2026-08-16T10:00:00.000Z",
      },
      {
        id: "m-1",
        organizationId: "org-1",
        equipmentId: "eq-1",
        equipmentName: "Mesa de Som X32",
        equipmentUnitId: "u-1",
        unitSerial: "SN-001",
        eventId: "event-1",
        eventName: "Evento A",
        condition: "damaged",
        note: null,
        status: "resolved",
        resolvedAt: "2026-07-10T12:00:00.000Z",
        createdAt: "2026-07-09T09:00:00.000Z",
      },
    ]);

    const ui = await InventoryDetailPage({
      params: Promise.resolve({ id: "eq-1" }),
      searchParams: Promise.resolve({}),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);

    expect(screen.getByText("Último retorno da manutenção")).toBeInTheDocument();
    expect(screen.getByText("17/08/2026 às 12:30")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Histórico de manutenção (2)" })).toBeInTheDocument();
    expect(screen.getByText("Evento B")).toBeInTheDocument();
    expect(screen.getByText("Evento A")).toBeInTheDocument();
    expect(screen.getByText("Troca de cabo")).toBeInTheDocument();
  });

  it("operations nao consulta nem ve o historico de manutencao", async () => {
    inv.getEquipmentById.mockResolvedValueOnce(equipmentWithUnits());
    auth.getCurrentUserContext.mockResolvedValueOnce({
      role: "operations",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    });

    const ui = await InventoryDetailPage({
      params: Promise.resolve({ id: "eq-1" }),
      searchParams: Promise.resolve({}),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);

    expect(screen.queryByText("Último retorno da manutenção")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Histórico de manutenção/ })).not.toBeInTheDocument();
  });
});
