import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEquipmentUnitByQrCode: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentAuthUser: vi.fn(),
  getCurrentUserContext: vi.fn(),
  getTeamMemberByUserId: vi.fn(),
  teamMemberHasEventAccess: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/inventory", async () => {
  const actual = await vi.importActual<typeof import("@/lib/inventory")>("@/lib/inventory");
  return { ...actual, getEquipmentUnitByQrCode: mocks.getEquipmentUnitByQrCode };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentAuthUser: mocks.getCurrentAuthUser,
  getCurrentUserContext: mocks.getCurrentUserContext,
}));

vi.mock("@/lib/team", async () => {
  const actual = await vi.importActual<typeof import("@/lib/team")>("@/lib/team");
  return {
    ...actual,
    getTeamMemberByUserId: mocks.getTeamMemberByUserId,
    teamMemberHasEventAccess: mocks.teamMemberHasEventAccess,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  manualLoadUnit,
  manualReturnUnit,
  manualUnloadUnit,
  manualUnreturnUnit,
  registerExtraBulkMaterial,
  registerExtraSerializedMaterial,
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

const WAREHOUSE_CONTEXT = {
  userId: "warehouse-user-1",
  role: "warehouse",
  primaryOrganization: { id: "org-1" },
};
const EXTRA_EVENT_ID = "11111111-1111-4111-8111-111111111111";
const EXTRA_EQUIPMENT_ID = "22222222-2222-4222-8222-222222222222";
const EXTRA_VARIANT_ID = "33333333-3333-4333-8333-333333333333";

function rpcResponse(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error });
  mocks.rpc.mockReturnValue({ single });
  return single;
}

const unsafeRegisterExtraSerialized = registerExtraSerializedMaterial as unknown as (
  eventId: unknown,
  qrCode: unknown,
  reason: unknown
) => Promise<unknown>;
const unsafeRegisterExtraBulk = registerExtraBulkMaterial as unknown as (
  input: unknown
) => Promise<unknown>;

describe("registro de material extra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReset();
    mocks.getCurrentUserContext.mockResolvedValue(WAREHOUSE_CONTEXT);
    mocks.getTeamMemberByUserId.mockResolvedValue({ id: "member-1" });
    mocks.teamMemberHasEventAccess.mockResolvedValue(true);
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(VALID_UNIT);
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it.each([
    [null, "QR-1", "Reserva", "Sem acesso a esta OS."],
    [undefined, "QR-1", "Reserva", "Sem acesso a esta OS."],
    [42, "QR-1", "Reserva", "Sem acesso a esta OS."],
    ["event-malformado", "QR-1", "Reserva", "Sem acesso a esta OS."],
    [EXTRA_EVENT_ID, null, "Reserva", "QR vazio"],
    [EXTRA_EVENT_ID, undefined, "Reserva", "QR vazio"],
    [EXTRA_EVENT_ID, { code: "QR-1" }, "Reserva", "QR vazio"],
    [EXTRA_EVENT_ID, "QR-1", null, "Informe o motivo do material extra."],
    [EXTRA_EVENT_ID, "QR-1", undefined, "Informe o motivo do material extra."],
    [EXTRA_EVENT_ID, "QR-1", ["Reserva"], "Informe o motivo do material extra."],
  ])(
    "rejeita payload serializado adulterado %# sem lançar",
    async (eventId, qrCode, reason, error) => {
      await expect(
        unsafeRegisterExtraSerialized(eventId, qrCode, reason)
      ).resolves.toEqual({ ok: false, error });
      expect(mocks.getCurrentUserContext).not.toHaveBeenCalled();
      expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it.each([
    [null, "Dados de material extra inválidos."],
    [undefined, "Dados de material extra inválidos."],
    ["payload", "Dados de material extra inválidos."],
    [[], "Dados de material extra inválidos."],
    [{}, "Sem acesso a esta OS."],
    [{ eventId: null }, "Sem acesso a esta OS."],
    [{ eventId: 42 }, "Sem acesso a esta OS."],
    [{ eventId: "event-malformado" }, "Sem acesso a esta OS."],
    [
      {
        eventId: EXTRA_EVENT_ID,
        equipmentId: null,
        variantId: null,
        qty: 1,
        reason: "Reserva",
      },
      "Material indisponível.",
    ],
    [
      {
        eventId: EXTRA_EVENT_ID,
        equipmentId: undefined,
        variantId: null,
        qty: 1,
        reason: "Reserva",
      },
      "Material indisponível.",
    ],
    [
      {
        eventId: EXTRA_EVENT_ID,
        equipmentId: "equipment-malformado",
        variantId: null,
        qty: 1,
        reason: "Reserva",
      },
      "Material indisponível.",
    ],
    [
      {
        eventId: EXTRA_EVENT_ID,
        equipmentId: EXTRA_EQUIPMENT_ID,
        variantId: 42,
        qty: 1,
        reason: "Reserva",
      },
      "Material indisponível.",
    ],
    [
      {
        eventId: EXTRA_EVENT_ID,
        equipmentId: EXTRA_EQUIPMENT_ID,
        variantId: undefined,
        qty: 1,
        reason: "Reserva",
      },
      "Material indisponível.",
    ],
    [
      {
        eventId: EXTRA_EVENT_ID,
        equipmentId: EXTRA_EQUIPMENT_ID,
        variantId: "variant-malformada",
        qty: 1,
        reason: "Reserva",
      },
      "Material indisponível.",
    ],
    [
      {
        eventId: EXTRA_EVENT_ID,
        equipmentId: EXTRA_EQUIPMENT_ID,
        variantId: null,
        qty: undefined,
        reason: "Reserva",
      },
      "Quantidade inválida.",
    ],
    [
      {
        eventId: EXTRA_EVENT_ID,
        equipmentId: EXTRA_EQUIPMENT_ID,
        variantId: null,
        qty: "3",
        reason: "Reserva",
      },
      "Quantidade inválida.",
    ],
    [
      {
        eventId: EXTRA_EVENT_ID,
        equipmentId: EXTRA_EQUIPMENT_ID,
        variantId: null,
        qty: 1,
        reason: undefined,
      },
      "Informe o motivo do material extra.",
    ],
    [
      {
        eventId: EXTRA_EVENT_ID,
        equipmentId: EXTRA_EQUIPMENT_ID,
        variantId: null,
        qty: 1,
        reason: null,
      },
      "Informe o motivo do material extra.",
    ],
  ])("rejeita payload bulk adulterado %# sem lançar", async (input, error) => {
    await expect(unsafeRegisterExtraBulk(input)).resolves.toEqual({ ok: false, error });
    expect(mocks.getCurrentUserContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejeita usuário não autenticado antes de criar um cliente Supabase", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);

    await expect(
      registerExtraSerializedMaterial(EXTRA_EVENT_ID, "QR-1", "Reserva")
    ).resolves.toEqual({ ok: false, error: "Não autenticado" });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejeita admin mesmo que a action seja chamada diretamente", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      ...WAREHOUSE_CONTEXT,
      role: "admin",
    });

    await expect(
      registerExtraBulkMaterial({
        eventId: EXTRA_EVENT_ID,
        equipmentId: EXTRA_EQUIPMENT_ID,
        variantId: null,
        qty: 1,
        reason: "Reserva",
      })
    ).resolves.toEqual({
      ok: false,
      error: "Apenas a equipe de almoxarifado pode registrar material extra.",
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejeita warehouse sem vínculo real com a OS", async () => {
    mocks.teamMemberHasEventAccess.mockResolvedValue(false);

    await expect(
      registerExtraSerializedMaterial(EXTRA_EVENT_ID, "QR-1", "Reserva")
    ).resolves.toEqual({ ok: false, error: "Sem acesso a esta OS." });
    expect(mocks.getTeamMemberByUserId).toHaveBeenCalledWith(
      "warehouse-user-1",
      "org-1"
    );
    expect(mocks.teamMemberHasEventAccess).toHaveBeenCalledWith("member-1", EXTRA_EVENT_ID);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejeita warehouse sem organização primária", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      ...WAREHOUSE_CONTEXT,
      primaryOrganization: null,
    });

    await expect(
      registerExtraSerializedMaterial(EXTRA_EVENT_ID, "QR-1", "Reserva")
    ).resolves.toEqual({ ok: false, error: "Sem acesso a esta OS." });
    expect(mocks.getTeamMemberByUserId).not.toHaveBeenCalled();
  });

  it("rejeita motivo vazio depois de normalizar espaços", async () => {
    await expect(
      registerExtraSerializedMaterial(EXTRA_EVENT_ID, "QR-1", "   ")
    ).resolves.toEqual({
      ok: false,
      error: "Informe o motivo do material extra.",
    });
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejeita quantidade bulk inválida: %s",
    async (qty) => {
      await expect(
        registerExtraBulkMaterial({
          eventId: EXTRA_EVENT_ID,
          equipmentId: EXTRA_EQUIPMENT_ID,
          variantId: null,
          qty,
          reason: "Reserva",
        })
      ).resolves.toEqual({ ok: false, error: "Quantidade inválida." });
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it("resolve o QR normalizado, chama a RPC serializada uma vez e retorna a linha", async () => {
    const single = rpcResponse({
      event_equipment_id: "event-equipment-1",
      equipment_id: "equipment-1",
      equipment_unit_id: "unit-1",
      qty: 4,
      extra_qty: 1,
    });

    const result = await registerExtraSerializedMaterial(
      `  ${EXTRA_EVENT_ID}  `,
      "  QR-123  ",
      "  Cliente pediu reforço  "
    );

    expect(mocks.getEquipmentUnitByQrCode).toHaveBeenCalledOnce();
    expect(mocks.getEquipmentUnitByQrCode).toHaveBeenCalledWith("QR-123");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("register_extra_serialized_material", {
      p_event_id: EXTRA_EVENT_ID,
      p_equipment_unit_id: "unit-1",
      p_reason: "Cliente pediu reforço",
    });
    expect(single).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ok: true,
      unitId: "unit-1",
      equipmentId: "equipment-1",
      eventEquipmentId: "event-equipment-1",
      qty: 4,
      extraQty: 1,
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      [`/scan/load/${EXTRA_EVENT_ID}`],
      [`/scan/return/${EXTRA_EVENT_ID}`],
      [`/events/${EXTRA_EVENT_ID}`],
    ]);
  });

  it("chama a RPC bulk com quantidade inteira, variante nullable e strings normalizadas", async () => {
    rpcResponse({
      event_equipment_id: "event-equipment-2",
      equipment_id: "equipment-2",
      qty: 7,
      extra_qty: 3,
      bulk_loaded_qty: 3,
    });

    const result = await registerExtraBulkMaterial({
      eventId: `  ${EXTRA_EVENT_ID} `,
      equipmentId: ` ${EXTRA_EQUIPMENT_ID}  `,
      variantId: null,
      qty: 3,
      reason: "  Reserva técnica ",
    });

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("register_extra_bulk_material", {
      p_event_id: EXTRA_EVENT_ID,
      p_equipment_id: EXTRA_EQUIPMENT_ID,
      p_variant_id: null,
      p_qty: 3,
      p_reason: "Reserva técnica",
    });
    expect(result).toEqual({
      ok: true,
      equipmentId: "equipment-2",
      eventEquipmentId: "event-equipment-2",
      qty: 7,
      extraQty: 3,
    });
  });

  it("normaliza variante bulk não nula", async () => {
    rpcResponse({
      event_equipment_id: "event-equipment-2",
      equipment_id: "equipment-2",
      qty: 2,
      extra_qty: 1,
    });

    await registerExtraBulkMaterial({
      eventId: EXTRA_EVENT_ID,
      equipmentId: EXTRA_EQUIPMENT_ID,
      variantId: `  ${EXTRA_VARIANT_ID}  `,
      qty: 1,
      reason: "Reserva",
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "register_extra_bulk_material",
      expect.objectContaining({ p_variant_id: EXTRA_VARIANT_ID })
    );
  });

  it.each([
    ["EXTRA_NOT_AUTHENTICATED", "Sua sessão expirou. Entre novamente."],
    ["EXTRA_FORBIDDEN", "Sem acesso a esta OS."],
    ["EXTRA_EVENT_STATE", "Esta OS não permite registrar material extra."],
    ["EXTRA_REASON_REQUIRED", "Informe o motivo do material extra."],
    ["EXTRA_NOT_AVAILABLE", "Material indisponível."],
    ["EXTRA_UNIT_CONFLICT", "Esta unidade já está carregada em outra OS."],
  ])("traduz o código estável %s", async (code, message) => {
    rpcResponse(null, { message: code });

    await expect(
      registerExtraSerializedMaterial(EXTRA_EVENT_ID, "QR-1", "Reserva")
    ).resolves.toEqual({ ok: false, error: message });
  });

  it("preserva mensagem desconhecida retornada pela RPC", async () => {
    rpcResponse(null, { message: "database unavailable" });

    await expect(
      registerExtraSerializedMaterial(EXTRA_EVENT_ID, "QR-1", "Reserva")
    ).resolves.toEqual({ ok: false, error: "database unavailable" });
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
