import { beforeEach, describe, expect, it, vi } from "vitest";

import { chain, fakeSupabase } from "./helpers/supabaseMock";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import {
  getLatestMaintenanceReturnByEquipment,
  listResolvedMaintenanceHistory,
} from "@/lib/maintenance";

beforeEach(() => vi.clearAllMocks());

describe("listResolvedMaintenanceHistory", () => {
  it("lista todo o historico resolvido do equipamento mais recente primeiro", async () => {
    const query = chain({
      data: [
        {
          id: "m-2",
          organization_id: "org-1",
          equipment_id: "eq-1",
          equipment_unit_id: "unit-1",
          event_id: "event-2",
          condition: "damaged",
          note: "Troca de cabo",
          status: "resolved",
          resolved_at: "2026-08-17T15:30:00.000Z",
          created_at: "2026-08-16T10:00:00.000Z",
          equipment: { name: "Mesa X32" },
          equipment_units: { serial: "SN-001" },
          events: { name: "Evento B" },
        },
        {
          id: "m-1",
          organization_id: "org-1",
          equipment_id: "eq-1",
          equipment_unit_id: "unit-1",
          event_id: "event-1",
          condition: "damaged",
          note: null,
          status: "resolved",
          resolved_at: "2026-07-10T12:00:00.000Z",
          created_at: "2026-07-09T09:00:00.000Z",
          equipment: { name: "Mesa X32" },
          equipment_units: { serial: "SN-001" },
          events: { name: "Evento A" },
        },
      ],
      error: null,
    });
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ equipment_maintenance: [() => query] })
    );

    const records = await listResolvedMaintenanceHistory("org-1", "eq-1");

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      id: "m-2",
      equipmentId: "eq-1",
      unitSerial: "SN-001",
      eventName: "Evento B",
      resolvedAt: "2026-08-17T15:30:00.000Z",
    });
    expect(query._calls).toContainEqual({ method: "eq", args: ["organization_id", "org-1"] });
    expect(query._calls).toContainEqual({ method: "eq", args: ["equipment_id", "eq-1"] });
    expect(query._calls).toContainEqual({ method: "eq", args: ["status", "resolved"] });
    expect(query._calls).toContainEqual({ method: "order", args: ["resolved_at", { ascending: false }] });
  });
});

describe("getLatestMaintenanceReturnByEquipment", () => {
  it("mantem somente o retorno mais recente de cada equipamento", () => {
    const result = getLatestMaintenanceReturnByEquipment([
      { equipmentId: "eq-1", resolvedAt: "2026-08-17T15:30:00.000Z" },
      { equipmentId: "eq-1", resolvedAt: "2026-07-10T12:00:00.000Z" },
      { equipmentId: "eq-2", resolvedAt: "2026-06-01T08:00:00.000Z" },
      { equipmentId: "eq-3", resolvedAt: null },
    ]);

    expect(result).toEqual({
      "eq-1": "2026-08-17T15:30:00.000Z",
      "eq-2": "2026-06-01T08:00:00.000Z",
    });
  });
});
