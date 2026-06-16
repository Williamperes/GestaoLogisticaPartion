"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentAuthUser } from "@/lib/auth/session";
import { getEquipmentUnitByQrCode } from "@/lib/inventory";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

interface EeRef {
  id: string;
  equipment_id: string;
  variant_id: string | null;
  qty: number;
}

export interface ScanResult {
  ok: boolean;
  error?: string;
  unitId?: string;
  equipmentId?: string;
  eventEquipmentId?: string;
}

// Recalcula a contagem de carregados e sincroniza os flags da linha
// event_equipment. Mantém bipar e desbipar simétricos: o que a carga
// completa marca, a descarga parcial reverte.
async function syncLoadedState(
  supabase: AdminClient,
  eeId: string,
  qty: number,
  userId: string
) {
  const { count } = await supabase
    .from("event_equipment_units")
    .select("*", { count: "exact", head: true })
    .eq("event_equipment_id", eeId)
    .not("loaded_at", "is", null);
  const loadedCount = count ?? 0;

  if (loadedCount >= qty) {
    await supabase
      .from("event_equipment")
      .update({
        separated: true,
        loaded: true,
        loaded_at: new Date().toISOString(),
        loaded_by: userId,
      })
      .eq("id", eeId);
  } else {
    await supabase
      .from("event_equipment")
      .update({
        separated: false,
        loaded: false,
        loaded_at: null,
        loaded_by: null,
      })
      .eq("id", eeId);
  }
  return loadedCount;
}

// Idem para o retorno: a linha fica "retornada" só quando todas as
// unidades carregadas voltaram; desfazer reabre a linha.
async function syncReturnedState(supabase: AdminClient, eeId: string, qty: number) {
  const { count } = await supabase
    .from("event_equipment_units")
    .select("*", { count: "exact", head: true })
    .eq("event_equipment_id", eeId)
    .not("returned_at", "is", null);
  const returnedCount = count ?? 0;

  await supabase
    .from("event_equipment")
    .update({ returned_at: returnedCount >= qty ? new Date().toISOString() : null })
    .eq("id", eeId);
  return returnedCount;
}

// Localiza a linha event_equipment de uma OS para um equipamento/variante.
async function findEeRow(
  supabase: AdminClient,
  eventId: string,
  equipmentId: string,
  variantId: string | null
) {
  const eeQuery = supabase
    .from("event_equipment")
    .select("id, equipment_id, variant_id, qty")
    .eq("event_id", eventId)
    .eq("equipment_id", equipmentId);
  const { data, error } = await (
    variantId === null ? eeQuery.is("variant_id", null) : eeQuery.eq("variant_id", variantId)
  ).maybeSingle();
  return { data: data as EeRef | null, error };
}

// Carrega a linha event_equipment por id, garantindo que pertence à OS.
async function getEeById(supabase: AdminClient, eventId: string, eventEquipmentId: string) {
  const { data, error } = await supabase
    .from("event_equipment")
    .select("id, equipment_id, variant_id, qty")
    .eq("id", eventEquipmentId)
    .eq("event_id", eventId)
    .maybeSingle();
  return { data: data as EeRef | null, error };
}

// Próxima unidade do equipamento/variante ainda não vinculada a esta OS.
// Usada na marcação manual (+1) — inclusive para unidades sem QR.
async function findAvailableUnitId(supabase: AdminClient, ee: EeRef): Promise<string | null> {
  const { data: used } = await supabase
    .from("event_equipment_units")
    .select("equipment_unit_id")
    .eq("event_equipment_id", ee.id);
  const usedIds = (used ?? []).map((r) => r.equipment_unit_id);

  let q = supabase
    .from("equipment_units")
    .select("id")
    .eq("equipment_id", ee.equipment_id)
    .not("status", "in", "(maintenance,inactive)")
    .order("created_at", { ascending: true })
    .limit(1);
  q = ee.variant_id === null ? q.is("variant_id", null) : q.eq("variant_id", ee.variant_id);
  if (usedIds.length > 0) {
    q = q.not("id", "in", `(${usedIds.join(",")})`);
  }

  const { data } = await q.maybeSingle();
  return data?.id ?? null;
}

// ── Bipar por código ────────────────────────────────────────────────────────

