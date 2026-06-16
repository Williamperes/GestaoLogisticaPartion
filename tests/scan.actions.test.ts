import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEquipmentUnitByQrCode: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentAuthUser: vi.fn(),
}));

vi.mock("@/lib/inventory", async () => {
  const actual = await vi.importActual<typeof import("@/lib/inventory")>("@/lib/inventory");
  return { ...actual, getEquipmentUnitByQrCode: mocks.getEquipmentUnitByQrCode };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentAuthUser: mocks.getCurrentAuthUser,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  manualLoadUnit,
  manualReturnUnit,
  manualUnloadUnit,
  manualUnreturnUnit,
  scanLoadUnit,
  scanReturnUnit,
  unscanLoadUnit,
  unscanReturnUnit,
} from "@/app/(dashboard)/scan/actions";

/**
 * Builds a thenable chain that resolves to the given value and records
 * every method invoked on it. Allows tests to assert which Supabase
 * builder methods were called and with what arguments.
 */
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

/**
 * Builds a fake Supabase client that routes calls by table name AND
 * by call-order within that table (first call → handler[0], etc).
 */
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

const VALID_UNIT = {
  id: "unit-1",
  equipmentId: "eq-A",
  organizationId: "org-1",
  variantId: null,
  status: "available" as const,
};

describe("scanLoadUnit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAuthUser.mockResolvedValue({ id: "user-1" });
  });

  it("rejeita QR não cadastrado", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(null);
    const result = await scanLoadUnit("evt-1", "QR-MISSING");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });

  it("rejeita QR cadastrado mas não vinculado à OS", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: null })],
      })
    );
    const result = await scanLoadUnit("evt-1", "QR-OTHER");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não está/i);
  });

  it("rejeita sem autenticação", async () => {
    mocks.getCurrentAuthUser.mockResolvedValue(null);
    const result = await scanLoadUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/autentic/i);
  });

  it("rejeita QR vazio", async () => {
    const result = await scanLoadUnit("evt-1", "  ");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vazio/i);
  });

  it("propaga erro do banco ao buscar a linha event_equipment", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: { message: "ee boom" } })],
      })
    );
    const result = await scanLoadUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ee boom");
  });

  it("propaga erro do upsert da unit", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: { id: "ee-1", qty: 1 }, error: null })],
        event_equipment_units: [() => chain({ error: { message: "upsert boom" } })],
      })
    );
    const result = await scanLoadUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("upsert boom");
  });

  it("happy path: upsert event_equipment_units e retorna ok", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const supabase = fakeSupabase({
      event_equipment: [
        () => chain({ data: { id: "ee-1", qty: 3 }, error: null }),
      ],
      event_equipment_units: [
        () => chain({ error: null }),
        () => chain({ count: 1, error: null }),
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await scanLoadUnit("evt-1", "QR-OK");
    expect(result.ok).toBe(true);
    expect(result.eventEquipmentId).toBe("ee-1");
    expect(result.unitId).toBe("unit-1");
  });

  it("marca event_equipment.loaded=true quando todas units foram carregadas", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const eeUpdateChain = chain({ error: null });
    const supabase = fakeSupabase({
      event_equipment: [
        () => chain({ data: { id: "ee-1", qty: 2 }, error: null }),
        () => eeUpdateChain,
      ],
      event_equipment_units: [
        () => chain({ error: null }),
        () => chain({ count: 2, error: null }),
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await scanLoadUnit("evt-1", "QR-LAST");
    expect(result.ok).toBe(true);
    const updateCall = eeUpdateChain._calls.find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall?.args[0]).toMatchObject({
      separated: true,
      loaded: true,
      loaded_by: "user-1",
    });
  });

  it("usa .eq('variant_id', X) quando unit tem variantId não-null", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue({
      ...VALID_UNIT,
      variantId: "var-9",
    });
    const eeChain = chain({ data: { id: "ee-1", qty: 1 }, error: null });
    const supabase = fakeSupabase({
      event_equipment: [() => eeChain],
      event_equipment_units: [
        () => chain({ error: null }),
        () => chain({ count: 1, error: null }),
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await scanLoadUnit("evt-1", "QR-VAR");
    expect(result.ok).toBe(true);
    const eqCall = eeChain._calls.find(
      (c) => c.method === "eq" && c.args[0] === "variant_id"
    );
    expect(eqCall).toBeDefined();
    expect(eqCall?.args[1]).toBe("var-9");
    expect(eeChain._calls.find((c) => c.method === "is")).toBeUndefined();
  });

  it("usa .is('variant_id', null) quando unit tem variantId null", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const eeChain = chain({ data: { id: "ee-1", qty: 1 }, error: null });
    const supabase = fakeSupabase({
      event_equipment: [() => eeChain],
      event_equipment_units: [
        () => chain({ error: null }),
        () => chain({ count: 1, error: null }),
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await scanLoadUnit("evt-1", "QR-NULL");
    expect(result.ok).toBe(true);
    const isCall = eeChain._calls.find(
      (c) => c.method === "is" && c.args[0] === "variant_id"
    );
    expect(isCall).toBeDefined();
    expect(isCall?.args[1]).toBeNull();
  });

  it("reverte loaded/separated=false quando ainda faltam units", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const eeUpdateChain = chain({ error: null });
    const supabase = fakeSupabase({
      event_equipment: [
        () => chain({ data: { id: "ee-1", qty: 5 }, error: null }),
        () => eeUpdateChain,
      ],
      event_equipment_units: [
        () => chain({ error: null }),
        () => chain({ count: 2, error: null }),
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await scanLoadUnit("evt-1", "QR-PARTIAL");
    expect(result.ok).toBe(true);
    // Carga parcial sincroniza a linha como não-carregada (simétrico ao desbipar).
    const updateCall = eeUpdateChain._calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({ loaded: false, separated: false });
  });
});

describe("scanReturnUnit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAuthUser.mockResolvedValue({ id: "user-1" });
  });

  it("rejeita QR não cadastrado", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(null);
    const result = await scanReturnUnit("evt-1", "QR-MISSING");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });

  it("rejeita sem autenticação", async () => {
    mocks.getCurrentAuthUser.mockResolvedValue(null);
    const result = await scanReturnUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/autentic/i);
  });

  it("rejeita QR vazio", async () => {
    const result = await scanReturnUnit("evt-1", "   ");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vazio/i);
  });

  it("propaga erro do banco ao buscar a linha event_equipment", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: { message: "ee boom" } })],
      })
    );
    const result = await scanReturnUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ee boom");
  });

  it("rejeita QR não vinculado à OS", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: null })],
      })
    );
    const result = await scanReturnUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não está/i);
  });

  it("propaga erro do banco no update da unit", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: { id: "ee-1", qty: 1 }, error: null })],
        event_equipment_units: [() => chain({ data: null, error: { message: "upd boom" } })],
      })
    );
    const result = await scanReturnUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("upd boom");
  });

  it("rejeita unit não carregada ou já retornada (update não encontra row)", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const supabase = fakeSupabase({
      event_equipment: [
        () => chain({ data: { id: "ee-1", qty: 3 }, error: null }),
      ],
      event_equipment_units: [
        () => chain({ data: null, error: null }),
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await scanReturnUnit("evt-1", "QR-NOT-LOADED");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não carregada|já retornada/i);
  });

  it("happy path: marca returned_at na unit e retorna ok", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const supabase = fakeSupabase({
      event_equipment: [
        () => chain({ data: { id: "ee-1", qty: 3 }, error: null }),
      ],
      event_equipment_units: [
        () => chain({ data: { id: "eeu-1" }, error: null }),
        () => chain({ count: 1, error: null }),
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await scanReturnUnit("evt-1", "QR-OK");
    expect(result.ok).toBe(true);
    expect(result.eventEquipmentId).toBe("ee-1");
  });

  it("marca event_equipment.returned_at quando todas units foram retornadas (libera availability)", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const eeReturnChain = chain({ error: null });
    const supabase = fakeSupabase({
      event_equipment: [
        () => chain({ data: { id: "ee-1", qty: 2 }, error: null }),
        () => eeReturnChain,
      ],
      event_equipment_units: [
        () => chain({ data: { id: "eeu-1" }, error: null }),
        () => chain({ count: 2, error: null }),
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await scanReturnUnit("evt-1", "QR-LAST");
    expect(result.ok).toBe(true);
    const updateCall = eeReturnChain._calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({
      returned_at: expect.any(String),
    });
  });

  it("mantém returned_at=null se ainda faltam units retornar", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const eeReturnChain = chain({ error: null });
    const supabase = fakeSupabase({
      event_equipment: [
        () => chain({ data: { id: "ee-1", qty: 5 }, error: null }),
        () => eeReturnChain,
      ],
      event_equipment_units: [
        () => chain({ data: { id: "eeu-1" }, error: null }),
        () => chain({ count: 3, error: null }),
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await scanReturnUnit("evt-1", "QR-PARTIAL");
    expect(result.ok).toBe(true);
    const updateCall = eeReturnChain._calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toMatchObject({ returned_at: null });
  });
});

const EE_ROW = { id: "ee-1", equipment_id: "eq-A", variant_id: null, qty: 3 };

describe("unscanLoadUnit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAuthUser.mockResolvedValue({ id: "user-1" });
  });

  it("happy path: apaga a unidade carregada e ressincroniza", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null }), () => chain({ error: null })],
      event_equipment_units: [
        () => chain({ data: { id: "eeu-1" }, error: null }), // delete ... select
        () => chain({ count: 0, error: null }), // sync count
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await unscanLoadUnit("evt-1", "QR-OK");
    expect(result.ok).toBe(true);
    expect(result.eventEquipmentId).toBe("ee-1");
  });

  it("rejeita quando a unidade não estava carregada", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null })],
      event_equipment_units: [() => chain({ data: null, error: null })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await unscanLoadUnit("evt-1", "QR-OK");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não estava carregada/i);
  });

  it("rejeita sem autenticação", async () => {
    mocks.getCurrentAuthUser.mockResolvedValue(null);
    const result = await unscanLoadUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/autentic/i);
  });

  it("rejeita QR vazio", async () => {
    const result = await unscanLoadUnit("evt-1", "  ");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vazio/i);
  });

  it("rejeita QR não encontrado", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(null);
    const result = await unscanLoadUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });

  it("propaga erro do banco ao buscar a linha event_equipment", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: { message: "ee boom" } })],
      })
    );
    const result = await unscanLoadUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ee boom");
  });

  it("rejeita QR não vinculado à OS", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: null })],
      })
    );
    const result = await unscanLoadUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não está/i);
  });

  it("propaga erro do banco no delete", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: EE_ROW, error: null })],
        event_equipment_units: [() => chain({ data: null, error: { message: "del boom" } })],
      })
    );
    const result = await unscanLoadUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("del boom");
  });
});

