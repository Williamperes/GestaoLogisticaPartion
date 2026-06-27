import { createSupabaseAdminClient } from "@/lib/supabase/server";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type EquipmentType = "serialized" | "bulk";

export type EquipmentStatus = "available" | "reserved" | "in_field" | "maintenance" | "inactive";

/** Condição de uma unidade no retorno de uma OS. */
export type UnitCondition = "ok" | "damaged" | "lost";

export interface EquipmentCategory {
  id: string;
  organizationId: string;
  name: string;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
  equipmentCount: number;
}

export interface EquipmentVariant {
  id: string;
  equipmentId: string;
  label: string;
  sortValue: number | null;
  position: number;
  notes: string | null;
  /** Estoque associado à variante. Para bulk: total_qty; para serializado: count de units. */
  totalQty?: number;
  availableQty?: number;
}

export interface EquipmentUnit {
  id: string;
  equipmentId: string;
  variantId: string | null;
  serial: string | null;
  patrimony: string | null;
  status: EquipmentStatus;
  qrCode: string | null;
  /** Data em que um QR próprio foi vinculado. NULL = token auto-gerado. */
  qrLinkedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface BulkInventory {
  id: string;
  equipmentId: string;
  variantId: string | null;
  unit: string;
  totalQty: number;
  availableQty: number;
}

export interface Equipment {
  id: string;
  organizationId: string;
  categoryId: string | null;
  categoryName: string | null;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  type: EquipmentType;
  status: EquipmentStatus;
  hasVariants: boolean;
  serial: string | null;
  patrimony: string | null;
  purchaseDate: string | null;
  purchaseValueCents: number | null;
  qrCode: string | null;
  notes: string | null;
  createdAt: string;
  // Populated for bulk (when no variants)
  bulk?: BulkInventory;
  // Populated for serialized summary
  unitCount?: number;
  availableUnitCount?: number;
  // Populated when has_variants = true
  variants?: EquipmentVariant[];
}

export interface EquipmentWithUnits extends Equipment {
  units: EquipmentUnit[];
}

// Identificador composto usado nos Maps de disponibilidade: equipment + variant.
// Sem variante → chave é só o equipmentId. Mantém compatibilidade com itens
// que ainda não usam variantes.
export function availabilityKey(
  equipmentId: string,
  variantId: string | null | undefined
): string {
  return variantId ? `${equipmentId}:${variantId}` : equipmentId;
}

export interface EquipmentAllocation {
  eventId: string;
  eventName: string;
  eventStatus: "planning" | "ready_to_load" | "in_field" | "completed" | "cancelled";
  startDate: string;
  endDate: string;
  variantId: string | null;
  variantLabel: string | null;
  qty: number;
}

// ──────────────────────────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────────────────────────

export async function listEquipmentCategories(organizationId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_categories")
    .select(
      `
      id, organization_id, name, parent_category_id,
      parent:parent_category_id (id, name),
      equipment(count)
    `
    )
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) throw error;

