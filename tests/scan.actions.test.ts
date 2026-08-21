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
  finalizeReturn,
  manualReturnBulk,
  manualUnreturnBulk,
  registerExtraBulkMaterial,
  registerExtraSerializedMaterialByUnitId,
  registerExtraSerializedMaterial,
} from "@/app/(dashboard)/scan/actions";

const VALID_UNIT = {
  id: "unit-1",
  equipmentId: "eq-A",
  organizationId: "org-1",
  variantId: null,
  status: "available" as const,
};

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
      variant_id: EXTRA_VARIANT_ID,
      equipment_unit_id: "unit-1",
      qty: 4,
      extra_qty: 1,
      added_qty: 1,
      extra_log_id: "log-1",
      extra_log_created_at: "2026-08-20T18:00:00.000Z",
      extra_log_added_by: "warehouse-user-1",
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
      variantId: EXTRA_VARIANT_ID,
      eventEquipmentId: "event-equipment-1",
      qty: 4,
      extraQty: 1,
      addedQty: 1,
      logId: "log-1",
      addedAt: "2026-08-20T18:00:00.000Z",
      addedBy: "warehouse-user-1",
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      [`/scan/load/${EXTRA_EVENT_ID}`],
      [`/scan/return/${EXTRA_EVENT_ID}`],
      [`/events/${EXTRA_EVENT_ID}`],
    ]);
  });

  it("retorna addedQty zero e nenhum log quando a RPC serializada é idempotente", async () => {
    rpcResponse({
      event_equipment_id: "event-equipment-1",
      equipment_id: "equipment-1",
      variant_id: EXTRA_VARIANT_ID,
      equipment_unit_id: "unit-1",
      qty: 4,
      extra_qty: 1,
      added_qty: 0,
      extra_log_id: null,
      extra_log_created_at: null,
      extra_log_added_by: null,
    });

    await expect(
      registerExtraSerializedMaterial(EXTRA_EVENT_ID, "QR-123", "Repetido")
    ).resolves.toEqual({
      ok: true,
      unitId: "unit-1",
      equipmentId: "equipment-1",
      variantId: EXTRA_VARIANT_ID,
      eventEquipmentId: "event-equipment-1",
      qty: 4,
      extraQty: 1,
      addedQty: 0,
    });
  });

  it("registra unidade serializada manual pela mesma RPC e autorização", async () => {
    rpcResponse({
      event_equipment_id: "event-equipment-1",
      equipment_id: EXTRA_EQUIPMENT_ID,
      variant_id: EXTRA_VARIANT_ID,
      equipment_unit_id: "44444444-4444-4444-8444-444444444444",
      qty: 2,
      extra_qty: 1,
      added_qty: 1,
      extra_log_id: "log-manual",
      extra_log_created_at: "2026-08-20T19:00:00.000Z",
      extra_log_added_by: "warehouse-user-1",
    });

    const result = await registerExtraSerializedMaterialByUnitId(
      EXTRA_EVENT_ID,
      "44444444-4444-4444-8444-444444444444",
      "Etiqueta ilegível"
    );

    expect(mocks.getCurrentUserContext).toHaveBeenCalledOnce();
    expect(mocks.teamMemberHasEventAccess).toHaveBeenCalledWith("member-1", EXTRA_EVENT_ID);
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("register_extra_serialized_material", {
      p_event_id: EXTRA_EVENT_ID,
      p_equipment_unit_id: "44444444-4444-4444-8444-444444444444",
      p_reason: "Etiqueta ilegível",
    });
    expect(result).toMatchObject({
      ok: true,
      unitId: "44444444-4444-4444-8444-444444444444",
      variantId: EXTRA_VARIANT_ID,
      addedQty: 1,
      logId: "log-manual",
    });
  });

  it("rejeita unidade manual malformada antes da autorização ou RPC", async () => {
    await expect(
      registerExtraSerializedMaterialByUnitId(EXTRA_EVENT_ID, "unit-malformada", "Reserva")
    ).resolves.toEqual({ ok: false, error: "Material indisponível." });

    expect(mocks.getCurrentUserContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejeita unidade manual quando warehouse não está vinculado à OS", async () => {
    mocks.teamMemberHasEventAccess.mockResolvedValue(false);

    await expect(
      registerExtraSerializedMaterialByUnitId(
        EXTRA_EVENT_ID,
        "44444444-4444-4444-8444-444444444444",
        "Reserva"
      )
    ).resolves.toEqual({ ok: false, error: "Sem acesso a esta OS." });

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("chama a RPC bulk com quantidade inteira, variante nullable e strings normalizadas", async () => {
    rpcResponse({
      event_equipment_id: "event-equipment-2",
      equipment_id: "equipment-2",
      variant_id: null,
      qty: 7,
      extra_qty: 3,
      bulk_loaded_qty: 3,
      added_qty: 3,
      extra_log_id: "log-bulk",
      extra_log_created_at: "2026-08-20T19:30:00.000Z",
      extra_log_added_by: "warehouse-user-1",
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
      variantId: null,
      eventEquipmentId: "event-equipment-2",
      qty: 7,
      extraQty: 3,
      addedQty: 3,
      logId: "log-bulk",
      addedAt: "2026-08-20T19:30:00.000Z",
      addedBy: "warehouse-user-1",
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

const BULK_EVENT_ID = "55555555-5555-4555-8555-555555555555";
const BULK_EVENT_EQUIPMENT_ID = "66666666-6666-4666-8666-666666666666";

const unsafeManualReturnBulk = manualReturnBulk as unknown as (
  eventId: unknown,
  eventEquipmentId: unknown,
  qty: unknown
) => Promise<unknown>;

describe("devolução manual de material em lote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReset();
    mocks.getCurrentUserContext.mockResolvedValue(WAREHOUSE_CONTEXT);
    mocks.getTeamMemberByUserId.mockResolvedValue({ id: "member-1" });
    mocks.teamMemberHasEventAccess.mockResolvedValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejeita delta inválido antes de autorizar ou chamar a RPC: %s",
    async (qty) => {
      await expect(
        unsafeManualReturnBulk(BULK_EVENT_ID, BULK_EVENT_EQUIPMENT_ID, qty)
      ).resolves.toEqual({ ok: false, error: "Quantidade de devolução inválida." });
      expect(mocks.getCurrentUserContext).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it("rejeita usuário não autenticado antes de criar o cliente Supabase", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);

    await expect(
      manualReturnBulk(BULK_EVENT_ID, BULK_EVENT_EQUIPMENT_ID, 1)
    ).resolves.toEqual({ ok: false, error: "Não autenticado" });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejeita papel diferente de warehouse em chamada direta", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ ...WAREHOUSE_CONTEXT, role: "admin" });

    await expect(
      manualReturnBulk(BULK_EVENT_ID, BULK_EVENT_EQUIPMENT_ID, 1)
    ).resolves.toEqual({
      ok: false,
      error: "Apenas a equipe de almoxarifado pode registrar material extra.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejeita warehouse sem vínculo com a OS", async () => {
    mocks.teamMemberHasEventAccess.mockResolvedValue(false);

    await expect(
      manualReturnBulk(BULK_EVENT_ID, BULK_EVENT_EQUIPMENT_ID, 1)
    ).resolves.toEqual({ ok: false, error: "Sem acesso a esta OS." });
    expect(mocks.teamMemberHasEventAccess).toHaveBeenCalledWith("member-1", BULK_EVENT_ID);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("devolve lote pela RPC com evento, linha e delta exatos", async () => {
    mocks.rpc.mockResolvedValue({ data: 1, error: null });

    await expect(
      manualReturnBulk(BULK_EVENT_ID, BULK_EVENT_EQUIPMENT_ID, 1)
    ).resolves.toEqual({
      ok: true,
      eventEquipmentId: BULK_EVENT_EQUIPMENT_ID,
      returnedUnitsCount: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("return_bulk_material", {
      p_event_id: BULK_EVENT_ID,
      p_event_equipment_id: BULK_EVENT_EQUIPMENT_ID,
      p_qty: 1,
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      [`/scan/return/${BULK_EVENT_ID}`],
      [`/events/${BULK_EVENT_ID}`],
    ]);
  });

  it("desfaz devolução bulk pela RPC e retorna a nova contagem", async () => {
    mocks.rpc.mockResolvedValue({ data: 4, error: null });

    await expect(
      manualUnreturnBulk(BULK_EVENT_ID, BULK_EVENT_EQUIPMENT_ID, 1)
    ).resolves.toEqual({
      ok: true,
      eventEquipmentId: BULK_EVENT_EQUIPMENT_ID,
      returnedUnitsCount: 4,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("unreturn_bulk_material", {
      p_event_id: BULK_EVENT_ID,
      p_event_equipment_id: BULK_EVENT_EQUIPMENT_ID,
      p_qty: 1,
    });
  });

  it("impede devolução acima de bulk_loaded_qty quando a RPC rejeita o limite", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "EXTRA_RETURN_RANGE" } });

    await expect(
      manualReturnBulk(BULK_EVENT_ID, BULK_EVENT_EQUIPMENT_ID, 1)
    ).resolves.toEqual({ ok: false, error: "Quantidade de devolução inválida." });
  });

  it("impede desfazer abaixo de zero quando a RPC rejeita o limite", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "EXTRA_RETURN_RANGE" } });

    await expect(
      manualUnreturnBulk(BULK_EVENT_ID, BULK_EVENT_EQUIPMENT_ID, 1)
    ).resolves.toEqual({ ok: false, error: "Quantidade de devolução inválida." });
  });
});

describe("finalizeReturn — autorização e conclusão atômica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReset();
    mocks.getCurrentUserContext.mockResolvedValue({
      ...WAREHOUSE_CONTEXT,
      role: "admin",
    });
    mocks.getTeamMemberByUserId.mockResolvedValue({ id: "member-1" });
    mocks.teamMemberHasEventAccess.mockResolvedValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("rejeita usuário não autenticado antes de qualquer cliente privilegiado", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);

    await expect(finalizeReturn("evt-1")).resolves.toEqual({
      ok: false,
      error: "Não autenticado",
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejeita papel sem permissão", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      ...WAREHOUSE_CONTEXT,
      role: "employee",
    });

    await expect(finalizeReturn("evt-1")).resolves.toEqual({
      ok: false,
      error: "Sem acesso a esta OS.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejeita warehouse sem vínculo com a OS", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(WAREHOUSE_CONTEXT);
    mocks.teamMemberHasEventAccess.mockResolvedValue(false);

    await expect(finalizeReturn("evt-1")).resolves.toEqual({
      ok: false,
      error: "Sem acesso a esta OS.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("delega a decisão e a conclusão à RPC transacional sem usar admin client", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(finalizeReturn("evt-1")).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("finalize_event_return", {
      p_event_id: "evt-1",
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/scan/return/evt-1"],
      ["/events/evt-1"],
    ]);
  });

  it("não permite conclusão cross-tenant quando a RPC rejeita a organização", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "EXTRA_FORBIDDEN" } });

    await expect(finalizeReturn("evt-1")).resolves.toEqual({
      ok: false,
      error: "Sem acesso a esta OS.",
    });
  });

  it("traduz pendência detectada atomicamente pela RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "EXTRA_RETURN_PENDING" },
    });

    await expect(finalizeReturn("evt-1")).resolves.toEqual({
      ok: false,
      error: "Ainda há equipamentos carregados pendentes de devolução.",
    });
  });
});
