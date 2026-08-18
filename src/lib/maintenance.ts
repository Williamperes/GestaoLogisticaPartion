import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { UnitCondition } from "@/lib/inventory";

export type MaintenanceStatus = "open" | "resolved";

export interface MaintenanceRecord {
  id: string;
  organizationId: string;
  equipmentId: string;
  equipmentName: string;
  equipmentUnitId: string;
  unitSerial: string | null;
  eventId: string | null;
  eventName: string | null;
  condition: UnitCondition;
  note: string | null;
  status: MaintenanceStatus;
  resolvedAt: string | null;
  createdAt: string;
}

/**
 * Lista ocorrências da fila de manutenção de uma organização. Por padrão
 * traz apenas as abertas (status = 'open'); passe includeResolved para o
 * histórico completo. Ordenado por mais recente primeiro.
 */
export async function listMaintenance(
  organizationId: string,
  options: { includeResolved?: boolean } = {}
): Promise<MaintenanceRecord[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("equipment_maintenance")
    .select(
      `
      id, organization_id, equipment_id, equipment_unit_id, event_id,
      condition, note, status, resolved_at, created_at,
      equipment (name),
      equipment_units (serial),
      events (name)
      `
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (!options.includeResolved) {
    query = query.eq("status", "open");
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    id: string;
    organization_id: string;
    equipment_id: string;
    equipment_unit_id: string;
    event_id: string | null;
    condition: UnitCondition;
    note: string | null;
    status: MaintenanceStatus;
    resolved_at: string | null;
    created_at: string;
    equipment: { name: string } | null;
    equipment_units: { serial: string | null } | null;
    events: { name: string } | null;
  };

  return ((data as unknown as Row[]) ?? []).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    equipmentId: r.equipment_id,
    equipmentName: r.equipment?.name ?? "—",
    equipmentUnitId: r.equipment_unit_id,
    unitSerial: r.equipment_units?.serial ?? null,
    eventId: r.event_id,
    eventName: r.events?.name ?? null,
    condition: r.condition,
    note: r.note,
    status: r.status,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
  }));
}

export async function listResolvedMaintenanceHistory(
  organizationId: string,
  equipmentId?: string
): Promise<MaintenanceRecord[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("equipment_maintenance")
    .select(
      `
      id, organization_id, equipment_id, equipment_unit_id, event_id,
      condition, note, status, resolved_at, created_at,
      equipment (name),
      equipment_units (serial),
      events (name)
      `
    )
    .eq("organization_id", organizationId)
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false });

  if (equipmentId) {
    query = query.eq("equipment_id", equipmentId);
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    id: string;
    organization_id: string;
    equipment_id: string;
    equipment_unit_id: string;
    event_id: string | null;
    condition: UnitCondition;
    note: string | null;
    status: MaintenanceStatus;
    resolved_at: string | null;
    created_at: string;
    equipment: { name: string } | null;
    equipment_units: { serial: string | null } | null;
    events: { name: string } | null;
  };

  return ((data as unknown as Row[]) ?? []).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    equipmentId: r.equipment_id,
    equipmentName: r.equipment?.name ?? "—",
    equipmentUnitId: r.equipment_unit_id,
    unitSerial: r.equipment_units?.serial ?? null,
    eventId: r.event_id,
    eventName: r.events?.name ?? null,
    condition: r.condition,
    note: r.note,
    status: r.status,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
  }));
}

export function getLatestMaintenanceReturnByEquipment(
  records: Array<Pick<MaintenanceRecord, "equipmentId" | "resolvedAt">>
): Record<string, string> {
  const latest: Record<string, string> = {};

  for (const record of records) {
    if (!record.resolvedAt || latest[record.equipmentId]) continue;
    latest[record.equipmentId] = record.resolvedAt;
  }

  return latest;
}

export function formatUnitCondition(condition: UnitCondition): string {
  const map: Record<UnitCondition, string> = {
    ok: "OK",
    damaged: "Danificado",
    lost: "Perdido",
  };
  return map[condition];
}
