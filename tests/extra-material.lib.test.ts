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
  listExtraMaterialCandidates,
  listExtraMaterialLog,
} from "@/lib/extra-material";
import { availabilityKey } from "@/lib/inventory";

function chain(value: unknown) {
  const calls: { method: string; args: unknown[] }[] = [];
  const proxy: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (resolved: unknown) => unknown) => resolve(value);
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
      const index = calls[table] ?? 0;
      calls[table] = index + 1;
      const builders = routes[table];
      if (!builders) throw new Error(`Unexpected table: ${table}`);
      return (builders[index] ?? builders[builders.length - 1])();
    }),
    _calls: () => calls,
  };
}

describe("listExtraMaterialCandidates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mapeia estoque serializado e bulk e exclui disponibilidade zero", async () => {
    const eventQuery = chain({
      data: { event_dates: [{ date: "2026-08-20" }, { date: "2026-08-22" }] },
      error: null,
    });
    const equipmentQuery = chain({
      data: [
        {
          id: "eq-serial", name: "Microfone", type: "serialized", has_variants: false,
          equipment_variants: [], bulk_inventory: [],
        },
        {
          id: "eq-bulk", name: "Cabo XLR", type: "bulk", has_variants: true,
          equipment_variants: [{ id: "var-10m", label: "10 metros" }],
          bulk_inventory: [{ variant_id: "var-10m", total_qty: 12, unit: "cabos" }],
        },
        {
          id: "eq-zero", name: "Sem estoque", type: "bulk", has_variants: false,
          equipment_variants: [],
          bulk_inventory: [{ variant_id: null, total_qty: 3, unit: "unidades" }],
        },
      ],
      error: null,
    });
    mocks.createSupabaseAdminClient.mockReturnValue(fakeSupabase({
      events: [() => eventQuery],
      equipment: [() => equipmentQuery],
    }));
    mocks.getEquipmentAvailability.mockResolvedValue(new Map([
      [availabilityKey("eq-serial", null), { total: 3, allocated: 1, available: 2 }],
      [availabilityKey("eq-bulk", "var-10m"), { total: 12, allocated: 8, available: 4 }],
      [availabilityKey("eq-zero", null), { total: 3, allocated: 3, available: 0 }],
    ]));

    const result = await listExtraMaterialCandidates("event-1", "org-1");

    expect(mocks.getEquipmentAvailability).toHaveBeenCalledWith(
      "org-1",
      ["2026-08-20", "2026-08-22"]
    );
    expect(result).toEqual([
      {
        equipmentId: "eq-serial", equipmentName: "Microfone",
        equipmentType: "serialized", variantId: null, variantLabel: null,
        availableQty: 2, unit: "unidades",
      },
      {
        equipmentId: "eq-bulk", equipmentName: "Cabo XLR",
        equipmentType: "bulk", variantId: "var-10m", variantLabel: "10 metros",
        availableQty: 4, unit: "cabos",
      },
    ]);
    expect(eventQuery._calls).toEqual(expect.arrayContaining([
      { method: "eq", args: ["id", "event-1"] },
      { method: "eq", args: ["organization_id", "org-1"] },
      { method: "in", args: ["status", ["ready_to_load", "in_field"]] },
    ]));
    expect(equipmentQuery._calls).toContainEqual({
      method: "eq",
      args: ["organization_id", "org-1"],
    });
  });
});

describe("listExtraMaterialLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isola pela organização, ordena do mais novo e mapeia o perfil", async () => {
    const logQuery = chain({
      data: [
        {
          id: "log-new", event_equipment_id: "ee-1", equipment_id: "eq-1",
          variant_id: "var-1", equipment_unit_id: null, qty: 2,
          reason: "Complemento", added_by: "user-1", created_at: "2026-08-20T20:00:00.000Z",
          equipment: { name: "Cabo XLR" }, equipment_variants: { label: "10 metros" },
          events: { organization_id: "org-1" },
        },
        {
          id: "log-old", event_equipment_id: "ee-2", equipment_id: "eq-2",
          variant_id: null, equipment_unit_id: "unit-1", qty: 1,
          reason: "Reserva", added_by: null, created_at: "2026-08-20T18:00:00.000Z",
          equipment: { name: "Microfone" }, equipment_variants: null,
          events: { organization_id: "org-1" },
        },
      ],
      error: null,
    });
    const profilesQuery = chain({
      data: [{ id: "user-1", full_name: "Pessoa do Almoxarifado" }],
      error: null,
    });
    mocks.createSupabaseAdminClient.mockReturnValue(fakeSupabase({
      event_equipment_extra_log: [() => logQuery],
      profiles: [() => profilesQuery],
    }));

    const result = await listExtraMaterialLog("event-1", "org-1");

    expect(result.map((entry) => entry.id)).toEqual(["log-new", "log-old"]);
    expect(result[0]).toEqual({
      id: "log-new", eventEquipmentId: "ee-1", equipmentId: "eq-1",
      equipmentName: "Cabo XLR", variantId: "var-1", variantLabel: "10 metros",
      equipmentUnitId: null, qty: 2, reason: "Complemento", addedBy: "user-1",
      addedByName: "Pessoa do Almoxarifado", createdAt: "2026-08-20T20:00:00.000Z",
    });
    expect(result[1].addedByName).toBeNull();
    expect(logQuery._calls).toEqual(expect.arrayContaining([
      { method: "eq", args: ["event_id", "event-1"] },
      { method: "eq", args: ["events.organization_id", "org-1"] },
      { method: "order", args: ["created_at", { ascending: false }] },
    ]));
    const selectCall = logQuery._calls.find((call) => call.method === "select");
    expect(selectCall?.args[0]).toContain("events!inner");
  });
});
