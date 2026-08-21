import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentAuthUser: vi.fn(),
  getCurrentUserContext: vi.fn(),
  getEquipmentUnitByQrCode: vi.fn(),
  getTeamMemberByUserId: vi.fn(),
  teamMemberHasEventAccess: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentAuthUser: mocks.getCurrentAuthUser,
  getCurrentUserContext: mocks.getCurrentUserContext,
}));

vi.mock("@/lib/inventory", async () => ({
  getEquipmentUnitByQrCode: mocks.getEquipmentUnitByQrCode,
}));

vi.mock("@/lib/team", () => ({
  getTeamMemberByUserId: mocks.getTeamMemberByUserId,
  teamMemberHasEventAccess: mocks.teamMemberHasEventAccess,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  finalizeLoad,
  finalizeReturn,
  manualLoadUnit,
  manualReturnDefectUnit,
  manualReturnUnit,
  manualUnreturnUnit,
  manualUnloadUnit,
  scanLoadUnit,
  scanReturnDefectUnit,
  scanReturnUnit,
  unscanLoadUnit,
  unscanReturnUnit,
} from "@/app/(dashboard)/scan/actions";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_EQUIPMENT_ID = "22222222-2222-4222-8222-222222222222";

const ADMIN_CONTEXT = {
  userId: "user-1",
  role: "admin",
  primaryOrganization: { id: "org-1" },
};

type UnsafeSerializedAction = (...args: unknown[]) => Promise<unknown>;

const unsafeSerializedActions: Array<[
  string,
  UnsafeSerializedAction,
  unknown[],
]> = [
  ["scanLoadUnit", scanLoadUnit as UnsafeSerializedAction, ["QR-1"]],
  ["unscanLoadUnit", unscanLoadUnit as UnsafeSerializedAction, ["QR-1"]],
  ["scanReturnUnit", scanReturnUnit as UnsafeSerializedAction, ["QR-1"]],
  ["unscanReturnUnit", unscanReturnUnit as UnsafeSerializedAction, ["QR-1"]],
  [
    "scanReturnDefectUnit",
    scanReturnDefectUnit as UnsafeSerializedAction,
    ["QR-1", "damaged", "nota"],
  ],
  ["manualLoadUnit", manualLoadUnit as UnsafeSerializedAction, [EVENT_EQUIPMENT_ID]],
  ["manualUnloadUnit", manualUnloadUnit as UnsafeSerializedAction, [EVENT_EQUIPMENT_ID]],
  ["manualReturnUnit", manualReturnUnit as UnsafeSerializedAction, [EVENT_EQUIPMENT_ID]],
  ["manualUnreturnUnit", manualUnreturnUnit as UnsafeSerializedAction, [EVENT_EQUIPMENT_ID]],
  [
    "manualReturnDefectUnit",
    manualReturnDefectUnit as UnsafeSerializedAction,
    [EVENT_EQUIPMENT_ID, "lost", "nota"],
  ],
  ["finalizeLoad", finalizeLoad as UnsafeSerializedAction, []],
  ["finalizeReturn", finalizeReturn as UnsafeSerializedAction, []],
];

function emptyAdminClient() {
  const result = { data: null, error: null, count: 0 };
  const chain: Record<string, unknown> = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: typeof result) => unknown) => resolve(result);
      }
      return () => chain;
    },
  });
  return { from: vi.fn(() => chain) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockReset();
  mocks.getCurrentAuthUser.mockResolvedValue({ id: "user-1" });
  mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
  mocks.getTeamMemberByUserId.mockResolvedValue({ id: "member-1" });
  mocks.teamMemberHasEventAccess.mockResolvedValue(true);
  mocks.createSupabaseServerClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.createSupabaseAdminClient.mockReturnValue(emptyAdminClient());
  mocks.getEquipmentUnitByQrCode.mockResolvedValue(null);
});

