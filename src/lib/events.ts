import { createSupabaseAdminClient } from "@/lib/supabase/server";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type EventStatus = "planning" | "ready_to_load" | "in_field" | "completed" | "cancelled";

export interface EventChecklistItem {
  id: string;
  eventId: string;
  label: string;
  position: number;
  done: boolean;
  doneAt: string | null;
  doneBy: string | null;
}

export interface EventEquipmentItem {
  id: string;
  eventId: string;
  equipmentId: string;
  equipmentName: string;
  unitId: string | null;
  unitSerial: string | null;
  qty: number;
  confirmed: boolean;
  notes: string | null;
}

export interface Event {
  id: string;
  organizationId: string;
  clientOrganizationId: string | null;
  clientName: string | null;
  name: string;
  venue: string | null;
  city: string | null;
  venueNotes: string | null;
  startDate: string;
  endDate: string;
  status: EventStatus;
  createdAt: string;
  // Summary counts
  checklistTotal?: number;
  checklistDone?: number;
  equipmentCount?: number;
}

export interface EventDetail extends Event {
  checklist: EventChecklistItem[];
  equipment: EventEquipmentItem[];
}

// ──────────────────────────────────────────────────────────────────
// Checklist padrão (template fixo)
// ──────────────────────────────────────────────────────────────────

export const DEFAULT_CHECKLIST_ITEMS: { label: string; position: number }[] = [
  { label: "Palestrantes / artistas confirmados", position: 0 },
  { label: "Plano de palco aprovado pelo cliente", position: 1 },
  { label: "Rider técnico revisado", position: 2 },
  { label: "Logística de transporte definida", position: 3 },
  { label: "Plano de contingência elaborado", position: 4 },
];

// ──────────────────────────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────────────────────────

export async function listEvents(organizationId: string, search?: string): Promise<Event[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("events")
    .select(`
      id, organization_id, client_organization_id, name, venue, city,
      venue_notes, start_date, end_date, status, created_at,
      organizations!events_client_organization_id_fkey (name),
      event_checklist_items (id, done),
      event_equipment (id)
    `)
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: false });

  const q = search?.trim();
  if (q) {
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,venue.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (
    data?.map((row) => {
      const clientOrg = row.organizations as unknown as { name: string } | null;
      const checklist = (row.event_checklist_items as unknown as { id: string; done: boolean }[]) ?? [];
      const equipment = (row.event_equipment as unknown as { id: string }[]) ?? [];

      return {
        id: row.id,
        organizationId: row.organization_id,
        clientOrganizationId: row.client_organization_id,
        clientName: clientOrg?.name ?? null,
        name: row.name,
        venue: row.venue,
        city: row.city,
        venueNotes: row.venue_notes,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status as EventStatus,
        createdAt: row.created_at,
        checklistTotal: checklist.length,
        checklistDone: checklist.filter((c) => c.done).length,
        equipmentCount: equipment.length,
      };
    }) ?? []
  ) satisfies Event[];
}

export async function getEventById(id: string): Promise<EventDetail | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("events")
    .select(`
      id, organization_id, client_organization_id, name, venue, city,
      venue_notes, start_date, end_date, status, created_at,
      organizations!events_client_organization_id_fkey (name),
      event_checklist_items (id, event_id, label, position, done, done_at, done_by),
      event_equipment (
        id, event_id, equipment_id, unit_id, qty, confirmed, notes,
        equipment (id, name),
        equipment_units (id, serial)
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const clientOrg = data.organizations as unknown as { name: string } | null;
  const checklist = (
    data.event_checklist_items as unknown as {
      id: string; event_id: string; label: string; position: number;
      done: boolean; done_at: string | null; done_by: string | null;
    }[]
  ) ?? [];
  const equipRows = (
    data.event_equipment as unknown as {
      id: string; event_id: string; equipment_id: string; unit_id: string | null;
      qty: number; confirmed: boolean; notes: string | null;
      equipment: { id: string; name: string };
      equipment_units: { id: string; serial: string } | null;
    }[]
  ) ?? [];

  return {
    id: data.id,
    organizationId: data.organization_id,
    clientOrganizationId: data.client_organization_id,
    clientName: clientOrg?.name ?? null,
    name: data.name,
    venue: data.venue,
    city: data.city,
    venueNotes: data.venue_notes,
    startDate: data.start_date,
    endDate: data.end_date,
    status: data.status as EventStatus,
    createdAt: data.created_at,
    checklistTotal: checklist.length,
    checklistDone: checklist.filter((c) => c.done).length,
    equipmentCount: equipRows.length,
    checklist: checklist
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        id: c.id,
        eventId: c.event_id,
        label: c.label,
        position: c.position,
        done: c.done,
        doneAt: c.done_at,
        doneBy: c.done_by,
      })),
    equipment: equipRows.map((e) => ({
      id: e.id,
      eventId: e.event_id,
      equipmentId: e.equipment_id,
      equipmentName: e.equipment.name,
      unitId: e.unit_id,
      unitSerial: e.equipment_units?.serial ?? null,
      qty: e.qty,
      confirmed: e.confirmed,
      notes: e.notes,
    })),
  };
}

// ──────────────────────────────────────────────────────────────────
// Helpers de negócio
// ──────────────────────────────────────────────────────────────────

export function isChecklistComplete(items: Pick<EventChecklistItem, "done">[]): boolean {
  return items.length > 0 && items.every((i) => i.done);
}

export function getGateProgress(items: Pick<EventChecklistItem, "done">[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

export function formatEventStatus(status: EventStatus): string {
  const map: Record<EventStatus, string> = {
    planning: "Planejamento",
    ready_to_load: "Pronto para Carga",
    in_field: "Em Campo",
    completed: "Concluído",
    cancelled: "Cancelado",
  };
  return map[status];
}
