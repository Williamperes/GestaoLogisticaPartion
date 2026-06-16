import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getEquipmentAvailability: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/inventory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/inventory")>();
  return { ...actual, getEquipmentAvailability: mocks.getEquipmentAvailability };
});

import {
  listEvents,
  getEventsWithInsufficientStock,
  getEventById,
  listMyScanEvents,
  isChecklistComplete,
  getGateProgress,
  formatEventStatus,
  type Event,
} from "@/lib/events";
import { availabilityKey } from "@/lib/inventory";

/** Thenable proxy resolving to `value`, recording calls; methods return self. */
function chain(value: unknown) {
  const calls: { method: string; args: unknown[] }[] = [];
  const obj: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(obj, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown) => resolve(value);
      }
      if (prop === "_calls") return calls;
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return proxy;
      };
    },
  });
  return proxy as Record<string, (...args: unknown[]) => unknown> & {
    _calls: { method: string; args: unknown[] }[];
  };
}

function fakeSupabase(routes: Record<string, Array<() => unknown>>) {
  const calls: Record<string, number> = {};
  return {
    from: vi.fn((table: string) => {
      const idx = calls[table] ?? 0;
      calls[table] = idx + 1;
      const builders = routes[table];
      if (!builders) throw new Error(`Unexpected table: ${table}`);
      const builder = builders[idx] ?? builders[builders.length - 1];
      return builder();
    }),
    _calls: () => calls,
  };
}

// ── Pure helpers ────────────────────────────────────────────────────

describe("isChecklistComplete", () => {
  it("false quando não há itens obrigatórios", () => {
    expect(isChecklistComplete([])).toBe(false);
    expect(isChecklistComplete([{ done: false, required: false }])).toBe(false);
  });

  it("trata required ausente como obrigatório", () => {
    expect(isChecklistComplete([{ done: true }])).toBe(true);
    expect(isChecklistComplete([{ done: false }])).toBe(false);
  });

  it("true só quando todos os obrigatórios estão feitos", () => {
    expect(
      isChecklistComplete([
        { done: true, required: true },
        { done: false, required: false },
      ])
    ).toBe(true);
  });
});

describe("getGateProgress", () => {
  it("0 quando não há obrigatórios", () => {
    expect(getGateProgress([])).toBe(0);
  });

  it("calcula percentual arredondado dos obrigatórios", () => {
    expect(
      getGateProgress([{ done: true }, { done: false }, { done: false }])
    ).toBe(33);
    expect(getGateProgress([{ done: true }, { done: true }])).toBe(100);
  });

  it("ignora itens não obrigatórios no denominador", () => {
    expect(
      getGateProgress([
        { done: true, required: true },
        { done: false, required: false },
      ])
    ).toBe(100);
  });
});

describe("formatEventStatus", () => {
  it("traduz cada status", () => {
    expect(formatEventStatus("planning")).toBe("Planejamento");
    expect(formatEventStatus("ready_to_load")).toBe("Pronto para Carga");
    expect(formatEventStatus("in_field")).toBe("Em Campo");
    expect(formatEventStatus("completed")).toBe("Concluído");
    expect(formatEventStatus("cancelled")).toBe("Cancelado");
  });
});

// ── listEvents ──────────────────────────────────────────────────────

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    organization_id: "org-1",
    client_organization_id: "cli-1",
    name: "Show",
    venue: "Arena",
    city: "SP",
    venue_notes: null,
    start_date: "2026-02-01",
    end_date: "2026-02-02",
    status: "planning",
    created_at: "2026-01-01",
    vehicle: null,
    lighting_color: null,
    assembly_at: null,
    teardown_at: null,
    agency_name: null,
    notes: null,
    executive_present: false,
    is_recorded: false,
    is_livestreamed: false,
    client_demanding: false,
    agency_detailed: false,
    previous_day_assembly: false,
    requires_advance_credential: false,
    strict_venue_hours: false,
    organizations: { name: "Cliente X" },
    event_checklist_items: [
      { id: "c1", done: true, required: true },
      { id: "c2", done: false, required: true },
      { id: "c3", done: false, required: false },
    ],
    event_equipment: [
      { id: "ee1", equipment_id: "eq-1", variant_id: null, qty: 2 },
      { id: "ee2", equipment_id: "eq-2", variant_id: "v-1", qty: 1 },
    ],
    event_dates: [{ date: "2026-02-01" }, { date: "2026-02-02" }],
    ...overrides,
  };
}

