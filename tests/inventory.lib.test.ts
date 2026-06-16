import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import {
  listEquipmentCategories,
  listEquipment,
  getEquipmentById,
  getEquipmentAllocations,
  formatEquipmentStatus,
  formatPurchaseValue,
  generateQrToken,
} from "@/lib/inventory";

/** Thenable proxy resolving to `value`; methods return self and are recorded. */
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

// ── Pure formatters ─────────────────────────────────────────────────

describe("formatEquipmentStatus", () => {
  it("traduz cada status", () => {
    expect(formatEquipmentStatus("available")).toBe("Disponível");
    expect(formatEquipmentStatus("reserved")).toBe("Reservado");
    expect(formatEquipmentStatus("in_field")).toBe("Em Campo");
    expect(formatEquipmentStatus("maintenance")).toBe("Manutenção");
    expect(formatEquipmentStatus("inactive")).toBe("Inativo");
  });
});

describe("formatPurchaseValue", () => {
  it("retorna travessão para null ou zero", () => {
    expect(formatPurchaseValue(null)).toBe("—");
    expect(formatPurchaseValue(0)).toBe("—");
  });

  it("formata centavos em BRL", () => {
    const out = formatPurchaseValue(123456);
    expect(out).toContain("R$");
    expect(out).toContain("1.234,56");
  });
});

describe("generateQrToken", () => {
  it("monta token com prefixo e id higienizado em maiúsculas", () => {
    expect(generateQrToken("un", "abc-def-1234567890")).toBe("PTN-UN-ABCDEF123456");
  });

  it("trunca em 12 caracteres do id", () => {
    const token = generateQrToken("eq", "aaaaaaaaaaaaaaaaaaaa");
    expect(token).toBe("PTN-EQ-AAAAAAAAAAAA");
  });
});

// ── listEquipmentCategories ─────────────────────────────────────────

describe("listEquipmentCategories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mapeia categoria com pai e contagem de equipamentos", async () => {
    const row = {
      id: "cat-1",
      organization_id: "org-1",
      name: "Áudio",
      parent_category_id: "cat-0",
      parent: { id: "cat-0", name: "Raiz" },
      equipment: [{ count: 7 }],
    };
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ equipment_categories: [() => chain({ data: [row], error: null })] })
    );

    const [cat] = await listEquipmentCategories("org-1");
    expect(cat).toEqual({
      id: "cat-1",
      organizationId: "org-1",
      name: "Áudio",
      parentCategoryId: "cat-0",
      parentCategoryName: "Raiz",
      equipmentCount: 7,
    });
  });

  it("usa 0 e null quando sem pai/contagem", async () => {
    const row = {
      id: "cat-1",
      organization_id: "org-1",
      name: "Geral",
      parent_category_id: null,
      parent: null,
      equipment: [],
    };
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ equipment_categories: [() => chain({ data: [row], error: null })] })
    );
    const [cat] = await listEquipmentCategories("org-1");
    expect(cat.parentCategoryName).toBeNull();
    expect(cat.equipmentCount).toBe(0);
  });

  it("propaga erro do banco", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ equipment_categories: [() => chain({ data: null, error: new Error("db") })] })
    );
    await expect(listEquipmentCategories("org-1")).rejects.toThrow("db");
  });
});

// ── listEquipment ───────────────────────────────────────────────────

describe("listEquipment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("agrega unidades, bulk sem variante e ordena variantes", async () => {
    const row = {
      id: "eq-1",
      organization_id: "org-1",
      category_id: "cat-1",
      name: "Microfone",
      brand: "Shure",
      model: "SM58",
      type: "serialized",
      status: "available",
      has_variants: true,
      serial: null,
      patrimony: null,
      purchase_date: null,
      purchase_value_cents: null,
      qr_code: null,
      notes: null,
      created_at: "2026-01-01",
      equipment_categories: {
        id: "cat-1",
        name: "Áudio",
        parent_category_id: null,
        parent: null,
      },
      bulk_inventory: [
        { id: "b0", variant_id: null, unit: "un", total_qty: 4, available_qty: 2 },
      ],
      equipment_units: [
        { id: "u1", variant_id: "v-b", status: "available" },
        { id: "u2", variant_id: "v-b", status: "in_field" },
      ],
      equipment_variants: [
        { id: "v-b", label: "B", sort_value: null, position: 1, notes: null },
        { id: "v-a", label: "A", sort_value: null, position: 0, notes: null },
      ],
    };
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ equipment: [() => chain({ data: [row], error: null })] })
    );

    const [eq] = await listEquipment("org-1");
    expect(eq).toMatchObject({
      id: "eq-1",
      categoryName: "Áudio",
      unitCount: 2,
      availableUnitCount: 1,
      bulk: { totalQty: 4, availableQty: 2, variantId: null },
    });
    // Ordena por position asc → v-a (0) antes de v-b (1).
    expect(eq.variants?.map((v) => v.id)).toEqual(["v-a", "v-b"]);
    // v-b não tem bulk próprio → cai para contagem de units.
    const vb = eq.variants?.find((v) => v.id === "v-b");
    expect(vb).toMatchObject({ totalQty: 2, availableQty: 1 });
  });

  it("omite variants quando has_variants é false", async () => {
    const row = {
      id: "eq-2",
      organization_id: "org-1",
      category_id: null,
      name: "Cabo",
      brand: null,
      model: null,
      type: "bulk",
      status: "available",
      has_variants: false,
      serial: null,
      patrimony: null,
      purchase_date: null,
      purchase_value_cents: null,
      qr_code: null,
      notes: null,
      created_at: "2026-01-01",
      equipment_categories: null,
      bulk_inventory: [],
      equipment_units: [],
      equipment_variants: [{ id: "v", label: "X", sort_value: null, position: 0, notes: null }],
    };
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ equipment: [() => chain({ data: [row], error: null })] })
    );
    const [eq] = await listEquipment("org-1");
    expect(eq.variants).toBeUndefined();
    expect(eq.categoryName).toBeNull();
    expect(eq.bulk).toBeUndefined();
  });

  it("aplica busca via .or", async () => {
    const q = chain({ data: [], error: null });
    mocks.createSupabaseAdminClient.mockReturnValue(fakeSupabase({ equipment: [() => q] }));
    await listEquipment("org-1", " sm58 ");
    expect(q._calls.find((c) => c.method === "or")?.args[0]).toContain("sm58");
  });
});

