import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { availabilityKey, getEquipmentAvailability } from "@/lib/inventory";

// Helper: builds a fake supabase client that dispatches by table name.
// Each table maps to a builder returning the data the production code expects.
type Handler = {
  // Final value yielded after the chain of methods is awaited.
  data: unknown;
  // Optional: count expected calls for assertions.
};

function fakeSupabase(handlers: Record<string, () => Handler>) {
  const calls: Record<string, number> = {};

  function makeChain(initial: Handler) {
    const value = Promise.resolve({ data: initial.data, error: null });
    // Build a chain that returns itself for any method, then resolves to the value
    // when awaited. The chain is a Proxy with `then` so it's thenable.
    const chain: Record<string, unknown> = {};
    const handler: ProxyHandler<typeof chain> = {
      get(_t, prop) {
        if (prop === "then") {
          return value.then.bind(value);
        }
        return () => proxy;
      },
    };
    const proxy: Record<string, unknown> = new Proxy(chain, handler);
    return proxy;
  }

  return {
    from: vi.fn((table: string) => {
      calls[table] = (calls[table] ?? 0) + 1;
      const builder = handlers[table];
      if (!builder) throw new Error(`Unexpected table: ${table}`);
      return makeChain(builder());
    }),
    _calls: () => calls,
  };
}