describe("actions serializadas — validação runtime", () => {
  it.each(unsafeSerializedActions)(
    "%s rejeita eventId adulterado sem autorizar nem chamar RPC",
    async (_label, action, remainingArgs) => {
      for (const invalidEventId of [null, undefined, 42, {}, [], "", "event-malformado"]) {
        await expect(action(invalidEventId, ...remainingArgs)).resolves.toEqual({
          ok: false,
          error: "Sem acesso a esta OS.",
        });
      }

      expect(mocks.getCurrentUserContext).not.toHaveBeenCalled();
      expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["scanLoadUnit", scanLoadUnit as UnsafeSerializedAction, []],
    ["unscanLoadUnit", unscanLoadUnit as UnsafeSerializedAction, []],
    ["scanReturnUnit", scanReturnUnit as UnsafeSerializedAction, []],
    ["unscanReturnUnit", unscanReturnUnit as UnsafeSerializedAction, []],
    [
      "scanReturnDefectUnit",
      scanReturnDefectUnit as UnsafeSerializedAction,
      ["damaged", "nota"],
    ],
  ])("%s rejeita QR adulterado sem TypeError ou RPC", async (_label, action, suffix) => {
    for (const invalidQr of [null, undefined, 42, {}, [], "   "]) {
      await expect(action(EVENT_ID, invalidQr, ...suffix)).resolves.toEqual({
        ok: false,
        error: "QR vazio",
      });
    }
    expect(mocks.getCurrentUserContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["manualLoadUnit", manualLoadUnit as UnsafeSerializedAction, []],
    ["manualUnloadUnit", manualUnloadUnit as UnsafeSerializedAction, []],
    ["manualReturnUnit", manualReturnUnit as UnsafeSerializedAction, []],
    ["manualUnreturnUnit", manualUnreturnUnit as UnsafeSerializedAction, []],
    [
      "manualReturnDefectUnit",
      manualReturnDefectUnit as UnsafeSerializedAction,
      ["lost", "nota"],
    ],
  ])("%s rejeita eventEquipmentId não UUID sem RPC", async (_label, action, suffix) => {
    for (const invalidId of [null, undefined, 42, {}, [], "", "ee-malformado"]) {
      await expect(action(EVENT_ID, invalidId, ...suffix)).resolves.toEqual({
        ok: false,
        error: "Sem acesso a esta OS.",
      });
    }
    expect(mocks.getCurrentUserContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [
      "scanReturnDefectUnit",
      scanReturnDefectUnit as UnsafeSerializedAction,
      [EVENT_ID, "QR-1"],
    ],
    [
      "manualReturnDefectUnit",
      manualReturnDefectUnit as UnsafeSerializedAction,
      [EVENT_ID, EVENT_EQUIPMENT_ID],
    ],
  ])("%s valida condition e note adulterados", async (_label, action, prefix) => {
    for (const invalidCondition of [null, undefined, 42, {}, [], "ok"]) {
      await expect(action(...prefix, invalidCondition, "nota")).resolves.toEqual({
        ok: false,
        error: "Condição de devolução inválida.",
      });
    }
    for (const invalidNote of [null, undefined, 42, {}, []]) {
      await expect(action(...prefix, "damaged", invalidNote)).resolves.toEqual({
        ok: false,
        error: "Dados de devolução inválidos.",
      });
    }
    expect(mocks.getCurrentUserContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("actions serializadas de retorno — fronteira segura", () => {
  it("autoriza antes de qualquer lookup e rejeita papel sem acesso", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ ...ADMIN_CONTEXT, role: "finance" });

    await expect(scanReturnUnit(EVENT_ID, "QR-SECRET")).resolves.toEqual({
      ok: false,
      error: "Sem acesso a esta OS.",
    });
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["QR", () => scanReturnUnit(EVENT_ID, "QR-1")],
    ["manual", () => manualReturnUnit(EVENT_ID, EVENT_EQUIPMENT_ID)],
    ["defeito QR", () => scanReturnDefectUnit(EVENT_ID, "QR-1", "damaged", "nota")],
    ["defeito manual", () => manualReturnDefectUnit(EVENT_ID, EVENT_EQUIPMENT_ID, "lost", "nota")],
    ["desretorno QR", () => unscanReturnUnit(EVENT_ID, "QR-1")],
    ["desretorno manual", () => manualUnreturnUnit(EVENT_ID, EVENT_EQUIPMENT_ID)],
  ])("rejeita finance antes da mutação: %s", async (_label, invoke) => {
    mocks.getCurrentUserContext.mockResolvedValue({ ...ADMIN_CONTEXT, role: "finance" });

    await expect(invoke()).resolves.toEqual({
      ok: false,
      error: "Sem acesso a esta OS.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
  });

  it("retorna por QR somente pela RPC tenant-scoped e entrega contagem absoluta", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        event_equipment_id: EVENT_EQUIPMENT_ID,
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        returned_units_count: 2,
      },
      error: null,
    });

    await expect(scanReturnUnit(EVENT_ID, " QR-1 ")).resolves.toEqual({
      ok: true,
      eventEquipmentId: EVENT_EQUIPMENT_ID,
      equipmentId: "equipment-1",
      unitId: "unit-1",
      returnedUnitsCount: 2,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("return_serialized_material", {
      p_event_id: EVENT_ID,
      p_event_equipment_id: null,
      p_qr_code: "QR-1",
      p_condition: "ok",
      p_note: null,
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
  });

  it("retorna manualmente pela mesma RPC segura", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        event_equipment_id: EVENT_EQUIPMENT_ID,
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        returned_units_count: 1,
      },
      error: null,
    });

    await expect(
      manualReturnUnit(` ${EVENT_ID} `, ` ${EVENT_EQUIPMENT_ID} `)
    ).resolves.toMatchObject({
      ok: true,
      eventEquipmentId: EVENT_EQUIPMENT_ID,
      returnedUnitsCount: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("return_serialized_material", {
      p_event_id: EVENT_ID,
      p_event_equipment_id: EVENT_EQUIPMENT_ID,
      p_qr_code: null,
      p_condition: "ok",
      p_note: null,
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("registra defeito por QR dentro da mesma transação segura", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        event_equipment_id: EVENT_EQUIPMENT_ID,
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        returned_units_count: 2,
      },
      error: null,
    });

    await expect(
      scanReturnDefectUnit(EVENT_ID, " QR-1 ", "damaged", "  Conector  ")
    ).resolves.toMatchObject({ ok: true, returnedUnitsCount: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith("return_serialized_material", {
      p_event_id: EVENT_ID,
      p_event_equipment_id: null,
      p_qr_code: "QR-1",
      p_condition: "damaged",
      p_note: "Conector",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/maintenance");
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("registra defeito manual sem lookup global nem service role", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        event_equipment_id: EVENT_EQUIPMENT_ID,
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        returned_units_count: 1,
      },
      error: null,
    });

    await expect(
      manualReturnDefectUnit(EVENT_ID, EVENT_EQUIPMENT_ID, "lost", "sem retorno")
    ).resolves.toMatchObject({ ok: true, unitId: "unit-1", returnedUnitsCount: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("return_serialized_material", {
      p_event_id: EVENT_ID,
      p_event_equipment_id: EVENT_EQUIPMENT_ID,
      p_qr_code: null,
      p_condition: "lost",
      p_note: "sem retorno",
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("desfaz por QR sem resolver unidade fora do tenant", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        event_equipment_id: EVENT_EQUIPMENT_ID,
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        returned_units_count: 0,
      },
      error: null,
    });

    await expect(unscanReturnUnit(EVENT_ID, " QR-1 ")).resolves.toMatchObject({
      ok: true,
      returnedUnitsCount: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("unreturn_serialized_material_by_qr", {
      p_event_id: EVENT_ID,
      p_qr_code: "QR-1",
    });
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("traduz rejeição cross-tenant autoritativa da RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "EXTRA_FORBIDDEN" } });

    await expect(manualReturnUnit(EVENT_ID, EVENT_EQUIPMENT_ID)).resolves.toEqual({
      ok: false,
      error: "Sem acesso a esta OS.",
    });
  });
});

describe("actions serializadas de carga — protocolo transacional", () => {
  it.each([
    ["carga QR", () => scanLoadUnit(EVENT_ID, "QR-1")],
    ["carga manual", () => manualLoadUnit(EVENT_ID, EVENT_EQUIPMENT_ID)],
    ["descarga QR", () => unscanLoadUnit(EVENT_ID, "QR-1")],
    ["descarga manual", () => manualUnloadUnit(EVENT_ID, EVENT_EQUIPMENT_ID)],
    ["finalização", () => finalizeLoad(EVENT_ID)],
  ])("rejeita finance antes da mutação: %s", async (_label, invoke) => {
    mocks.getCurrentUserContext.mockResolvedValue({ ...ADMIN_CONTEXT, role: "finance" });

    await expect(invoke()).resolves.toEqual({
      ok: false,
      error: "Sem acesso a esta OS.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
  });

  it("warehouse sem vínculo é rejeitado antes da RPC", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ ...ADMIN_CONTEXT, role: "warehouse" });
    mocks.teamMemberHasEventAccess.mockResolvedValue(false);

    await expect(scanLoadUnit(EVENT_ID, "QR-1")).resolves.toEqual({
      ok: false,
      error: "Sem acesso a esta OS.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
  });

  it("carrega por QR dentro da RPC que trava e revalida a OS", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        event_equipment_id: EVENT_EQUIPMENT_ID,
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        loaded_units_count: 2,
      },
      error: null,
    });

    await expect(scanLoadUnit(EVENT_ID, " QR-1 ")).resolves.toMatchObject({
      ok: true,
      eventEquipmentId: EVENT_EQUIPMENT_ID,
      loadedUnitsCount: 2,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("load_serialized_material", {
      p_event_id: EVENT_ID,
      p_event_equipment_id: null,
      p_qr_code: "QR-1",
    });
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("carga e descarga manuais usam seletores tenant-scoped", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          event_equipment_id: EVENT_EQUIPMENT_ID,
          equipment_id: "equipment-1",
          equipment_unit_id: "unit-1",
          loaded_units_count: 2,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          event_equipment_id: EVENT_EQUIPMENT_ID,
          equipment_id: "equipment-1",
          equipment_unit_id: "unit-1",
          loaded_units_count: 1,
        },
        error: null,
      });

    await expect(manualLoadUnit(EVENT_ID, EVENT_EQUIPMENT_ID)).resolves.toMatchObject({
      ok: true,
      loadedUnitsCount: 2,
    });
    await expect(manualUnloadUnit(EVENT_ID, EVENT_EQUIPMENT_ID)).resolves.toMatchObject({
      ok: true,
      loadedUnitsCount: 1,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "load_serialized_material", {
      p_event_id: EVENT_ID,
      p_event_equipment_id: EVENT_EQUIPMENT_ID,
      p_qr_code: null,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "unload_serialized_material", {
      p_event_id: EVENT_ID,
      p_event_equipment_id: EVENT_EQUIPMENT_ID,
      p_qr_code: null,
    });
  });

  it("descarrega por QR sem lookup global", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        event_equipment_id: EVENT_EQUIPMENT_ID,
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        loaded_units_count: 0,
      },
      error: null,
    });

    await expect(unscanLoadUnit(EVENT_ID, " QR-1 ")).resolves.toMatchObject({
      ok: true,
      loadedUnitsCount: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("unload_serialized_material", {
      p_event_id: EVENT_ID,
      p_event_equipment_id: null,
      p_qr_code: "QR-1",
    });
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
  });

  it("não carrega depois que a RPC revalida a OS concluída sob lock", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "EXTRA_EVENT_STATE" } });

    await expect(scanLoadUnit(EVENT_ID, "QR-1")).resolves.toEqual({
      ok: false,
      error: "Esta OS não permite alterar a carga.",
    });
  });

  it("finaliza carga sem service role pela RPC condicional", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(finalizeLoad(EVENT_ID)).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("finalize_event_load", {
      p_event_id: EVENT_ID,
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