describe("listEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mapeia linha + agrega checklist obrigatório e equipamentos", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ events: [() => chain({ data: [eventRow()], error: null })] })
    );

    const [ev] = await listEvents("org-1");
    expect(ev).toMatchObject({
      id: "ev-1",
      clientName: "Cliente X",
      checklistTotal: 2, // só os required
      checklistDone: 1,
      equipmentCount: 2,
      dates: ["2026-02-01", "2026-02-02"],
    });
    expect(ev.equipmentBrief).toEqual([
      { equipmentId: "eq-1", variantId: null, qty: 2 },
      { equipmentId: "eq-2", variantId: "v-1", qty: 1 },
    ]);
  });

  it("aplica busca via .or quando há termo", async () => {
    const q = chain({ data: [], error: null });
    mocks.createSupabaseAdminClient.mockReturnValue(fakeSupabase({ events: [() => q] }));

    await listEvents("org-1", "  arena ");
    const orCall = q._calls.find((c) => c.method === "or");
    expect(orCall?.args[0]).toContain("arena");
  });

  it("retorna [] cedo quando restrictTeamMemberId não tem escala", async () => {
    const supa = fakeSupabase({
      event_date_team_members: [() => chain({ data: [], error: null })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supa);

    const result = await listEvents("org-1", undefined, { restrictTeamMemberId: "m-1" });
    expect(result).toEqual([]);
    // Nunca chega a consultar events.
    expect(supa._calls().events ?? 0).toBe(0);
  });

  it("restringe a IDs permitidos via .in quando há escala", async () => {
    const eventsQuery = chain({ data: [], error: null });
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_date_team_members: [
          () => chain({ data: [{ event_dates: { event_id: "ev-9" } }], error: null }),
        ],
        events: [() => eventsQuery],
      })
    );

    await listEvents("org-1", undefined, { restrictTeamMemberId: "m-1" });
    const inCall = eventsQuery._calls.find((c) => c.method === "in");
    expect(inCall?.args).toEqual(["id", ["ev-9"]]);
  });

  it("propaga erro do banco", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ events: [() => chain({ data: null, error: new Error("db") })] })
    );
    await expect(listEvents("org-1")).rejects.toThrow("db");
  });
});

// ── getEventsWithInsufficientStock ──────────────────────────────────

function buildEvent(over: Partial<Event>): Event {
  return {
    id: "ev-1",
    organizationId: "org-1",
    status: "planning",
    dates: ["2026-02-01"],
    equipmentBrief: [{ equipmentId: "eq-1", variantId: null, qty: 5 }],
    ...over,
  } as Event;
}

describe("getEventsWithInsufficientStock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marca a OS quando a qty pedida excede o disponível", async () => {
    mocks.getEquipmentAvailability.mockResolvedValue(
      new Map([[availabilityKey("eq-1", null), { available: 3 }]])
    );
    const result = await getEventsWithInsufficientStock("org-1", [buildEvent({})]);
    expect(result.has("ev-1")).toBe(true);
  });

  it("não marca quando há estoque suficiente", async () => {
    mocks.getEquipmentAvailability.mockResolvedValue(
      new Map([[availabilityKey("eq-1", null), { available: 10 }]])
    );
    const result = await getEventsWithInsufficientStock("org-1", [buildEvent({})]);
    expect(result.has("ev-1")).toBe(false);
  });

  it("ignora OS concluídas/canceladas (não ocupam estoque)", async () => {
    const result = await getEventsWithInsufficientStock("org-1", [
      buildEvent({ status: "completed" }),
      buildEvent({ status: "cancelled", id: "ev-2" }),
    ]);
    expect(result.size).toBe(0);
    expect(mocks.getEquipmentAvailability).not.toHaveBeenCalled();
  });

  it("pula OS sem datas reais", async () => {
    const result = await getEventsWithInsufficientStock("org-1", [
      buildEvent({ dates: [] }),
    ]);
    expect(result.size).toBe(0);
    expect(mocks.getEquipmentAvailability).not.toHaveBeenCalled();
  });

  it("marca quando o equipamento nem aparece no mapa de disponibilidade", async () => {
    mocks.getEquipmentAvailability.mockResolvedValue(new Map());
    const result = await getEventsWithInsufficientStock("org-1", [buildEvent({})]);
    expect(result.has("ev-1")).toBe(true);
  });
});

// ── getEventById ────────────────────────────────────────────────────

