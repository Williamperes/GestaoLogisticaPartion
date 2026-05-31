"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentAuthUser } from "@/lib/auth/session";
import { getEquipmentUnitByQrCode } from "@/lib/inventory";

export interface ScanResult {
  ok: boolean;
  error?: string;
  unitId?: string;
  equipmentId?: string;
  eventEquipmentId?: string;
}

export async function scanLoadUnit(
  eventId: string,
  qrCode: string
): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };

  const unit = await getEquipmentUnitByQrCode(trimmed);
  if (!unit) return { ok: false, error: "QR não encontrado" };

  const supabase = createSupabaseAdminClient();

  const eeQuery = supabase
    .from("event_equipment")
    .select("id, qty")
    .eq("event_id", eventId)
    .eq("equipment_id", unit.equipmentId);
  const { data: eeRow, error: eeErr } = await (
    unit.variantId === null
      ? eeQuery.is("variant_id", null)
      : eeQuery.eq("variant_id", unit.variantId)
  ).maybeSingle();
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

  const { count: loadedCount } = await supabase
    .from("event_equipment_units")
    .select("*", { count: "exact", head: true })
    .eq("event_equipment_id", eeRow.id)
    .not("loaded_at", "is", null);

  if ((loadedCount ?? 0) >= eeRow.qty) {
    await supabase
      .from("event_equipment")
      .update({
        separated: true,
        loaded: true,
        loaded_at: new Date().toISOString(),
        loaded_by: user.id,
      })
      .eq("id", eeRow.id);
  }

  revalidatePath(`/scan/load/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return {
    ok: true,
    unitId: unit.id,
    equipmentId: unit.equipmentId,
    eventEquipmentId: eeRow.id,
  };
}

export async function scanReturnUnit(
  eventId: string,
  qrCode: string
): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };

  const unit = await getEquipmentUnitByQrCode(trimmed);
  if (!unit) return { ok: false, error: "QR não encontrado" };

  const supabase = createSupabaseAdminClient();

  const eeQuery = supabase
    .from("event_equipment")
    .select("id, qty")
    .eq("event_id", eventId)
    .eq("equipment_id", unit.equipmentId);
  const { data: eeRow, error: eeErr } = await (
    unit.variantId === null
      ? eeQuery.is("variant_id", null)
      : eeQuery.eq("variant_id", unit.variantId)
  ).maybeSingle();
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!eeRow) return { ok: false, error: "Este equipamento não está vinculado à OS" };

  const { data: euRow, error: euErr } = await supabase
    .from("event_equipment_units")
    .update({
      returned_at: new Date().toISOString(),
      returned_by: user.id,
    })
    .eq("event_equipment_id", eeRow.id)
    .eq("equipment_unit_id", unit.id)
    .not("loaded_at", "is", null)
    .is("returned_at", null)
    .select("id")
    .maybeSingle();
  if (euErr) return { ok: false, error: euErr.message };
  if (!euRow) return { ok: false, error: "Unidade não carregada ou já retornada" };

  const { count: returnedCount } = await supabase
    .from("event_equipment_units")
    .select("*", { count: "exact", head: true })
    .eq("event_equipment_id", eeRow.id)
    .not("returned_at", "is", null);

  if ((returnedCount ?? 0) >= eeRow.qty) {
    await supabase
      .from("event_equipment")
      .update({ returned_at: new Date().toISOString() })
      .eq("id", eeRow.id);
  }

  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return {
    ok: true,
    unitId: unit.id,
    equipmentId: unit.equipmentId,
    eventEquipmentId: eeRow.id,
  };
}
