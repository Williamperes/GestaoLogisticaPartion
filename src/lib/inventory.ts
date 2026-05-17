import { createSupabaseAdminClient } from "@/lib/supabase/server";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type EquipmentType = "serialized" | "bulk";

export type EquipmentStatus = "available" | "reserved" | "in_field" | "maintenance" | "inactive";

export interface EquipmentCategory {
  id: string;
  organizationId: string;
  name: string;
  equipmentCount: number;
}

export interface EquipmentUnit {
  id: string;
  equipmentId: string;
  serial: string;
  patrimony: string | null;
  status: EquipmentStatus;
  qrCode: string | null;
  notes: string | null;
  createdAt: string;
}

export interface BulkInventory {
  id: string;
  equipmentId: string;
  unit: string;
  totalQty: number;
  availableQty: number;
}

export interface Equipment {
  id: string;
  organizationId: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  type: EquipmentType;
  status: EquipmentStatus;
  serial: string | null;
  patrimony: string | null;
  purchaseDate: string | null;
  purchaseValueCents: number | null;
  qrCode: string | null;
  notes: string | null;
  createdAt: string;
  // Populated for bulk
  bulk?: BulkInventory;
  // Populated for serialized (summary)
  unitCount?: number;
  availableUnitCount?: number;
}

export interface EquipmentWithUnits extends Equipment {
  units: EquipmentUnit[];
}

// ──────────────────────────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────────────────────────

export async function listEquipmentCategories(organizationId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_categories")
    .select("id, organization_id, name, equipment(count)")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) throw error;

  return (
    data?.map((c) => ({
      id: c.id,
      organizationId: c.organization_id,
      name: c.name,
      equipmentCount:
        (c.equipment as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    })) ?? []
  ) satisfies EquipmentCategory[];
}