describe("unscanReturnUnit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAuthUser.mockResolvedValue({ id: "user-1" });
  });

  it("happy path: zera returned_at e ressincroniza", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null }), () => chain({ error: null })],
      event_equipment_units: [
        () => chain({ data: { id: "eeu-1" }, error: null }), // update ... select
        () => chain({ count: 0, error: null }), // sync count
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await unscanReturnUnit("evt-1", "QR-OK");
    expect(result.ok).toBe(true);
    expect(result.eventEquipmentId).toBe("ee-1");
  });

  it("rejeita quando a unidade não estava retornada", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null })],
      event_equipment_units: [() => chain({ data: null, error: null })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await unscanReturnUnit("evt-1", "QR-OK");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não estava retornada/i);
  });

  it("rejeita sem autenticação", async () => {
    mocks.getCurrentAuthUser.mockResolvedValue(null);
    const result = await unscanReturnUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/autentic/i);
  });

  it("rejeita QR vazio", async () => {
    const result = await unscanReturnUnit("evt-1", "  ");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vazio/i);
  });

  it("rejeita QR não encontrado", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(null);
    const result = await unscanReturnUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });

  it("propaga erro do banco ao buscar a linha event_equipment", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: { message: "ee boom" } })],
      })
    );
    const result = await unscanReturnUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ee boom");
  });

  it("rejeita QR não vinculado à OS", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: null })],
      })
    );
    const result = await unscanReturnUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não está/i);
  });

  it("propaga erro do banco no update", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: EE_ROW, error: null })],
        event_equipment_units: [() => chain({ data: null, error: { message: "upd boom" } })],
      })
    );
    const result = await unscanReturnUnit("evt-1", "QR");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("upd boom");
  });
});