// ── getEquipmentById ────────────────────────────────────────────────

describe("getEquipmentById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna null quando não encontrado", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ equipment: [() => chain({ data: null, error: null })] })
    );
    expect(await getEquipmentById("eq-x")).toBeNull();
  });

  it("propaga erro do banco", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ equipment: [() => chain({ data: null, error: new Error("db") })] })
    );
    await expect(getEquipmentById("eq-1")).rejects.toThrow("db");
  });

  it("mapeia equipamento com unidades, variantes ordenadas e bulk", async () => {
    const data = {
      id: "eq-1",
      organization_id: "org-1",
      category_id: "cat-1",
      name: "Microfone",
      brand: "Shure",
      model: "SM58",
      type: "serialized",
      status: "available",
      has_variants: true,
      serial: null,
      patrimony: null,
      purchase_date: null,
      purchase_value_cents: 50000,
      qr_code: null,
      notes: null,
      created_at: "2026-01-01",
      equipment_categories: {
        id: "cat-1",
        name: "Áudio",
        parent_category_id: "cat-0",
        parent: { id: "cat-0", name: "Raiz" },
      },
      bulk_inventory: [
        { id: "b0", variant_id: null, unit: "un", total_qty: 3, available_qty: 1 },
      ],
      equipment_units: [
        { id: "u1", variant_id: "v-a", serial: "S1", patrimony: null, status: "available", qr_code: "Q1", qr_linked_at: "2026-01-02", notes: null, created_at: "2026-01-01" },
        { id: "u2", variant_id: "v-a", serial: "S2", patrimony: null, status: "in_field", qr_code: null, qr_linked_at: null, notes: null, created_at: "2026-01-01" },
      ],
      equipment_variants: [
        { id: "v-b", label: "B", sort_value: 2, position: 0, notes: null },
        { id: "v-a", label: "A", sort_value: 1, position: 0, notes: null },
      ],
    };
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ equipment: [() => chain({ data, error: null })] })
    );

    const eq = await getEquipmentById("eq-1");
    expect(eq).toMatchObject({
      id: "eq-1",
      categoryName: "Áudio",
      parentCategoryName: "Raiz",
      unitCount: 2,
      availableUnitCount: 1,
      bulk: { variantId: null, totalQty: 3, availableQty: 1 },
    });
    // Mesmo position (0) → desempata por sort_value asc: v-a (1) antes de v-b (2).
    expect(eq?.variants?.map((v) => v.id)).toEqual(["v-a", "v-b"]);
    // v-a agrega suas 2 units (1 disponível).
    expect(eq?.variants?.find((v) => v.id === "v-a")).toMatchObject({
      totalQty: 2,
      availableQty: 1,
    });
    // Lista de units detalhada preserva qrLinkedAt.
    expect(eq?.units).toHaveLength(2);
    expect(eq?.units[0]).toMatchObject({ id: "u1", qrCode: "Q1", qrLinkedAt: "2026-01-02" });
  });
});

// ── getEquipmentAllocations ─────────────────────────────────────────

describe("getEquipmentAllocations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("agrupa por evento+variante somando qty e ordena por data desc", async () => {
    const rows = [
      {
        qty: 2,
        variant_id: "v-1",
        equipment_variants: { label: "Grande" },
        events: { id: "ev-1", name: "A", status: "planning", start_date: "2026-01-10", end_date: "2026-01-11" },
      },
      {
        qty: 3,
        variant_id: "v-1",
        equipment_variants: { label: "Grande" },
        events: { id: "ev-1", name: "A", status: "planning", start_date: "2026-01-10", end_date: "2026-01-11" },
      },
      {
        qty: 1,
        variant_id: null,
        equipment_variants: null,
        events: { id: "ev-2", name: "B", status: "in_field", start_date: "2026-02-20", end_date: "2026-02-21" },
      },
    ];
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ event_equipment: [() => chain({ data: rows, error: null })] })
    );

    const result = await getEquipmentAllocations("eq-1");
    // ev-2 (fev) antes de ev-1 (jan) por data desc.
    expect(result.map((a) => a.eventId)).toEqual(["ev-2", "ev-1"]);
    const ev1 = result.find((a) => a.eventId === "ev-1");
    expect(ev1?.qty).toBe(5); // 2 + 3 somados
    expect(ev1?.variantLabel).toBe("Grande");
  });

  it("por padrão filtra apenas eventos ativos (.in em status)", async () => {
    const q = chain({ data: [], error: null });
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ event_equipment: [() => q] })
    );
    await getEquipmentAllocations("eq-1");
    const inCall = q._calls.find((c) => c.method === "in");
    expect(inCall?.args[0]).toBe("events.status");
    expect(inCall?.args[1]).toEqual(["planning", "ready_to_load", "in_field"]);
  });

  it("includeInactive não aplica filtro de status", async () => {
    const q = chain({ data: [], error: null });
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ event_equipment: [() => q] })
    );
    await getEquipmentAllocations("eq-1", { includeInactive: true });
    expect(q._calls.find((c) => c.method === "in")).toBeUndefined();
  });
});
