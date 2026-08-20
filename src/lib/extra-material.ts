import { availabilityKey, getEquipmentAvailability } from "@/lib/inventory";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface ExtraMaterialCandidate {
  equipmentId: string;
  equipmentName: string;
  equipmentType: "serialized" | "bulk";
  variantId: string | null;
  variantLabel: string | null;
  availableQty: number;
  unit: string;
}

export interface ExtraMaterialLog {
  id: string;
  eventEquipmentId: string;
  equipmentId: string;
  equipmentName: string;
  variantId: string | null;
  variantLabel: string | null;
  equipmentUnitId: string | null;
  qty: number;
  reason: string;
  addedBy: string | null;
  addedByName: string | null;
  createdAt: string;
}

type CandidateEquipmentRow = {
  id: string;
  name: string;
  type: ExtraMaterialCandidate["equipmentType"];
  has_variants: boolean;
  equipment_variants: { id: string; label: string }[] | null;
  bulk_inventory: {
    variant_id: string | null;
    total_qty: number;
    unit: string;
  }[] | null;
};

export async function listExtraMaterialCandidates(
  eventId: string,
  organizationId: string
): Promise<ExtraMaterialCandidate[]> {
  const supabase = createSupabaseAdminClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("event_dates (date)")
    .eq("id", eventId)
    .eq("organization_id", organizationId)
    .in("status", ["ready_to_load", "in_field"])
    .maybeSingle();

  if (eventError) throw eventError;
  if (!event) return [];

  const dates = (
    (event.event_dates as unknown as { date: string }[] | null) ?? []
  ).map((entry) => entry.date);

  const [availability, equipmentResult] = await Promise.all([
    getEquipmentAvailability(organizationId, dates),
    supabase
      .from("equipment")
      .select(`
        id, name, type, has_variants,
        equipment_variants (id, label),
        bulk_inventory (variant_id, total_qty, unit)
      `)
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
  ]);

  if (equipmentResult.error) throw equipmentResult.error;

  const candidates: ExtraMaterialCandidate[] = [];
  for (const equipment of (
    equipmentResult.data as unknown as CandidateEquipmentRow[] | null
  ) ?? []) {
    const variants = equipment.equipment_variants ?? [];
    const variantEntries = equipment.has_variants && variants.length > 0
      ? variants.map((variant) => ({ id: variant.id, label: variant.label }))
      : [{ id: null, label: null }];

    for (const variant of variantEntries) {
      const availableQty = availability.get(
        availabilityKey(equipment.id, variant.id)
      )?.available ?? 0;
      if (availableQty <= 0) continue;

      const bulk = (equipment.bulk_inventory ?? []).find(
        (entry) => entry.variant_id === variant.id
      );
      candidates.push({
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        equipmentType: equipment.type,
        variantId: variant.id,
        variantLabel: variant.label,
        availableQty,
        unit: equipment.type === "bulk" ? (bulk?.unit ?? "unidades") : "unidades",
      });
    }
  }

  return candidates;
}

type ExtraMaterialLogRow = {
  id: string;
  event_equipment_id: string;
  equipment_id: string;
  variant_id: string | null;
  equipment_unit_id: string | null;
  qty: number;
  reason: string;
  added_by: string | null;
  created_at: string;
  equipment: { name: string };
  equipment_variants: { label: string } | null;
};

export async function listExtraMaterialLog(
  eventId: string,
  organizationId: string
): Promise<ExtraMaterialLog[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_equipment_extra_log")
    .select(`
      id, event_equipment_id, equipment_id, variant_id, equipment_unit_id,
      qty, reason, added_by, created_at,
      events!inner (organization_id),
      equipment (name),
      equipment_variants (label)
    `)
    .eq("event_id", eventId)
    .eq("events.organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data as unknown as ExtraMaterialLogRow[] | null) ?? [];
  const addedByIds = Array.from(
    new Set(rows.map((row) => row.added_by).filter((id): id is string => id !== null))
  );
  const profileNames = new Map<string, string | null>();

  if (addedByIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", addedByIds);
    if (profilesError) throw profilesError;
    for (const profile of profiles ?? []) {
      profileNames.set(profile.id, profile.full_name);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    eventEquipmentId: row.event_equipment_id,
    equipmentId: row.equipment_id,
    equipmentName: row.equipment.name,
    variantId: row.variant_id,
    variantLabel: row.equipment_variants?.label ?? null,
    equipmentUnitId: row.equipment_unit_id,
    qty: row.qty,
    reason: row.reason,
    addedBy: row.added_by,
    addedByName: row.added_by ? (profileNames.get(row.added_by) ?? null) : null,
    createdAt: row.created_at,
  }));
}