export async function scanLoadUnit(eventId: string, qrCode: string): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };

  const unit = await getEquipmentUnitByQrCode(trimmed);
  if (!unit) return { ok: false, error: "QR não encontrado" };

  const supabase = createSupabaseAdminClient();
  const { data: eeRow, error: eeErr } = await findEeRow(
    supabase,
    eventId,
    unit.equipmentId,
    unit.variantId
  );
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!eeRow) return { ok: false, error: "Este equipamento não está vinculado à OS" };

  const { error: upsertErr } = await supabase
    .from("event_equipment_units")
    .upsert(
      {
        event_equipment_id: eeRow.id,
        equipment_unit_id: unit.id,
        loaded_at: new Date().toISOString(),
        loaded_by: user.id,
      },
      { onConflict: "event_equipment_id,equipment_unit_id" }
    );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  await syncLoadedState(supabase, eeRow.id, eeRow.qty, user.id);

  revalidatePath(`/scan/load/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { ok: true, unitId: unit.id, equipmentId: unit.equipmentId, eventEquipmentId: eeRow.id };
}

export async function scanReturnUnit(eventId: string, qrCode: string): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };

  const unit = await getEquipmentUnitByQrCode(trimmed);
  if (!unit) return { ok: false, error: "QR não encontrado" };

  const supabase = createSupabaseAdminClient();
  const { data: eeRow, error: eeErr } = await findEeRow(
    supabase,
    eventId,
    unit.equipmentId,
    unit.variantId
  );
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!eeRow) return { ok: false, error: "Este equipamento não está vinculado à OS" };

  const { data: euRow, error: euErr } = await supabase
    .from("event_equipment_units")
    .update({ returned_at: new Date().toISOString(), returned_by: user.id })
    .eq("event_equipment_id", eeRow.id)
    .eq("equipment_unit_id", unit.id)
    .not("loaded_at", "is", null)
    .is("returned_at", null)
    .select("id")
    .maybeSingle();
  if (euErr) return { ok: false, error: euErr.message };
  if (!euRow) return { ok: false, error: "Unidade não carregada ou já retornada" };

  await syncReturnedState(supabase, eeRow.id, eeRow.qty);

  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { ok: true, unitId: unit.id, equipmentId: unit.equipmentId, eventEquipmentId: eeRow.id };
}

// ── Desbipar por código ─────────────────────────────────────────────────────

export async function unscanLoadUnit(eventId: string, qrCode: string): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };

  const unit = await getEquipmentUnitByQrCode(trimmed);
  if (!unit) return { ok: false, error: "QR não encontrado" };

  const supabase = createSupabaseAdminClient();
  const { data: eeRow, error: eeErr } = await findEeRow(
    supabase,
    eventId,
    unit.equipmentId,
    unit.variantId
  );
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!eeRow) return { ok: false, error: "Este equipamento não está vinculado à OS" };

  const { data: deleted, error: delErr } = await supabase
    .from("event_equipment_units")
    .delete()
    .eq("event_equipment_id", eeRow.id)
    .eq("equipment_unit_id", unit.id)
    .is("returned_at", null)
    .select("id")
    .maybeSingle();
  if (delErr) return { ok: false, error: delErr.message };
  if (!deleted) return { ok: false, error: "Unidade não estava carregada" };

  await syncLoadedState(supabase, eeRow.id, eeRow.qty, user.id);

  revalidatePath(`/scan/load/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { ok: true, unitId: unit.id, equipmentId: unit.equipmentId, eventEquipmentId: eeRow.id };
}

export async function unscanReturnUnit(eventId: string, qrCode: string): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };

  const unit = await getEquipmentUnitByQrCode(trimmed);
  if (!unit) return { ok: false, error: "QR não encontrado" };

  const supabase = createSupabaseAdminClient();
  const { data: eeRow, error: eeErr } = await findEeRow(
    supabase,
    eventId,
    unit.equipmentId,
    unit.variantId
  );
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!eeRow) return { ok: false, error: "Este equipamento não está vinculado à OS" };

  const { data: euRow, error: euErr } = await supabase
    .from("event_equipment_units")
    .update({ returned_at: null, returned_by: null })
    .eq("event_equipment_id", eeRow.id)
    .eq("equipment_unit_id", unit.id)
    .not("returned_at", "is", null)
    .select("id")
    .maybeSingle();
  if (euErr) return { ok: false, error: euErr.message };
  if (!euRow) return { ok: false, error: "Unidade não estava retornada" };

  await syncReturnedState(supabase, eeRow.id, eeRow.qty);

  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { ok: true, unitId: unit.id, equipmentId: unit.equipmentId, eventEquipmentId: eeRow.id };
}

