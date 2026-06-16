import { beforeEach, describe, expect, it, vi } from "vitest";

import { chain, fakeSupabase } from "./helpers/supabaseMock";

const mocks = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import {
  getDashboardKPIs,
  getCategoryStats,
  getUtilizationHistory,
} from "@/lib/dashboard";

describe("getDashboardKPIs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("agrega contagens e calcula taxa de utilização", async () => {
    // Ordem das chamadas em Promise.all: events x3, depois equipment_units.
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        events: [
          () => chain({ count: 4 }), // eventsThisMonth
          () => chain({ count: 2 }), // eventsNextMonth
          () => chain({ count: 3 }), // pendingReturns (in_field)
        ],
        equipment_units: [
          () =>
            chain({
              data: [
                { status: "in_field" },
                { status: "reserved" },
                { status: "available" },
                { status: "maintenance" },
              ],
            }),
        ],
      })
    );

    const kpis = await getDashboardKPIs("org-1");
    expect(kpis).toEqual({
      eventsThisMonth: 4,
      eventsNextMonth: 2,
      pendingReturns: 3,
      itemsInMaintenance: 1,
      utilizationRate: 50, // 2 em uso de 4 = 50%
    });
  });

  it("utilização 0 quando não há unidades", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        events: [() => chain({ count: 0 }), () => chain({ count: 0 }), () => chain({ count: 0 })],
        equipment_units: [() => chain({ data: [] })],
      })
    );
    const kpis = await getDashboardKPIs("org-1");
    expect(kpis.utilizationRate).toBe(0);
    expect(kpis.itemsInMaintenance).toBe(0);
  });
});

describe("getCategoryStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filtra categorias sem itens e ordena por contagem desc", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        equipment_categories: [
          () =>
            chain({
              data: [
                { name: "Áudio", equipment: [{ count: 2 }] },
                { name: "Vazia", equipment: [{ count: 0 }] },
                { name: "Luz", equipment: [{ count: 5 }] },
              ],
            }),
        ],
      })
    );

    const stats = await getCategoryStats("org-1");
    expect(stats).toEqual([
      { name: "Luz", count: 5 },
      { name: "Áudio", count: 2 },
    ]);
  });

  it("retorna [] quando data é null", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ equipment_categories: [() => chain({ data: null })] })
    );
    expect(await getCategoryStats("org-1")).toEqual([]);
  });
});

describe("getUtilizationHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 6 buckets mensais com utilização por sobreposição de datas", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        equipment_units: [() => chain({ count: 4 })],
        events: [
          () =>
            chain({
              data: [
                {
                  start_date: "2020-01-01",
                  end_date: "2099-12-31",
                  event_equipment: [{ unit_id: "u-1" }, { unit_id: "u-2" }, { unit_id: null }],
                },
              ],
            }),
        ],
      })
    );

    const history = await getUtilizationHistory("org-1");
    expect(history).toHaveLength(6);
    // O evento cobre todo o período → 2 unidades distintas de 4 = 50% em cada bucket.
    for (const point of history) {
      expect(point.utilization).toBe(50);
      expect(typeof point.month).toBe("string");
    }
  });

  it("utilização 0 quando não há unidades totais", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        equipment_units: [() => chain({ count: 0 })],
        events: [() => chain({ data: [] })],
      })
    );
    const history = await getUtilizationHistory("org-1");
    expect(history.every((p) => p.utilization === 0)).toBe(true);
  });
});