describe("manualLoadUnit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAuthUser.mockResolvedValue({ id: "user-1" });
  });

  it("happy path: escolhe unidade livre, faz upsert e ressincroniza", async () => {
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null }), () => chain({ error: null })],
      event_equipment_units: [
        () => chain({ count: 1, error: null }), // já carregadas (1 < 3)
        () => chain({ data: [], error: null }), // unidades já usadas
        () => chain({ error: null }), // upsert
        () => chain({ count: 2, error: null }), // sync count
      ],
      equipment_units: [() => chain({ data: { id: "unit-free" }, error: null })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await manualLoadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(true);
    expect(result.eventEquipmentId).toBe("ee-1");
  });

  it("trata count e used nulos como zero/vazio (nullish fallbacks)", async () => {
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: { ...EE_ROW, qty: 1 }, error: null }), () => chain({ error: null })],
      event_equipment_units: [
        () => chain({ count: undefined, error: null }), // already → ?? 0
        () => chain({ data: null, error: null }), // used → ?? []
        () => chain({ error: null }), // upsert
        () => chain({ count: undefined, error: null }), // syncLoadedState count → ?? 0
      ],
      equipment_units: [() => chain({ data: { id: "unit-free" }, error: null })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await manualLoadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(true);
  });

  it("rejeita quando a quantidade já está completa", async () => {
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: { ...EE_ROW, qty: 2 }, error: null })],
      event_equipment_units: [() => chain({ count: 2, error: null })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await manualLoadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/já completa/i);
  });

  it("rejeita quando não há unidade disponível", async () => {
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null })],
      event_equipment_units: [
        () => chain({ count: 0, error: null }),
        () => chain({ data: [], error: null }),
      ],
      equipment_units: [() => chain({ data: null, error: null })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await manualLoadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sem unidades disponíveis/i);
  });

  it("rejeita sem autenticação", async () => {
    mocks.getCurrentAuthUser.mockResolvedValue(null);
    const result = await manualLoadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/autentic/i);
  });

  it("propaga erro do banco ao buscar a linha event_equipment", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: { message: "ee boom" } })],
      })
    );
    const result = await manualLoadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ee boom");
  });

  it("rejeita quando o equipamento não está na OS", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: null })],
      })
    );
    const result = await manualLoadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });

  it("propaga erro do upsert e exclui unidades já usadas (com variante)", async () => {
    const unitsQuery = chain({ data: { id: "unit-free" }, error: null });
    const supabase = fakeSupabase({
      event_equipment: [
        () => chain({ data: { ...EE_ROW, variant_id: "var-1" }, error: null }),
      ],
      event_equipment_units: [
        () => chain({ count: 0, error: null }), // já carregadas (0 < 3)
        () => chain({ data: [{ equipment_unit_id: "u-used" }], error: null }), // usadas
        () => chain({ error: { message: "upsert boom" } }), // upsert falha
      ],
      equipment_units: [() => unitsQuery],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await manualLoadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("upsert boom");
    // variante não-null → usa .eq('variant_id', X) e exclui usados via .not('id','in',...)
    expect(
      unitsQuery._calls.some((c) => c.method === "eq" && c.args[0] === "variant_id")
    ).toBe(true);
    expect(
      unitsQuery._calls.some((c) => c.method === "not" && c.args[0] === "id")
    ).toBe(true);
  });
});