// ── Marcação manual por linha (sem código) ──────────────────────────────────

export async function manualLoadUnit(
  eventId: string,
  eventEquipmentId: string
): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const supabase = createSupabaseAdminClient();
  const { data: ee, error: eeErr } = await getEeById(supabase, eventId, eventEquipmentId);
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!ee) return { ok: false, error: "Equipamento não encontrado na OS" };

  const { count: already } = await supabase
    .from("event_equipment_units")
    .select("*", { count: "exact", head: true })
    .eq("event_equipment_id", ee.id)
    .not("loaded_at", "is", null);
  if ((already ?? 0) >= ee.qty) return { ok: false, error: "Quantidade já completa." };

  const unitId = await findAvailableUnitId(supabase, ee);
  if (!unitId) return { ok: false, error: "Sem unidades disponíveis para marcar." };

  const { error: upsertErr } = await supabase
    .from("event_equipment_units")
    .upsert(
      {
        event_equipment_id: ee.id,
        equipment_unit_id: unitId,
        loaded_at: new Date().toISOString(),
        loaded_by: user.id,
      },
      { onConflict: "event_equipment_id,equipment_unit_id" }
    );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  await syncLoadedState(supabase, ee.id, ee.qty, user.id);

  revalidatePath(`/scan/load/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { ok: true, equipmentId: ee.equipment_id, eventEquipmentId: ee.id };
}

export async function manualUnloadUnit(
  eventId: string,
  eventEquipmentId: string
): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const supabase = createSupabaseAdminClient();
  const { data: ee, error: eeErr } = await getEeById(supabase, eventId, eventEquipmentId);
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!ee) return { ok: false, error: "Equipamento não encontrado na OS" };

  const { data: row } = await supabase
    .from("event_equipment_units")
    .select("id")
    .eq("event_equipment_id", ee.id)
    .not("loaded_at", "is", null)
    .is("returned_at", null)
    .order("loaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return { ok: false, error: "Nada para desbipar." };

  const { error: delErr } = await supabase
    .from("event_equipment_units")
    .delete()
    .eq("id", row.id);
  if (delErr) return { ok: false, error: delErr.message };

  await syncLoadedState(supabase, ee.id, ee.qty, user.id);

  revalidatePath(`/scan/load/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { ok: true, equipmentId: ee.equipment_id, eventEquipmentId: ee.id };
}

export async function manualReturnUnit(
  eventId: string,
  eventEquipmentId: string
): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const supabase = createSupabaseAdminClient();
  const { data: ee, error: eeErr } = await getEeById(supabase, eventId, eventEquipmentId);
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!ee) return { ok: false, error: "Equipamento não encontrado na OS" };

  const { data: row } = await supabase
    .from("event_equipment_units")
    .select("id")
    .eq("event_equipment_id", ee.id)
    .not("loaded_at", "is", null)
    .is("returned_at", null)
    .order("loaded_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!row) return { ok: false, error: "Nenhuma unidade carregada para retornar." };

  const { error: updErr } = await supabase
    .from("event_equipment_units")
    .update({ returned_at: new Date().toISOString(), returned_by: user.id })
    .eq("id", row.id);
  if (updErr) return { ok: false, error: updErr.message };

  await syncReturnedState(supabase, ee.id, ee.qty);

  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { ok: true, equipmentId: ee.equipment_id, eventEquipmentId: ee.id };
}

export async function manualUnreturnUnit(
  eventId: string,
  eventEquipmentId: string
): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const supabase = createSupabaseAdminClient();
  const { data: ee, error: eeErr } = await getEeById(supabase, eventId, eventEquipmentId);
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!ee) return { ok: false, error: "Equipamento não encontrado na OS" };

  const { data: row } = await supabase
    .from("event_equipment_units")
    .select("id")
    .eq("event_equipment_id", ee.id)
    .not("returned_at", "is", null)
    .order("returned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return { ok: false, error: "Nada para desbipar." };

  const { error: updErr } = await supabase
    .from("event_equipment_units")
    .update({ returned_at: null, returned_by: null })
    .eq("id", row.id);
  if (updErr) return { ok: false, error: updErr.message };

  await syncReturnedState(supabase, ee.id, ee.qty);

  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { ok: true, equipmentId: ee.equipment_id, eventEquipmentId: ee.id };
}
