"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getEquipmentUnitByQrCode } from "@/lib/inventory";
import { getTeamMemberByUserId, teamMemberHasEventAccess } from "@/lib/team";

type SerializedScanRpcRow = {
  event_equipment_id: string;
  equipment_id: string;
  equipment_unit_id: string;
  loaded_units_count?: number;
  returned_units_count?: number;
};

export interface ScanResult {
  ok: boolean;
  error?: string;
  unitId?: string;
  equipmentId?: string;
  eventEquipmentId?: string;
  loadedUnitsCount?: number;
  returnedUnitsCount?: number;
}

export interface ExtraBulkInput {
  eventId: string;
  equipmentId: string;
  variantId: string | null;
  qty: number;
  reason: string;
}

export interface ExtraMaterialResult extends ScanResult {
  variantId?: string | null;
  qty?: number;
  extraQty?: number;
  addedQty?: number;
  logId?: string;
  addedAt?: string;
  addedBy?: string | null;
}

type ExtraMaterialRpcRow = {
  event_equipment_id: string;
  equipment_id: string;
  variant_id: string | null;
  equipment_unit_id?: string | null;
  qty: number;
  extra_qty: number;
  added_qty: number;
  extra_log_id: string | null;
  extra_log_created_at: string | null;
  extra_log_added_by: string | null;
};