describe("manualUnloadUnit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAuthUser.mockResolvedValue({ id: "user-1" });
  });

  it("happy path: apaga uma unidade carregada e ressincroniza", async () => {
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null }), () => chain({ error: null })],
      event_equipment_units: [
        () => chain({ data: { id: "eeu-9" }, error: null }), // acha row
        () => chain({ error: null }), // delete
        () => chain({ count: 1, error: null }), // sync count
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await manualUnloadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(true);
  });

  it("rejeita quando não há nada para desbipar", async () => {
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null })],
      event_equipment_units: [() => chain({ data: null, error: null })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await manualUnloadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nada para desbipar/i);
  });

  it("rejeita sem autenticação", async () => {
    mocks.getCurrentAuthUser.mockResolvedValue(null);
    const result = await manualUnloadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/autentic/i);
  });

  it("propaga erro do banco ao buscar a linha event_equipment", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: { message: "ee boom" } })],
      })
    );
    const result = await manualUnloadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ee boom");
  });

  it("rejeita quando o equipamento não está na OS", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: null })],
      })
    );
    const result = await manualUnloadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });

  it("propaga erro do banco no delete", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: EE_ROW, error: null })],
        event_equipment_units: [
          () => chain({ data: { id: "eeu-9" }, error: null }),
          () => chain({ error: { message: "del boom" } }),
        ],
      })
    );
    const result = await manualUnloadUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("del boom");
  });
});

