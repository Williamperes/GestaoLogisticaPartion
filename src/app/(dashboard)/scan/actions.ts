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

// ── Defeito no retorno ───────────────────────────────────────────────────────
// Uma unidade pode voltar danificada ou ser dada como perdida. Em ambos os
// casos ela sai de circulação (status maintenance/inactive — excluído de
// findAvailableUnitId e getEquipmentAvailability) e abre uma ocorrência na
// fila de manutenção (equipment_maintenance).

export type DefectCondition = "damaged" | "lost";

async function recordUnitDefect(
  supabase: AdminClient,
  args: {
    equipmentUnitId: string;
    equipmentId: string;
    organizationId: string;
    eventId: string;
    eventEquipmentId: string;
    condition: DefectCondition;
    note: string | null;
    userId: string;
  }
) {
  await supabase
    .from("event_equipment_units")
    .update({ return_condition: args.condition, defect_note: args.note })
    .eq("event_equipment_id", args.eventEquipmentId)
    .eq("equipment_unit_id", args.equipmentUnitId);

  await supabase
    .from("equipment_units")
    .update({ status: args.condition === "lost" ? "inactive" : "maintenance" })
    .eq("id", args.equipmentUnitId);

  await supabase.from("equipment_maintenance").insert({
    organization_id: args.organizationId,
    equipment_id: args.equipmentId,
    equipment_unit_id: args.equipmentUnitId,
    event_id: args.eventId,
    condition: args.condition,
    note: args.note,
    opened_by: args.userId,
  });
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

// ── Finalização da OS pelo fluxo de scan ─────────────────────────────────────
// O fluxo de scan é o canal principal de carga/retorno. Estas ações fazem a OS
// avançar no ciclo de vida (o que libera estoque): a carga completa coloca a OS
// "Em campo" e o retorno completo a "Conclui".

export async function finalizeLoad(eventId: string): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const supabase = createSupabaseAdminClient();
  const { data: ev, error: evErr } = await supabase
    .from("events")
    .select("status")
    .eq("id", eventId)
    .maybeSingle();
  if (evErr) return { ok: false, error: evErr.message };
  if (!ev) return { ok: false, error: "OS não encontrada" };
  if (ev.status === "in_field") return { ok: true };
  if (ev.status !== "ready_to_load")
    return { ok: false, error: "A OS precisa estar em 'Pronto p/ Carga' para sair em campo." };

  const { error } = await supabase
    .from("events")
    .update({ status: "in_field" })
    .eq("id", eventId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/scan/load/${eventId}`);
  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function finalizeReturn(eventId: string): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const supabase = createSupabaseAdminClient();
  const { data: ev, error: evErr } = await supabase
    .from("events")
    .select("status")
    .eq("id", eventId)
    .maybeSingle();
  if (evErr) return { ok: false, error: evErr.message };
  if (!ev) return { ok: false, error: "OS não encontrada" };
  if (ev.status === "completed") return { ok: true };
  if (ev.status !== "in_field")
    return { ok: false, error: "Feche a carga (OS em campo) antes de concluir o retorno." };

  const { error } = await supabase
    .from("events")
    .update({ status: "completed" })
    .eq("id", eventId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
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

  await recordUnitDefect(supabase, {
    equipmentUnitId: unit.id,
    equipmentId: unit.equipmentId,
    organizationId: unit.organizationId,
    eventId,
    eventEquipmentId: eeRow.id,
    condition,
    note: note.trim() || null,
    userId: user.id,
  });
  await syncReturnedState(supabase, eeRow.id, eeRow.qty);

  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/maintenance");
  return { ok: true, unitId: unit.id, equipmentId: unit.equipmentId, eventEquipmentId: eeRow.id };
}

export async function manualReturnDefectUnit(
  eventId: string,
  eventEquipmentId: string,
  condition: DefectCondition,
  note: string
): Promise<ScanResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const supabase = createSupabaseAdminClient();
  const { data: ee, error: eeErr } = await getEeById(supabase, eventId, eventEquipmentId);
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!ee) return { ok: false, error: "Equipamento não encontrado na OS" };

  const { data: row } = await supabase
    .from("event_equipment_units")
    .select("id, equipment_unit_id")
    .eq("event_equipment_id", ee.id)
    .not("loaded_at", "is", null)
    .is("returned_at", null)
    .order("loaded_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!row) return { ok: false, error: "Nenhuma unidade carregada para retornar." };

  // organization_id da unidade para o registro de manutenção.
  const { data: eq } = await supabase
    .from("equipment")
    .select("organization_id")
    .eq("id", ee.equipment_id)
    .maybeSingle();
  if (!eq) return { ok: false, error: "Equipamento não encontrado." };

  const { error: updErr } = await supabase
    .from("event_equipment_units")
    .update({ returned_at: new Date().toISOString(), returned_by: user.id })
    .eq("id", row.id);
  if (updErr) return { ok: false, error: updErr.message };

  await recordUnitDefect(supabase, {
    equipmentUnitId: row.equipment_unit_id,
    equipmentId: ee.equipment_id,
    organizationId: eq.organization_id,
    eventId,
    eventEquipmentId: ee.id,
    condition,
    note: note.trim() || null,
    userId: user.id,
  });
  await syncReturnedState(supabase, ee.id, ee.qty);

  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/maintenance");
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