const EXTRA_MATERIAL_ERRORS: Record<string, string> = {
  EXTRA_NOT_AUTHENTICATED: "Sua sessão expirou. Entre novamente.",
  EXTRA_FORBIDDEN: "Sem acesso a esta OS.",
  EXTRA_EVENT_STATE: "Esta OS não permite registrar material extra.",
  EXTRA_REASON_REQUIRED: "Informe o motivo do material extra.",
  EXTRA_NOT_AVAILABLE: "Material indisponível.",
  EXTRA_UNIT_CONFLICT: "Esta unidade já está carregada em outra OS.",
  EXTRA_RETURN_RANGE: "Quantidade de devolução inválida.",
};
const RETURN_ERRORS: Record<string, string> = {
  EXTRA_NOT_AUTHENTICATED: "Sua sessão expirou. Entre novamente.",
  EXTRA_FORBIDDEN: "Sem acesso a esta OS.",
  EXTRA_EVENT_STATE: "Esta OS não permite alterar devoluções.",
  EXTRA_RETURN_PENDING: "Ainda há equipamentos carregados pendentes de devolução.",
  EXTRA_RETURN_RANGE: "Quantidade de devolução inválida.",
  SCAN_QR_NOT_FOUND: "QR não encontrado",
  SCAN_EVENT_EQUIPMENT_NOT_FOUND: "Este equipamento não está vinculado à OS",
  SCAN_RETURN_RANGE: "Unidade não carregada ou já retornada",
  SCAN_INVALID_SELECTOR: "Dados de devolução inválidos.",
};
const LOAD_ERRORS: Record<string, string> = {
  EXTRA_NOT_AUTHENTICATED: "Sua sessão expirou. Entre novamente.",
  EXTRA_FORBIDDEN: "Sem acesso a esta OS.",
  EXTRA_EVENT_STATE: "Esta OS não permite alterar a carga.",
  SCAN_QR_NOT_FOUND: "QR não encontrado",
  SCAN_EVENT_EQUIPMENT_NOT_FOUND: "Este equipamento não está vinculado à OS",
  SCAN_NO_AVAILABLE_UNIT: "Sem unidades disponíveis para marcar.",
  SCAN_UNIT_CONFLICT: "Esta unidade já está carregada em outra OS.",
  SCAN_LOAD_COMPLETE: "Quantidade já completa.",
  SCAN_NOT_LOADED: "Unidade não estava carregada",
  SCAN_INVALID_SELECTOR: "Dados de carga inválidos.",
};
const RETURN_ROLES = new Set(["super_admin", "admin", "operations", "warehouse"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeRequiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeUuid(value: unknown): string | null {
  const normalized = normalizeRequiredText(value);
  return normalized && UUID_PATTERN.test(normalized) ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function authorizeExtraMaterial(eventId: string): Promise<ExtraMaterialResult | null> {
  const context = await getCurrentUserContext();
  if (!context) return { ok: false, error: "Não autenticado" };
  if (context.role !== "warehouse") {
    return {
      ok: false,
      error: "Apenas a equipe de almoxarifado pode registrar material extra.",
    };
  }

  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) return { ok: false, error: "Sem acesso a esta OS." };

  const member = await getTeamMemberByUserId(context.userId, organizationId);
  const hasAccess = member
    ? await teamMemberHasEventAccess(member.id, eventId)
    : false;
  return hasAccess ? null : { ok: false, error: "Sem acesso a esta OS." };
}

async function authorizeEventReturn(eventId: string): Promise<ScanResult | null> {
  const context = await getCurrentUserContext();
  if (!context) return { ok: false, error: "Não autenticado" };
  if (!context.role || !RETURN_ROLES.has(context.role)) {
    return { ok: false, error: "Sem acesso a esta OS." };
  }

  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) return { ok: false, error: "Sem acesso a esta OS." };
  if (context.role !== "warehouse") return null;

  const member = await getTeamMemberByUserId(context.userId, organizationId);
  const hasAccess = member ? await teamMemberHasEventAccess(member.id, eventId) : false;
  return hasAccess ? null : { ok: false, error: "Sem acesso a esta OS." };
}

function translateExtraMaterialError(message: string): string {
  for (const [code, translated] of Object.entries(EXTRA_MATERIAL_ERRORS)) {
    if (message.includes(code)) return translated;
  }
  return message;
}

function translateReturnError(message: string): string {
  for (const [code, translated] of Object.entries(RETURN_ERRORS)) {
    if (message.includes(code)) return translated;
  }
  return message;
}

function translateLoadError(message: string): string {
  for (const [code, translated] of Object.entries(LOAD_ERRORS)) {
    if (message.includes(code)) return translated;
  }
  return message;
}

function revalidateReturn(eventId: string) {
  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
}

function serializedScanSuccess(
  data: unknown,
  countKey: "loaded_units_count" | "returned_units_count"
): ScanResult | null {
  if (!isRecord(data)) return null;
  const row = data as SerializedScanRpcRow;
  const count = row[countKey];
  if (
    typeof row.event_equipment_id !== "string" ||
    typeof row.equipment_id !== "string" ||
    typeof row.equipment_unit_id !== "string" ||
    !Number.isSafeInteger(count) ||
    (count as number) < 0
  ) return null;

  return {
    ok: true,
    eventEquipmentId: row.event_equipment_id,
    equipmentId: row.equipment_id,
    unitId: row.equipment_unit_id,
    ...(countKey === "loaded_units_count"
      ? { loadedUnitsCount: count as number }
      : { returnedUnitsCount: count as number }),
  };
}

async function mutateSerializedLoad(
  rpcName: "load_serialized_material" | "unload_serialized_material",
  eventId: string,
  eventEquipmentId: string | null,
  qrCode: string | null
): Promise<ScanResult> {
  const authorizationError = await authorizeEventReturn(eventId);
  if (authorizationError) return authorizationError;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(rpcName, {
    p_event_id: eventId,
    p_event_equipment_id: eventEquipmentId,
    p_qr_code: qrCode,
  });
  if (error) return { ok: false, error: translateLoadError(error.message) };
  const result = serializedScanSuccess(data, "loaded_units_count");
  if (!result) return { ok: false, error: "Não foi possível atualizar a carga." };

  revalidatePath(`/scan/load/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return result;
}

async function mutateSerializedReturn(
  eventId: string,
  eventEquipmentId: string | null,
  qrCode: string | null,
  condition: "ok" | DefectCondition,
  note: string | null
): Promise<ScanResult> {
  const authorizationError = await authorizeEventReturn(eventId);
  if (authorizationError) return authorizationError;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("return_serialized_material", {
    p_event_id: eventId,
    p_event_equipment_id: eventEquipmentId,
    p_qr_code: qrCode,
    p_condition: condition,
    p_note: note,
  });
  if (error) return { ok: false, error: translateReturnError(error.message) };
  const result = serializedScanSuccess(data, "returned_units_count");
  if (!result) return { ok: false, error: "Não foi possível registrar a devolução." };

  revalidateReturn(eventId);
  if (condition !== "ok") revalidatePath("/maintenance");
  return result;
}

type SerializedUnreturnRpcRow = {
  event_equipment_id: string;
  equipment_id: string;
  equipment_unit_id: string;
  returned_units_count: number;
};

async function callUnreturnSerializedMaterial(
  eventId: string,
  eventEquipmentId: string | null,
  equipmentUnitId: string | null
): Promise<ScanResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("unreturn_serialized_material", {
    p_event_id: eventId,
    p_event_equipment_id: eventEquipmentId,
    p_equipment_unit_id: equipmentUnitId,
  });
  if (error) return { ok: false, error: translateReturnError(error.message) };
  if (!isRecord(data)) return { ok: false, error: "Não foi possível desfazer a devolução." };

  const row = data as SerializedUnreturnRpcRow;
  if (
    typeof row.event_equipment_id !== "string" ||
    typeof row.equipment_id !== "string" ||
    typeof row.equipment_unit_id !== "string" ||
    !Number.isSafeInteger(row.returned_units_count) ||
    row.returned_units_count < 0
  ) {
    return { ok: false, error: "Não foi possível desfazer a devolução." };
  }

  revalidateReturn(eventId);
  return {
    ok: true,
    unitId: row.equipment_unit_id,
    equipmentId: row.equipment_id,
    eventEquipmentId: row.event_equipment_id,
    returnedUnitsCount: row.returned_units_count,
  };
}

async function unreturnSerializedMaterial(
  eventId: string,
  eventEquipmentId: string | null,
  equipmentUnitId: string | null
): Promise<ScanResult> {
  const authorizationError = await authorizeEventReturn(eventId);
  if (authorizationError) return authorizationError;
  return callUnreturnSerializedMaterial(eventId, eventEquipmentId, equipmentUnitId);
}

function revalidateExtraMaterial(eventId: string) {
  revalidatePath(`/scan/load/${eventId}`);
  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
}

function extraMaterialSuccess(row: ExtraMaterialRpcRow): ExtraMaterialResult {
  return {
    ok: true,
    ...(row.equipment_unit_id ? { unitId: row.equipment_unit_id } : {}),
    equipmentId: row.equipment_id,
    variantId: row.variant_id,
    eventEquipmentId: row.event_equipment_id,
    qty: row.qty,
    extraQty: row.extra_qty,
    addedQty: row.added_qty,
    ...(row.extra_log_id ? { logId: row.extra_log_id } : {}),
    ...(row.extra_log_created_at ? { addedAt: row.extra_log_created_at } : {}),
    ...(row.extra_log_added_by !== null ? { addedBy: row.extra_log_added_by } : {}),
  };
}

async function registerExtraSerializedUnit(
  eventId: string,
  equipmentUnitId: string,
  reason: string
): Promise<ExtraMaterialResult> {
  const authorizationError = await authorizeExtraMaterial(eventId);
  if (authorizationError) return authorizationError;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("register_extra_serialized_material", {
      p_event_id: eventId,
      p_equipment_unit_id: equipmentUnitId,
      p_reason: reason,
    })
    .single();
  if (error) return { ok: false, error: translateExtraMaterialError(error.message) };

  const row = data as ExtraMaterialRpcRow | null;
  if (!row) return { ok: false, error: "Não foi possível registrar o material extra." };

  revalidateExtraMaterial(eventId);
  return extraMaterialSuccess(row);
}

export async function registerExtraSerializedMaterial(
  eventId: string,
  qrCode: string,
  reason: string
): Promise<ExtraMaterialResult> {
  const normalizedEventId = normalizeUuid(eventId);
  if (!normalizedEventId) return { ok: false, error: "Sem acesso a esta OS." };

  const normalizedReason = normalizeRequiredText(reason);
  if (!normalizedReason) {
    return { ok: false, error: "Informe o motivo do material extra." };
  }

  const normalizedQrCode = normalizeRequiredText(qrCode);
  if (!normalizedQrCode) return { ok: false, error: "QR vazio" };

  const authorizationError = await authorizeExtraMaterial(normalizedEventId);
  if (authorizationError) return authorizationError;

  const unit = await getEquipmentUnitByQrCode(normalizedQrCode);
  if (!unit) return { ok: false, error: "QR não encontrado" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("register_extra_serialized_material", {
      p_event_id: normalizedEventId,
      p_equipment_unit_id: unit.id,
      p_reason: normalizedReason,
    })
    .single();
  if (error) return { ok: false, error: translateExtraMaterialError(error.message) };

  const row = data as ExtraMaterialRpcRow | null;
  if (!row) return { ok: false, error: "Não foi possível registrar o material extra." };

  revalidateExtraMaterial(normalizedEventId);
  return extraMaterialSuccess(row);
}

export async function registerExtraSerializedMaterialByUnitId(
  eventId: string,
  equipmentUnitId: string,
  reason: string
): Promise<ExtraMaterialResult> {
  const normalizedEventId = normalizeUuid(eventId);
  if (!normalizedEventId) return { ok: false, error: "Sem acesso a esta OS." };

  const normalizedUnitId = normalizeUuid(equipmentUnitId);
  if (!normalizedUnitId) return { ok: false, error: "Material indisponível." };

  const normalizedReason = normalizeRequiredText(reason);
  if (!normalizedReason) {
    return { ok: false, error: "Informe o motivo do material extra." };
  }

  return registerExtraSerializedUnit(normalizedEventId, normalizedUnitId, normalizedReason);
}

export async function registerExtraBulkMaterial(
  input: ExtraBulkInput
): Promise<ExtraMaterialResult> {
  if (!isRecord(input)) {
    return { ok: false, error: "Dados de material extra inválidos." };
  }

  const eventId = normalizeUuid(input.eventId);
  if (!eventId) return { ok: false, error: "Sem acesso a esta OS." };

  const reason = normalizeRequiredText(input.reason);
  if (!reason) return { ok: false, error: "Informe o motivo do material extra." };
  if (!Number.isSafeInteger(input.qty) || input.qty <= 0) {
    return { ok: false, error: "Quantidade inválida." };
  }

  const equipmentId = normalizeUuid(input.equipmentId);
  if (!equipmentId) return { ok: false, error: "Material indisponível." };
  const variantId = input.variantId === null ? null : normalizeUuid(input.variantId);
  if (input.variantId !== null && !variantId) {
    return { ok: false, error: "Material indisponível." };
  }

  const authorizationError = await authorizeExtraMaterial(eventId);
  if (authorizationError) return authorizationError;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("register_extra_bulk_material", {
      p_event_id: eventId,
      p_equipment_id: equipmentId,
      p_variant_id: variantId,
      p_qty: input.qty,
      p_reason: reason,
    })
    .single();
  if (error) return { ok: false, error: translateExtraMaterialError(error.message) };

  const row = data as ExtraMaterialRpcRow | null;
  if (!row) return { ok: false, error: "Não foi possível registrar o material extra." };

  revalidateExtraMaterial(eventId);
  return extraMaterialSuccess(row);
}

async function mutateBulkReturn(
  rpcName: "return_bulk_material" | "unreturn_bulk_material",
  eventIdInput: unknown,
  eventEquipmentIdInput: unknown,
  qty: unknown
): Promise<ScanResult> {
  const eventId = normalizeUuid(eventIdInput);
  const eventEquipmentId = normalizeUuid(eventEquipmentIdInput);
  if (!eventId || !eventEquipmentId) {
    return { ok: false, error: "Sem acesso a esta OS." };
  }
  if (!Number.isSafeInteger(qty) || (qty as number) <= 0) {
    return { ok: false, error: "Quantidade de devolução inválida." };
  }

  const authorizationError = await authorizeExtraMaterial(eventId);
  if (authorizationError) return authorizationError;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(rpcName, {
    p_event_id: eventId,
    p_event_equipment_id: eventEquipmentId,
    p_qty: qty as number,
  });
  if (error) return { ok: false, error: translateExtraMaterialError(error.message) };
  if (!Number.isSafeInteger(data) || (data as number) < 0) {
    return { ok: false, error: "Não foi possível atualizar a devolução." };
  }

  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return {
    ok: true,
    eventEquipmentId,
    returnedUnitsCount: data as number,
  };
}

export async function manualReturnBulk(
  eventId: string,
  eventEquipmentId: string,
  qty: number
): Promise<ScanResult> {
  return mutateBulkReturn("return_bulk_material", eventId, eventEquipmentId, qty);
}

export async function manualUnreturnBulk(
  eventId: string,
  eventEquipmentId: string,
  qty: number
): Promise<ScanResult> {
  return mutateBulkReturn("unreturn_bulk_material", eventId, eventEquipmentId, qty);
}

export type DefectCondition = "damaged" | "lost";

// ── Bipar por código ────────────────────────────────────────────────────────

export async function scanLoadUnit(eventId: string, qrCode: string): Promise<ScanResult> {
  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };
  return mutateSerializedLoad("load_serialized_material", eventId, null, trimmed);
}

export async function scanReturnUnit(eventId: string, qrCode: string): Promise<ScanResult> {
  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };
  return mutateSerializedReturn(eventId, null, trimmed, "ok", null);
}

// ── Desbipar por código ─────────────────────────────────────────────────────

export async function unscanLoadUnit(eventId: string, qrCode: string): Promise<ScanResult> {
  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };
  return mutateSerializedLoad("unload_serialized_material", eventId, null, trimmed);
}

export async function unscanReturnUnit(eventId: string, qrCode: string): Promise<ScanResult> {
  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };

  const authorizationError = await authorizeEventReturn(eventId);
  if (authorizationError) return authorizationError;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("unreturn_serialized_material_by_qr", {
    p_event_id: eventId,
    p_qr_code: trimmed,
  });
  if (error) return { ok: false, error: translateReturnError(error.message) };
  const result = serializedScanSuccess(data, "returned_units_count");
  if (!result) return { ok: false, error: "Não foi possível desfazer a devolução." };
  revalidateReturn(eventId);
  return result;
}

// ── Finalização da OS pelo fluxo de scan ─────────────────────────────────────
// O fluxo de scan é o canal principal de carga/retorno. Estas ações fazem a OS
// avançar no ciclo de vida (o que libera estoque): a carga completa coloca a OS
// "Em campo" e o retorno completo a "Conclui".

export async function finalizeLoad(eventId: string): Promise<ScanResult> {
  const authorizationError = await authorizeEventReturn(eventId);
  if (authorizationError) return authorizationError;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("finalize_event_load", {
    p_event_id: eventId,
  });
  if (error) return { ok: false, error: translateLoadError(error.message) };
  if (data !== true) return { ok: false, error: "Não foi possível finalizar a carga." };

  revalidatePath(`/scan/load/${eventId}`);
  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function finalizeReturn(eventId: string): Promise<ScanResult> {
  const authorizationError = await authorizeEventReturn(eventId);
  if (authorizationError) return authorizationError;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("finalize_event_return", {
    p_event_id: eventId,
  });
  if (error) return { ok: false, error: translateReturnError(error.message) };
  if (data !== true) return { ok: false, error: "Não foi possível concluir a devolução." };

  revalidateReturn(eventId);
  return { ok: true };
}

// ── Marcação manual por linha (sem código) ──────────────────────────────────

export async function manualLoadUnit(
  eventId: string,
  eventEquipmentId: string
): Promise<ScanResult> {
  return mutateSerializedLoad("load_serialized_material", eventId, eventEquipmentId, null);
}

export async function manualUnloadUnit(
  eventId: string,
  eventEquipmentId: string
): Promise<ScanResult> {
  return mutateSerializedLoad("unload_serialized_material", eventId, eventEquipmentId, null);
}

export async function manualReturnUnit(
  eventId: string,
  eventEquipmentId: string
): Promise<ScanResult> {
  return mutateSerializedReturn(eventId, eventEquipmentId, null, "ok", null);
}

// ── Retorno com defeito ──────────────────────────────────────────────────────
// Bipa a devolução e, no mesmo passo, marca a unidade como danificada/perdida:
// ela volta retornada (libera a OS) mas sai de circulação e entra na fila de
// manutenção. Sem QR (manual), pega a próxima unidade carregada e não retornada.

export async function scanReturnDefectUnit(
  eventId: string,
  qrCode: string,
  condition: DefectCondition,
  note: string
): Promise<ScanResult> {
  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };
  if (condition !== "damaged" && condition !== "lost") {
    return { ok: false, error: "Condição de devolução inválida." };
  }
  return mutateSerializedReturn(eventId, null, trimmed, condition, note.trim() || null);
}

export async function manualReturnDefectUnit(
  eventId: string,
  eventEquipmentId: string,
  condition: DefectCondition,
  note: string
): Promise<ScanResult> {
  if (condition !== "damaged" && condition !== "lost") {
    return { ok: false, error: "Condição de devolução inválida." };
  }
  return mutateSerializedReturn(
    eventId,
    eventEquipmentId,
    null,
    condition,
    note.trim() || null
  );
}

export async function manualUnreturnUnit(
  eventId: string,
  eventEquipmentId: string
): Promise<ScanResult> {
  return unreturnSerializedMaterial(eventId, eventEquipmentId, null);
}
