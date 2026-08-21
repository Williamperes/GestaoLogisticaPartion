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

const ADMIN_CONTEXT = {
  userId: "user-1",
  role: "admin",
  primaryOrganization: { id: "org-1" },
};

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

describe("actions serializadas de retorno — fronteira segura", () => {
  it("autoriza antes de qualquer lookup e rejeita papel sem acesso", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ ...ADMIN_CONTEXT, role: "finance" });

    await expect(scanReturnUnit("event-1", "QR-SECRET")).resolves.toEqual({
      ok: false,
      error: "Sem acesso a esta OS.",
    });
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["QR", () => scanReturnUnit("event-1", "QR-1")],
    ["manual", () => manualReturnUnit("event-1", "ee-1")],
    ["defeito QR", () => scanReturnDefectUnit("event-1", "QR-1", "damaged", "nota")],
    ["defeito manual", () => manualReturnDefectUnit("event-1", "ee-1", "lost", "nota")],
    ["desretorno QR", () => unscanReturnUnit("event-1", "QR-1")],
    ["desretorno manual", () => manualUnreturnUnit("event-1", "ee-1")],
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
        event_equipment_id: "ee-1",
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        returned_units_count: 2,
      },
      error: null,
    });

    await expect(scanReturnUnit("event-1", " QR-1 ")).resolves.toEqual({
      ok: true,
      eventEquipmentId: "ee-1",
      equipmentId: "equipment-1",
      unitId: "unit-1",
      returnedUnitsCount: 2,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("return_serialized_material", {
      p_event_id: "event-1",
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
        event_equipment_id: "ee-1",
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        returned_units_count: 1,
      },
      error: null,
    });

    await expect(manualReturnUnit("event-1", "ee-1")).resolves.toMatchObject({
      ok: true,
      eventEquipmentId: "ee-1",
      returnedUnitsCount: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("return_serialized_material", {
      p_event_id: "event-1",
      p_event_equipment_id: "ee-1",
      p_qr_code: null,
      p_condition: "ok",
      p_note: null,
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("registra defeito por QR dentro da mesma transação segura", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        event_equipment_id: "ee-1",
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        returned_units_count: 2,
      },
      error: null,
    });

    await expect(
      scanReturnDefectUnit("event-1", " QR-1 ", "damaged", "  Conector  ")
    ).resolves.toMatchObject({ ok: true, returnedUnitsCount: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith("return_serialized_material", {
      p_event_id: "event-1",
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
        event_equipment_id: "ee-1",
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        returned_units_count: 1,
      },
      error: null,
    });

    await expect(
      manualReturnDefectUnit("event-1", "ee-1", "lost", "sem retorno")
    ).resolves.toMatchObject({ ok: true, unitId: "unit-1", returnedUnitsCount: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("return_serialized_material", {
      p_event_id: "event-1",
      p_event_equipment_id: "ee-1",
      p_qr_code: null,
      p_condition: "lost",
      p_note: "sem retorno",
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("desfaz por QR sem resolver unidade fora do tenant", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        event_equipment_id: "ee-1",
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        returned_units_count: 0,
      },
      error: null,
    });

    await expect(unscanReturnUnit("event-1", " QR-1 ")).resolves.toMatchObject({
      ok: true,
      returnedUnitsCount: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("unreturn_serialized_material_by_qr", {
      p_event_id: "event-1",
      p_qr_code: "QR-1",
    });
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("traduz rejeição cross-tenant autoritativa da RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "EXTRA_FORBIDDEN" } });

    await expect(manualReturnUnit("foreign-event", "foreign-ee")).resolves.toEqual({
      ok: false,
      error: "Sem acesso a esta OS.",
    });
  });
});

describe("actions serializadas de carga — protocolo transacional", () => {
  it.each([
    ["carga QR", () => scanLoadUnit("event-1", "QR-1")],
    ["carga manual", () => manualLoadUnit("event-1", "ee-1")],
    ["descarga QR", () => unscanLoadUnit("event-1", "QR-1")],
    ["descarga manual", () => manualUnloadUnit("event-1", "ee-1")],
    ["finalização", () => finalizeLoad("event-1")],
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

    await expect(scanLoadUnit("event-1", "QR-1")).resolves.toEqual({
      ok: false,
      error: "Sem acesso a esta OS.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
  });

  it("carrega por QR dentro da RPC que trava e revalida a OS", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        event_equipment_id: "ee-1",
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        loaded_units_count: 2,
      },
      error: null,
    });

    await expect(scanLoadUnit("event-1", " QR-1 ")).resolves.toMatchObject({
      ok: true,
      eventEquipmentId: "ee-1",
      loadedUnitsCount: 2,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("load_serialized_material", {
      p_event_id: "event-1",
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
          event_equipment_id: "ee-1",
          equipment_id: "equipment-1",
          equipment_unit_id: "unit-1",
          loaded_units_count: 2,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          event_equipment_id: "ee-1",
          equipment_id: "equipment-1",
          equipment_unit_id: "unit-1",
          loaded_units_count: 1,
        },
        error: null,
      });

    await expect(manualLoadUnit("event-1", "ee-1")).resolves.toMatchObject({
      ok: true,
      loadedUnitsCount: 2,
    });
    await expect(manualUnloadUnit("event-1", "ee-1")).resolves.toMatchObject({
      ok: true,
      loadedUnitsCount: 1,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "load_serialized_material", {
      p_event_id: "event-1",
      p_event_equipment_id: "ee-1",
      p_qr_code: null,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "unload_serialized_material", {
      p_event_id: "event-1",
      p_event_equipment_id: "ee-1",
      p_qr_code: null,
    });
  });

  it("descarrega por QR sem lookup global", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        event_equipment_id: "ee-1",
        equipment_id: "equipment-1",
        equipment_unit_id: "unit-1",
        loaded_units_count: 0,
      },
      error: null,
    });

    await expect(unscanLoadUnit("event-1", " QR-1 ")).resolves.toMatchObject({
      ok: true,
      loadedUnitsCount: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("unload_serialized_material", {
      p_event_id: "event-1",
      p_event_equipment_id: null,
      p_qr_code: "QR-1",
    });
    expect(mocks.getEquipmentUnitByQrCode).not.toHaveBeenCalled();
  });

  it("não carrega depois que a RPC revalida a OS concluída sob lock", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "EXTRA_EVENT_STATE" } });

    await expect(scanLoadUnit("event-1", "QR-1")).resolves.toEqual({
      ok: false,
      error: "Esta OS não permite alterar a carga.",
    });
  });

  it("finaliza carga sem service role pela RPC condicional", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(finalizeLoad("event-1")).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("finalize_event_load", {
      p_event_id: "event-1",
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