describe("getEventById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna null quando não há evento", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ events: [() => chain({ data: null, error: null })] })
    );
    expect(await getEventById("ev-x")).toBeNull();
  });

  it("propaga erro do banco", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ events: [() => chain({ data: null, error: new Error("db") })] })
    );
    await expect(getEventById("ev-1")).rejects.toThrow("db");
  });

  it("ordena checklist/speakers/extras por position e agrega contagens de unidades", async () => {
    const data = {
      id: "ev-1",
      organization_id: "org-1",
      client_organization_id: "cli-1",
      name: "Show",
      venue: "Arena",
      city: "SP",
      venue_notes: null,
      start_date: "2026-02-01",
      end_date: "2026-02-02",
      status: "in_field",
      created_at: "2026-01-01",
      vehicle: null,
      lighting_color: null,
      assembly_at: null,
      teardown_at: null,
      agency_name: null,
      notes: null,
      executive_present: false,
      is_recorded: false,
      is_livestreamed: false,
      client_demanding: false,
      agency_detailed: false,
      previous_day_assembly: false,
      requires_advance_credential: false,
      strict_venue_hours: false,
      organizations: { name: "Cliente X" },
      event_checklist_items: [
        { id: "c2", event_id: "ev-1", label: "Segundo", position: 2, section: "operational", required: true, template_item_id: null, done: false, done_at: null, done_by: null },
        { id: "c1", event_id: "ev-1", label: "Primeiro", position: 1, section: "strategic", required: true, template_item_id: null, done: true, done_at: null, done_by: null },
      ],
      event_equipment: [
        {
          id: "ee1", event_id: "ev-1", equipment_id: "eq-1", unit_id: "u-1", variant_id: null, qty: 1,
          separated: true, separated_at: null, separated_by: null,
          loaded: true, loaded_at: null, loaded_by: null,
          returned_at: null, notes: null,
          equipment: { id: "eq-1", name: "Mesa" },
          equipment_units: { id: "u-1", serial: "S1", status: "in_field" },
          equipment_variants: null,
          event_equipment_units: [
            { id: "x1", loaded_at: "2026-02-01", returned_at: null },
            { id: "x2", loaded_at: "2026-02-01", returned_at: "2026-02-02" },
          ],
        },
      ],
      event_speakers: [
        { id: "s2", event_id: "ev-1", name: "Bravo", organization: null, needs_mic: false, needs_notebook: false, needs_adapter: false, needs_dedicated_tech: false, notes: null, position: 2 },
        { id: "s1", event_id: "ev-1", name: "Alfa", organization: null, needs_mic: true, needs_notebook: false, needs_adapter: false, needs_dedicated_tech: false, notes: null, position: 1 },
      ],
      event_extras: [
        { id: "x2", event_id: "ev-1", kind: "tv", description: "TV", qty: 1, supplier: null, unit_price_cents: null, notes: null, position: 2 },
        { id: "x1", event_id: "ev-1", kind: "generator", description: "Gerador", qty: 1, supplier: null, unit_price_cents: null, notes: null, position: 1 },
      ],
    };
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ events: [() => chain({ data, error: null })] })
    );

    const ev = await getEventById("ev-1");
    expect(ev?.checklist.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(ev?.speakers.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(ev?.extras.map((x) => x.id)).toEqual(["x1", "x2"]);
    expect(ev?.checklistDone).toBe(1);
    expect(ev?.equipment[0]).toMatchObject({
      equipmentName: "Mesa",
      unitSerial: "S1",
      unitStatus: "in_field",
      loadedUnitsCount: 2,
      returnedUnitsCount: 1,
    });
  });
});

// ── listMyScanEvents ────────────────────────────────────────────────

function scanEventRow(qty: number, units: { loaded_at: string | null; returned_at: string | null }[]) {
  return {
    id: "ev-1",
    name: "Show",
    venue: "Arena",
    city: "SP",
    start_date: "2026-02-01",
    end_date: "2026-02-02",
    organizations: { name: "Cliente X" },
    event_equipment: [{ qty, event_equipment_units: units }],
  };
}

function mockScanEvents(row: unknown) {
  mocks.createSupabaseAdminClient.mockReturnValue(
    fakeSupabase({
      event_date_team_members: [
        () => chain({ data: [{ event_dates: { event_id: "ev-1" } }], error: null }),
      ],
      events: [() => chain({ data: [row], error: null })],
    })
  );
}

describe("listMyScanEvents — máquina de estados", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna [] quando o técnico não tem escala", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ event_date_team_members: [() => chain({ data: [], error: null })] })
    );
    expect(await listMyScanEvents("m-1")).toEqual([]);
  });

  it("to_load quando nada foi carregado", async () => {
    mockScanEvents(scanEventRow(2, [{ loaded_at: null, returned_at: null }, { loaded_at: null, returned_at: null }]));
    const [ev] = await listMyScanEvents("m-1");
    expect(ev.state).toBe("to_load");
    expect(ev.totalQty).toBe(2);
    expect(ev.clientName).toBe("Cliente X");
  });

  it("loading quando carga parcial", async () => {
    mockScanEvents(scanEventRow(2, [{ loaded_at: "2026-02-01", returned_at: null }, { loaded_at: null, returned_at: null }]));
    const [ev] = await listMyScanEvents("m-1");
    expect(ev.state).toBe("loading");
    expect(ev.loadedCount).toBe(1);
  });

  it("to_return quando tudo carregado e nada retornado", async () => {
    mockScanEvents(scanEventRow(2, [{ loaded_at: "x", returned_at: null }, { loaded_at: "x", returned_at: null }]));
    const [ev] = await listMyScanEvents("m-1");
    expect(ev.state).toBe("to_return");
  });

  it("returning quando retorno parcial", async () => {
    mockScanEvents(scanEventRow(2, [{ loaded_at: "x", returned_at: "y" }, { loaded_at: "x", returned_at: null }]));
    const [ev] = await listMyScanEvents("m-1");
    expect(ev.state).toBe("returning");
  });

  it("done quando tudo retornado", async () => {
    mockScanEvents(scanEventRow(2, [{ loaded_at: "x", returned_at: "y" }, { loaded_at: "x", returned_at: "y" }]));
    const [ev] = await listMyScanEvents("m-1");
    expect(ev.state).toBe("done");
    expect(ev.returnedCount).toBe(2);
  });
});