export async function listEquipment(organizationId: string, search?: string): Promise<Equipment[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("equipment")
    .select(`
      id, organization_id, category_id, name, brand, model, type, status,
      serial, patrimony, purchase_date, purchase_value_cents, qr_code, notes, created_at,
      equipment_categories (id, name),
      bulk_inventory (id, unit, total_qty, available_qty),
      equipment_units (id, status)
    `)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const q = search?.trim();
  if (q) {
    query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%,serial.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (
    data?.map((row) => {
      const cat = row.equipment_categories as unknown as { id: string; name: string } | null;
      const bulk = (row.bulk_inventory as unknown as { id: string; unit: string; total_qty: number; available_qty: number }[] | null)?.[0] ?? null;
      const units = (row.equipment_units as unknown as { id: string; status: string }[]) ?? [];

      return {
        id: row.id,
        organizationId: row.organization_id,
        categoryId: row.category_id,
        categoryName: cat?.name ?? null,
        name: row.name,
        brand: row.brand,
        model: row.model,
        type: row.type as EquipmentType,
        status: row.status as EquipmentStatus,
        serial: row.serial,
        patrimony: row.patrimony,
        purchaseDate: row.purchase_date,
        purchaseValueCents: row.purchase_value_cents,
        qrCode: row.qr_code,
        notes: row.notes,
        createdAt: row.created_at,
        bulk: bulk
          ? {
              id: bulk.id,
              equipmentId: row.id,
              unit: bulk.unit,
              totalQty: bulk.total_qty,
              availableQty: bulk.available_qty,
            }
          : undefined,
        unitCount: units.length,
        availableUnitCount: units.filter((u) => u.status === "available").length,
      };
    }) ?? []
  ) satisfies Equipment[];
}

export async function getEquipmentById(id: string): Promise<EquipmentWithUnits | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("equipment")
    .select(`
      id, organization_id, category_id, name, brand, model, type, status,
      serial, patrimony, purchase_date, purchase_value_cents, qr_code, notes, created_at,
      equipment_categories (id, name),
      bulk_inventory (id, unit, total_qty, available_qty),
      equipment_units (id, serial, patrimony, status, qr_code, notes, created_at)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const cat = data.equipment_categories as unknown as { id: string; name: string } | null;
  const bulk = (data.bulk_inventory as unknown as { id: string; unit: string; total_qty: number; available_qty: number }[] | null)?.[0] ?? null;
  const units = (data.equipment_units as unknown as { id: string; serial: string; patrimony: string | null; status: string; qr_code: string | null; notes: string | null; created_at: string }[]) ?? [];

  return {
    id: data.id,
    organizationId: data.organization_id,
    categoryId: data.category_id,
    categoryName: cat?.name ?? null,
    name: data.name,
    brand: data.brand,
    model: data.model,
    type: data.type as EquipmentType,
    status: data.status as EquipmentStatus,
    serial: data.serial,
    patrimony: data.patrimony,
    purchaseDate: data.purchase_date,
    purchaseValueCents: data.purchase_value_cents,
    qrCode: data.qr_code,
    notes: data.notes,
    createdAt: data.created_at,
    bulk: bulk
      ? {
          id: bulk.id,
          equipmentId: data.id,
          unit: bulk.unit,
          totalQty: bulk.total_qty,
          availableQty: bulk.available_qty,
        }
      : undefined,
    unitCount: units.length,
    availableUnitCount: units.filter((u) => u.status === "available").length,
    units: units.map((u) => ({
      id: u.id,
      equipmentId: data.id,
      serial: u.serial,
      patrimony: u.patrimony,
      status: u.status as EquipmentStatus,
      qrCode: u.qr_code,
      notes: u.notes,
      createdAt: u.created_at,
    })),
  };
}

// ──────────────────────────────────────────────────────────────────
// Disponibilidade por data (controle de overbooking entre OS)
// ──────────────────────────────────────────────────────────────────

export interface EquipmentAvailability {
  total: number;          // capacidade total descontando manutenção/inativo
  allocated: number;      // soma já comprometida em outras OS no período
  available: number;      // total - allocated (clamp >= 0)
}

/**
 * Calcula disponibilidade efetiva de cada equipamento da organização para um
 * período. Considera "ocupando estoque" eventos com status
 *   planning ∪ ready_to_load ∪ in_field
 * cujas datas se sobrepõem ao intervalo [startDate, endDate].
 *
 * `excludeEventId` permite ignorar a OS atual (para mostrar quanto OUTRAS OS
 * já reservaram, deixando o cap real para a OS sendo editada).
 *
 * Sobreposição: A.start <= B.end AND A.end >= B.start.
 */
export async function getEquipmentAvailability(
  organizationId: string,
  startDate: string,
  endDate: string,
  excludeEventId?: string
): Promise<Map<string, EquipmentAvailability>> {
  const supabase = createSupabaseAdminClient();

  // 1) Capacidade total por equipamento.
  //    - serializado: count(equipment_units) com status NOT IN ('maintenance', 'inactive')
  //    - bulk:        bulk_inventory.total_qty
  const { data: equipRows, error: equipErr } = await supabase
    .from("equipment")
    .select(
      `
      id, type,
      equipment_units (id, status),
      bulk_inventory (total_qty)
    `
    )
    .eq("organization_id", organizationId);
  if (equipErr) throw equipErr;

  // 2) Alocação somada em OS sobrepostas (excluindo a OS atual, se informada).
  let allocQuery = supabase
    .from("event_equipment")
    .select(
      `
      equipment_id, qty,
      events!inner (id, organization_id, status, start_date, end_date)
    `
    )
    .eq("events.organization_id", organizationId)
    .in("events.status", ["planning", "ready_to_load", "in_field"])
    .lte("events.start_date", endDate)
    .gte("events.end_date", startDate);

  if (excludeEventId) {
    allocQuery = allocQuery.neq("events.id", excludeEventId);
  }

  const { data: allocData, error: allocErr } = await allocQuery;
  if (allocErr) throw allocErr;

  const allocMap = new Map<string, number>();
  for (const row of allocData ?? []) {
    const prev = allocMap.get(row.equipment_id) ?? 0;
    allocMap.set(row.equipment_id, prev + (row.qty ?? 0));
  }

  const result = new Map<string, EquipmentAvailability>();
  for (const eq of equipRows ?? []) {
    let total = 0;
    if (eq.type === "serialized") {
      const units =
        (eq.equipment_units as unknown as { id: string; status: string }[]) ?? [];
      total = units.filter(
        (u) => u.status !== "maintenance" && u.status !== "inactive"
      ).length;
    } else {
      const bulk =
        (eq.bulk_inventory as unknown as { total_qty: number }[] | null)?.[0] ??
        null;
      total = bulk?.total_qty ?? 0;
    }
    const allocated = allocMap.get(eq.id) ?? 0;
    result.set(eq.id, {
      total,
      allocated,
      available: Math.max(0, total - allocated),
    });
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────
// Helpers de formatação
// ──────────────────────────────────────────────────────────────────

export function formatEquipmentStatus(status: EquipmentStatus): string {
  const map: Record<EquipmentStatus, string> = {
    available: "Disponível",
    reserved: "Reservado",
    in_field: "Em Campo",
    maintenance: "Manutenção",
    inactive: "Inativo",
  };
  return map[status];
}

export function formatPurchaseValue(cents: number | null): string {
  if (!cents) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** Gera um QR code token único para um equipamento/unit */
export function generateQrToken(prefix: string, id: string): string {
  return `PTN-${prefix.toUpperCase()}-${id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}