  return (
    data?.map((c) => {
      const parent = c.parent as unknown as { id: string; name: string } | null;
      return {
        id: c.id,
        organizationId: c.organization_id,
        name: c.name,
        parentCategoryId: c.parent_category_id,
        parentCategoryName: parent?.name ?? null,
        equipmentCount:
          (c.equipment as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
      };
    }) ?? []
  ) satisfies EquipmentCategory[];
}

export async function listEquipment(organizationId: string, search?: string): Promise<Equipment[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("equipment")
    .select(`
      id, organization_id, category_id, name, brand, model, type, status, has_variants,
      serial, patrimony, purchase_date, purchase_value_cents, qr_code, notes, created_at,
      equipment_categories (
        id, name, parent_category_id,
        parent:parent_category_id (id, name)
      ),
      bulk_inventory (id, variant_id, unit, total_qty, available_qty),
      equipment_units (id, variant_id, status),
      equipment_variants (id, label, sort_value, position, notes)
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
      const cat = row.equipment_categories as unknown as {
        id: string;
        name: string;
        parent_category_id: string | null;
        parent: { id: string; name: string } | null;
      } | null;
      const bulkRows =
        (row.bulk_inventory as unknown as {
          id: string;
          variant_id: string | null;
          unit: string;
          total_qty: number;
          available_qty: number;
        }[] | null) ?? [];
      const bulkNoVariant = bulkRows.find((b) => b.variant_id === null) ?? null;
      const units =
        (row.equipment_units as unknown as {
          id: string;
          variant_id: string | null;
          status: string;
        }[]) ?? [];
      const variantRows =
        (row.equipment_variants as unknown as {
          id: string;
          label: string;
          sort_value: number | null;
          position: number;
          notes: string | null;
        }[]) ?? [];

      const variants: EquipmentVariant[] = variantRows
        .slice()
        .sort((a, b) => {
          if (a.position !== b.position) return a.position - b.position;
          if (a.sort_value !== null && b.sort_value !== null && a.sort_value !== b.sort_value) {
            return a.sort_value - b.sort_value;
          }
          return a.label.localeCompare(b.label);
        })
        .map((v) => {
          const bulkForVariant = bulkRows.find((b) => b.variant_id === v.id);
          const unitsForVariant = units.filter((u) => u.variant_id === v.id);
          return {
            id: v.id,
            equipmentId: row.id,
            label: v.label,
            sortValue: v.sort_value,
            position: v.position,
            notes: v.notes,
            totalQty: bulkForVariant?.total_qty ?? unitsForVariant.length,
            availableQty:
              bulkForVariant?.available_qty ??
              unitsForVariant.filter((u) => u.status === "available").length,
          };
        });

      return {
        id: row.id,
        organizationId: row.organization_id,
        categoryId: row.category_id,
        categoryName: cat?.name ?? null,
        parentCategoryId: cat?.parent_category_id ?? null,
        parentCategoryName: cat?.parent?.name ?? null,
        name: row.name,
        brand: row.brand,
        model: row.model,
        type: row.type as EquipmentType,
        status: row.status as EquipmentStatus,
        hasVariants: row.has_variants,
        serial: row.serial,
        patrimony: row.patrimony,
        purchaseDate: row.purchase_date,
        purchaseValueCents: row.purchase_value_cents,
        qrCode: row.qr_code,
        notes: row.notes,
        createdAt: row.created_at,
        bulk: bulkNoVariant
          ? {
              id: bulkNoVariant.id,
              equipmentId: row.id,
              variantId: null,
              unit: bulkNoVariant.unit,
              totalQty: bulkNoVariant.total_qty,
              availableQty: bulkNoVariant.available_qty,
            }
          : undefined,
        unitCount: units.length,
        availableUnitCount: units.filter((u) => u.status === "available").length,
        variants: row.has_variants ? variants : undefined,
      };
    }) ?? []
  ) satisfies Equipment[];
}

export async function getEquipmentById(id: string): Promise<EquipmentWithUnits | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("equipment")
    .select(`
      id, organization_id, category_id, name, brand, model, type, status, has_variants,
      serial, patrimony, purchase_date, purchase_value_cents, qr_code, notes, created_at,
      equipment_categories (
        id, name, parent_category_id,
        parent:parent_category_id (id, name)
      ),
      bulk_inventory (id, variant_id, unit, total_qty, available_qty),
      equipment_units (id, variant_id, serial, patrimony, status, qr_code, qr_linked_at, notes, created_at),
      equipment_variants (id, label, sort_value, position, notes)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const cat = data.equipment_categories as unknown as {
    id: string;
    name: string;
    parent_category_id: string | null;
    parent: { id: string; name: string } | null;
  } | null;
  const bulkRows =
    (data.bulk_inventory as unknown as {
      id: string;
      variant_id: string | null;
      unit: string;
      total_qty: number;
      available_qty: number;
    }[] | null) ?? [];
  const bulkNoVariant = bulkRows.find((b) => b.variant_id === null) ?? null;
  const units =
    (data.equipment_units as unknown as {
      id: string;
      variant_id: string | null;
      serial: string | null;
      patrimony: string | null;
      status: string;
      qr_code: string | null;
      qr_linked_at: string | null;
      notes: string | null;
      created_at: string;
    }[]) ?? [];
  const variantRows =
    (data.equipment_variants as unknown as {
      id: string;
      label: string;
      sort_value: number | null;
      position: number;
      notes: string | null;
    }[]) ?? [];

  const variants: EquipmentVariant[] = variantRows
    .slice()
    .sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      if (a.sort_value !== null && b.sort_value !== null && a.sort_value !== b.sort_value) {
        return a.sort_value - b.sort_value;
      }
      return a.label.localeCompare(b.label);
    })
    .map((v) => {
      const bulkForVariant = bulkRows.find((b) => b.variant_id === v.id);
      const unitsForVariant = units.filter((u) => u.variant_id === v.id);
      return {
        id: v.id,
        equipmentId: data.id,
        label: v.label,
        sortValue: v.sort_value,
        position: v.position,
        notes: v.notes,
        totalQty: bulkForVariant?.total_qty ?? unitsForVariant.length,
        availableQty:
          bulkForVariant?.available_qty ??
          unitsForVariant.filter((u) => u.status === "available").length,
      };
    });