describe("manualReturnUnit / manualUnreturnUnit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAuthUser.mockResolvedValue({ id: "user-1" });
  });

  it("manualReturnUnit happy path: retorna uma unidade carregada", async () => {
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null }), () => chain({ error: null })],
      event_equipment_units: [
        () => chain({ data: { id: "eeu-1" }, error: null }), // acha carregada-não-retornada
        () => chain({ error: null }), // update returned_at
        () => chain({ count: 1, error: null }), // sync count
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await manualReturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(true);
  });

  it("manualReturnUnit trata count nulo do sync como zero", async () => {
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null }), () => chain({ error: null })],
      event_equipment_units: [
        () => chain({ data: { id: "eeu-1" }, error: null }),
        () => chain({ error: null }),
        () => chain({ count: undefined, error: null }), // syncReturnedState count → ?? 0
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await manualReturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(true);
  });

  it("manualUnreturnUnit happy path: desfaz um retorno", async () => {
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null }), () => chain({ error: null })],
      event_equipment_units: [
        () => chain({ data: { id: "eeu-1" }, error: null }), // acha retornada
        () => chain({ error: null }), // update returned_at=null
        () => chain({ count: 0, error: null }), // sync count
      ],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await manualUnreturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(true);
  });

  it("manualReturnUnit rejeita quando não há unidade carregada", async () => {
    const supabase = fakeSupabase({
      event_equipment: [() => chain({ data: EE_ROW, error: null })],
      event_equipment_units: [() => chain({ data: null, error: null })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);

    const result = await manualReturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nenhuma unidade carregada/i);
  });

  it("manualReturnUnit rejeita sem autenticação", async () => {
    mocks.getCurrentAuthUser.mockResolvedValue(null);
    const result = await manualReturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/autentic/i);
  });

  it("manualReturnUnit propaga erro do banco ao buscar a linha", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: { message: "ee boom" } })],
      })
    );
    const result = await manualReturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ee boom");
  });

  it("manualReturnUnit rejeita quando o equipamento não está na OS", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: null })],
      })
    );
    const result = await manualReturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });

  it("manualReturnUnit propaga erro do banco no update", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: EE_ROW, error: null })],
        event_equipment_units: [
          () => chain({ data: { id: "eeu-1" }, error: null }),
          () => chain({ error: { message: "upd boom" } }),
        ],
      })
    );
    const result = await manualReturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("upd boom");
  });

  it("manualUnreturnUnit rejeita sem autenticação", async () => {
    mocks.getCurrentAuthUser.mockResolvedValue(null);
    const result = await manualUnreturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/autentic/i);
  });

  it("manualUnreturnUnit propaga erro do banco ao buscar a linha", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: { message: "ee boom" } })],
      })
    );
    const result = await manualUnreturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ee boom");
  });

  it("manualUnreturnUnit rejeita quando o equipamento não está na OS", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: null, error: null })],
      })
    );
    const result = await manualUnreturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado/i);
  });

  it("manualUnreturnUnit rejeita quando não há nada para desbipar", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: EE_ROW, error: null })],
        event_equipment_units: [() => chain({ data: null, error: null })],
      })
    );
    const result = await manualUnreturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nada para desbipar/i);
  });

  it("manualUnreturnUnit propaga erro do banco no update", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_equipment: [() => chain({ data: EE_ROW, error: null })],
        event_equipment_units: [
          () => chain({ data: { id: "eeu-1" }, error: null }),
          () => chain({ error: { message: "upd boom" } }),
        ],
      })
    );
    const result = await manualUnreturnUnit("evt-1", "ee-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("upd boom");
  });
});