describe("getEquipmentAvailability (Refactor H — overlap por datas reais)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("NÃO conta OS A (01/08, 15/08) como conflito quando OS B é em 08/08", async () => {
    // Cenário do Refactor H. Cache range antigo trataria isso como overlap.
    // Datas reais: A está em [01/08, 15/08], B está em [08/08]. Sem interseção.
    //
    // O event_dates query filtra por date IN [08/08]. As datas de A (01/08, 15/08)
    // não batem → nenhuma row volta → overlappingEventIds vazio → allocated=0.

    const supabase = fakeSupabase({
      equipment: () => ({
        data: [
          {
            id: "eq-1",
            type: "bulk",
            has_variants: false,
            equipment_units: [],
            bulk_inventory: [{ variant_id: null, total_qty: 10 }],
            equipment_variants: [],
          },
        ],
      }),
      event_dates: () => ({
        // Nenhuma OS tem date IN ['2026-08-08'] (porque A só tem 01/08 e 15/08).
        data: [],
      }),
      event_equipment: () => ({
        // Não deve ser chamada nesse cenário (sem OS sobrepostas).
        data: [],
      }),
    });

    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const map = await getEquipmentAvailability("org-1", ["2026-08-08"]);
    const key = availabilityKey("eq-1", null);
    const entry = map.get(key);

    expect(entry).toBeDefined();
    expect(entry?.total).toBe(10);
    expect(entry?.allocated).toBe(0);
    expect(entry?.available).toBe(10);

    // event_equipment não deve ter sido tocada — sem OS conflitantes
    expect(supabase._calls().event_equipment ?? 0).toBe(0);
  });

  it("CONTA OS A como conflito quando OS B compartilha data 15/08", async () => {
    // Mesma OS A (datas 01/08 + 15/08). OS B agora é em 15/08 — colide.
    const supabase = fakeSupabase({
      equipment: () => ({
        data: [
          {
            id: "eq-1",
            type: "bulk",
            has_variants: false,
            equipment_units: [],
            bulk_inventory: [{ variant_id: null, total_qty: 10 }],
            equipment_variants: [],
          },
        ],
      }),
      event_dates: () => ({
        // Query "date IN ['2026-08-15']" retorna a linha de A no dia 15/08.
        data: [{ event_id: "event-A" }],
      }),
      event_equipment: () => ({
        // A reservou 3 unidades do eq-1.
        data: [{
          equipment_id: "eq-1", variant_id: null, qty: 3,
          bulk_returned_qty: 0, returned_at: null,
        }],
      }),
    });

    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const map = await getEquipmentAvailability("org-1", ["2026-08-15"]);
    const entry = map.get(availabilityKey("eq-1", null));

    expect(entry?.total).toBe(10);
    expect(entry?.allocated).toBe(3);
    expect(entry?.available).toBe(7);
  });

  it("excludeEventId remove a OS atual do cálculo de allocated", async () => {
    // Avaliação para "event-A" sendo editado. Ele aparece em overlapData,
    // mas com excludeEventId deve ser ignorado (allocated = 0, mostra cap real).
    const supabase = fakeSupabase({
      equipment: () => ({
        data: [
          {
            id: "eq-1",
            type: "bulk",
            has_variants: false,
            equipment_units: [],
            bulk_inventory: [{ variant_id: null, total_qty: 10 }],
            equipment_variants: [],
          },
        ],
      }),
      event_dates: () => ({
        data: [{ event_id: "event-A" }],
      }),
      event_equipment: () => ({
        data: [{
          equipment_id: "eq-1", variant_id: null, qty: 3,
          bulk_returned_qty: 0, returned_at: null,
        }],
      }),
    });

    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const map = await getEquipmentAvailability("org-1", ["2026-08-15"], "event-A");
    const entry = map.get(availabilityKey("eq-1", null));

    expect(entry?.allocated).toBe(0);
    expect(entry?.available).toBe(10);
    // event_equipment não foi consultada (overlappingEventIds vazio após exclude)
    expect(supabase._calls().event_equipment ?? 0).toBe(0);
  });

  it("dates=[] retorna allocated=0 sem chamar event_dates", async () => {
    const supabase = fakeSupabase({
      equipment: () => ({
        data: [
          {
            id: "eq-1",
            type: "bulk",
            has_variants: false,
            equipment_units: [],
            bulk_inventory: [{ variant_id: null, total_qty: 5 }],
            equipment_variants: [],
          },
        ],
      }),
      event_dates: () => ({ data: [] }),
      event_equipment: () => ({ data: [] }),
    });

    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const map = await getEquipmentAvailability("org-1", []);
    const entry = map.get(availabilityKey("eq-1", null));

    expect(entry?.total).toBe(5);
    expect(entry?.allocated).toBe(0);
    expect(entry?.available).toBe(5);
    expect(supabase._calls().event_dates ?? 0).toBe(0);
    expect(supabase._calls().event_equipment ?? 0).toBe(0);
  });

  it("subtrai retornos bulk parciais e totais sem alterar alocação serializada", async () => {
    const supabase = fakeSupabase({
      equipment: () => ({
        data: [
          {
            id: "eq-bulk",
            type: "bulk",
            has_variants: false,
            equipment_units: [],
            bulk_inventory: [{ variant_id: null, total_qty: 10 }],
            equipment_variants: [],
          },
          {
            id: "eq-serial",
            type: "serialized",
            has_variants: false,
            equipment_units: [
              { id: "u1", variant_id: null, status: "available" },
              { id: "u2", variant_id: null, status: "available" },
              { id: "u3", variant_id: null, status: "available" },
            ],
            bulk_inventory: [],
            equipment_variants: [],
          },
        ],
      }),
      event_dates: () => ({
        data: [{ event_id: "event-A" }, { event_id: "event-B" }],
      }),
      event_equipment: () => ({
        data: [
          {
            equipment_id: "eq-bulk", variant_id: null, qty: 6,
            bulk_returned_qty: 2, returned_at: null,
          },
          {
            equipment_id: "eq-bulk", variant_id: null, qty: 4,
            bulk_returned_qty: 4, returned_at: null,
          },
          {
            equipment_id: "eq-serial", variant_id: null, qty: 2,
            bulk_returned_qty: 0, returned_at: null,
          },
        ],
      }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await getEquipmentAvailability("org-1", ["2026-08-20"]);

    expect(result.get(availabilityKey("eq-bulk", null))).toEqual({
      total: 10,
      allocated: 4,
      available: 6,
    });
    expect(result.get(availabilityKey("eq-serial", null))).toEqual({
      total: 3,
      allocated: 2,
      available: 1,
    });
  });

  it("não conta event_equipment com returned_at setado", async () => {
    const supabase = fakeSupabase({
      equipment: () => ({
        data: [
          {
            id: "eq-1",
            type: "serialized",
            has_variants: false,
            equipment_units: [
              { id: "u1", variant_id: null, status: "available" },
              { id: "u2", variant_id: null, status: "available" },
            ],
            bulk_inventory: [],
            equipment_variants: [],
          },
        ],
      }),
      event_dates: () => ({
        data: [{ event_id: "evt-A" }],
      }),
      event_equipment: () => ({
        // OS A tinha 2 unidades alocadas, mas já foi totalmente devolvida.
        // Query agora filtra returned_at IS NULL → zero rows → allocated=0.
        data: [],
      }),
    });

    mocks.createSupabaseAdminClient.mockReturnValue(supabase);
    const result = await getEquipmentAvailability("org-1", ["2026-08-08"]);
    const av = result.get(availabilityKey("eq-1", null));
    expect(av?.allocated).toBe(0);
    expect(av?.available).toBe(2);
  });
});