  return {
    id: data.id,
    organizationId: data.organization_id,
    categoryId: data.category_id,
    categoryName: cat?.name ?? null,
    parentCategoryId: cat?.parent_category_id ?? null,
    parentCategoryName: cat?.parent?.name ?? null,
    name: data.name,
    brand: data.brand,
    model: data.model,
    type: data.type as EquipmentType,
    status: data.status as EquipmentStatus,
    hasVariants: data.has_variants,
    serial: data.serial,
    patrimony: data.patrimony,
    purchaseDate: data.purchase_date,
    purchaseValueCents: data.purchase_value_cents,
    qrCode: data.qr_code,
    notes: data.notes,
    createdAt: data.created_at,
    bulk: bulkNoVariant
      ? {
          id: bulkNoVariant.id,
          equipmentId: data.id,
          variantId: null,
          unit: bulkNoVariant.unit,
          totalQty: bulkNoVariant.total_qty,
          availableQty: bulkNoVariant.available_qty,
        }
      : undefined,
    unitCount: units.length,
    availableUnitCount: units.filter((u) => u.status === "available").length,
    variants: data.has_variants ? variants : undefined,
    units: units.map((u) => ({
      id: u.id,
      equipmentId: data.id,
      variantId: u.variant_id,
      serial: u.serial,
      patrimony: u.patrimony,
      status: u.status as EquipmentStatus,
      qrCode: u.qr_code,
      qrLinkedAt: u.qr_linked_at,
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
 * Calcula disponibilidade efetiva PER (equipment, variant) para um conjunto
 * de datas específicas. O Map é chaveado por
 * `availabilityKey(equipmentId, variantId)`:
 *   - sem variante → chave é só o equipmentId
 *   - com variante → "<equipmentId>:<variantId>"
 *
 * Conflito = OS ativa (status planning|ready_to_load|in_field) com ao menos
 * uma `event_dates.date` em comum com `dates`. Não usa o cache
 * `events.start_date/end_date`, pois multi-data não-consecutiva (ex.: 01/08
 * + 15/08) gera falsos positivos quando 08/08 cai no meio do range cache.
 *
 * `excludeEventId` ignora a OS atual (mostra o cap real assumindo que
 * outras OS ficam fixas).
 *
 * Passe `dates: []` para indicar "sem datas" → sem conflitos
 * (`allocated` = 0 para todas as chaves).
 */
export async function getEquipmentAvailability(
  organizationId: string,
  dates: string[],
  excludeEventId?: string
): Promise<Map<string, EquipmentAvailability>> {
  const supabase = createSupabaseAdminClient();

  // 1) Capacidade total por (equipment, variant).
  //    - serializado sem variantes: count(equipment_units) por equipment.
  //    - serializado com variantes: count por (equipment_id, variant_id).
  //    - bulk sem variantes: bulk_inventory.total_qty (variant_id IS NULL).
  //    - bulk com variantes: uma row por variante.
  const { data: equipRows, error: equipErr } = await supabase
    .from("equipment")
    .select(
      `
      id, type, has_variants,
      equipment_units (id, variant_id, status),
      bulk_inventory (variant_id, total_qty),
      equipment_variants (id)
    `
    )
    .eq("organization_id", organizationId);
  if (equipErr) throw equipErr;

  // 2) Encontrar IDs de OS que têm ao menos UMA data em comum com `dates`.
  //    Resolve o false-positive de OS multi-data não-consecutiva.
  const allocMap = new Map<string, number>();

  if (dates.length > 0) {
    const { data: overlapData, error: overlapErr } = await supabase
      .from("event_dates")
      .select("event_id, events!inner (id, organization_id, status)")
      .in("date", dates)
      .eq("events.organization_id", organizationId)
      .in("events.status", ["planning", "ready_to_load", "in_field"]);
    if (overlapErr) throw overlapErr;

    const overlappingEventIds = new Set<string>();
    for (const row of overlapData ?? []) {
      const rel = (row as unknown as { event_id: string }).event_id;
      if (excludeEventId && rel === excludeEventId) continue;
      overlappingEventIds.add(rel);
    }

    if (overlappingEventIds.size > 0) {
      const { data: allocData, error: allocErr } = await supabase
        .from("event_equipment")
        .select("equipment_id, variant_id, qty, returned_at")
        .in("event_id", Array.from(overlappingEventIds))
        .is("returned_at", null);
      if (allocErr) throw allocErr;

      for (const row of allocData ?? []) {
        const key = availabilityKey(row.equipment_id, row.variant_id ?? null);
        const prev = allocMap.get(key) ?? 0;
        allocMap.set(key, prev + (row.qty ?? 0));
      }
    }
  }

  const result = new Map<string, EquipmentAvailability>();
  for (const eq of equipRows ?? []) {
    const variantIds =
      (eq.equipment_variants as unknown as { id: string }[] | null)?.map((v) => v.id) ?? [];
    const units =
      (eq.equipment_units as unknown as { id: string; variant_id: string | null; status: string }[]) ?? [];
    const bulkRows =
      (eq.bulk_inventory as unknown as { variant_id: string | null; total_qty: number }[]) ?? [];

    function pushAvailability(variantId: string | null) {
      let total = 0;
      if (eq.type === "serialized") {
        total = units.filter(
          (u) => u.variant_id === variantId && u.status !== "maintenance" && u.status !== "inactive"
        ).length;
      } else {
        const bulk = bulkRows.find((b) => b.variant_id === variantId);
        total = bulk?.total_qty ?? 0;
      }
      const key = availabilityKey(eq.id, variantId);
      const allocated = allocMap.get(key) ?? 0;
      result.set(key, {
        total,
        allocated,
        available: Math.max(0, total - allocated),
      });
    }

    if (eq.has_variants && variantIds.length > 0) {
      for (const vid of variantIds) pushAvailability(vid);
    } else {
      pushAvailability(null);
    }
  }

  return result;
}

/**
 * Lista OS que estão alocando este equipamento, agrupado por
 * (eventId, variantId). Padrão filtra apenas status ativos
 * (planning|ready_to_load|in_field). Inclua completed/cancelled
 * passando includeInactive=true.
 *
 * Ordenado por startDate desc (mais recente primeiro).
 */
export async function getEquipmentAllocations(
  equipmentId: string,
  options: { includeInactive?: boolean } = {}
): Promise<EquipmentAllocation[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("event_equipment")
    .select(
      `
      qty, variant_id,
      equipment_variants (label),
      events!inner (id, name, status, start_date, end_date)
      `
    )
    .eq("equipment_id", equipmentId);

  if (!options.includeInactive) {
    query = query.in("events.status", ["planning", "ready_to_load", "in_field"]);
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    qty: number;
    variant_id: string | null;
    equipment_variants: { label: string } | null;
    events: {
      id: string;
      name: string;
      status: EquipmentAllocation["eventStatus"];
      start_date: string;
      end_date: string;
    };
  };

  const grouped = new Map<string, EquipmentAllocation>();
  for (const row of (data as unknown as Row[]) ?? []) {
    const key = `${row.events.id}:${row.variant_id ?? ""}`;
    const prev = grouped.get(key);
    const qty = (prev?.qty ?? 0) + (row.qty ?? 0);
    grouped.set(key, {
      eventId: row.events.id,
      eventName: row.events.name,
      eventStatus: row.events.status,
      startDate: row.events.start_date,
      endDate: row.events.end_date,
      variantId: row.variant_id,
      variantLabel: row.equipment_variants?.label ?? null,
      qty,
    });
  }

  return Array.from(grouped.values()).sort((a, b) =>
    b.startDate.localeCompare(a.startDate)
  );
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

// ──────────────────────────────────────────────────────────────────
// QR Code resolution
// ──────────────────────────────────────────────────────────────────

export interface EquipmentUnitLookup {
  id: string;
  equipmentId: string;
  organizationId: string;
  variantId: string | null;
  status: EquipmentStatus;
}

export async function getEquipmentUnitByQrCode(
  qrCode: string
): Promise<EquipmentUnitLookup | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_units")
    .select(
      `id, equipment_id, variant_id, status,
       equipment (organization_id)`
    )
    .eq("qr_code", qrCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    equipment_id: string;
    variant_id: string | null;
    status: EquipmentStatus;
    equipment: { organization_id: string } | null;
  };

  if (!row.equipment) return null;
  return {
    id: row.id,
    equipmentId: row.equipment_id,
    organizationId: row.equipment.organization_id,
    variantId: row.variant_id,
    status: row.status,
  };
}
