import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ChecklistSection } from "@/lib/checklist-templates";
import { getEquipmentAvailability, availabilityKey } from "@/lib/inventory";
import type { EventExtra, EventExtraKind, EventSpeaker } from "@/lib/event-aux";

export type { EventExtra, EventExtraKind, EventSpeaker } from "@/lib/event-aux";
export { EVENT_EXTRA_KIND_LABELS } from "@/lib/event-aux";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type EventStatus = "planning" | "ready_to_load" | "in_field" | "completed" | "cancelled";

export interface EventChecklistItem {
  id: string;
  eventId: string;
  label: string;
  position: number;
  section: ChecklistSection;
  required: boolean;
  templateItemId: string | null;
  done: boolean;
  doneAt: string | null;
  doneBy: string | null;
}

export interface EventEquipmentUnit {
  id: string;
  eventEquipmentId: string;
  equipmentUnitId: string;
  loadedAt: string | null;
  loadedBy: string | null;
  returnedAt: string | null;
  returnedBy: string | null;
}

export interface EventEquipmentItem {
  id: string;
  eventId: string;
  equipmentId: string;
  equipmentName: string;
  variantId: string | null;
  variantLabel: string | null;
  unitId: string | null;
  unitSerial: string | null;
  unitStatus: string | null;
  qty: number;
  separated: boolean;
  separatedAt: string | null;
  separatedBy: string | null;
  loaded: boolean;
  loadedAt: string | null;
  loadedBy: string | null;
  returnedAt: string | null;
  loadedUnitsCount: number;
  returnedUnitsCount: number;
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
  // Operational details
  vehicle: string | null;
  lightingColor: string | null;
  assemblyAt: string | null;
  teardownAt: string | null;
  agencyName: string | null;
  notes: string | null;
  executivePresent: boolean;
  isRecorded: boolean;
  isLivestreamed: boolean;
  clientDemanding: boolean;
  agencyDetailed: boolean;
  previousDayAssembly: boolean;
  requiresAdvanceCredential: boolean;
  strictVenueHours: boolean;
  // Summary counts
  checklistTotal?: number;
  checklistDone?: number;
  equipmentCount?: number;
  equipmentBrief?: EventEquipmentBrief[];
  // Datas reais (não o cache start_date/end_date) usadas para o
  // overlap exato em getEquipmentAvailability.
  dates?: string[];
}

export interface EventEquipmentBrief {
  equipmentId: string;
  variantId: string | null;
  qty: number;
}

export interface EventDetail extends Event {
  checklist: EventChecklistItem[];
  equipment: EventEquipmentItem[];
  speakers: EventSpeaker[];
  extras: EventExtra[];
}

// ──────────────────────────────────────────────────────────────────
// Checklist padrão — usado quando organização não tem nenhum template
// cadastrado e nenhum template é selecionado na criação da OS.
// ──────────────────────────────────────────────────────────────────

export const DEFAULT_CHECKLIST_ITEMS: {
  label: string;
  position: number;
  section: ChecklistSection;
  required: boolean;
}[] = [
  { label: "Palestrantes / artistas confirmados", position: 0, section: "strategic", required: true },
  { label: "Plano de palco aprovado pelo cliente", position: 1, section: "strategic", required: true },
  { label: "Rider técnico revisado", position: 2, section: "strategic", required: true },
  { label: "Logística de transporte definida", position: 3, section: "operational", required: true },
  { label: "Plano de contingência elaborado", position: 4, section: "strategic", required: true },
];

// ──────────────────────────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────────────────────────

export async function listEvents(
  organizationId: string,
  search?: string,
  opts?: { restrictTeamMemberId?: string | null }
): Promise<Event[]> {
  const supabase = createSupabaseAdminClient();

  // Restringe à OS onde o team_member está na escala.
  // Resolve event_ids via event_dates → event_date_team_members.
  let allowedEventIds: string[] | null = null;
  if (opts?.restrictTeamMemberId) {
    const { data: edtm, error: edtmErr } = await supabase
      .from("event_date_team_members")
      .select("event_dates!inner(event_id)")
      .eq("team_member_id", opts.restrictTeamMemberId);
    if (edtmErr) throw edtmErr;
    const eventIds = new Set<string>();
    for (const row of (edtm as unknown as { event_dates: { event_id: string } }[]) ?? []) {
      if (row.event_dates?.event_id) eventIds.add(row.event_dates.event_id);
    }
    allowedEventIds = [...eventIds];
    if (allowedEventIds.length === 0) return [];
  }

  let query = supabase
    .from("events")
    .select(`
      id, organization_id, client_organization_id, name, venue, city,
      venue_notes, start_date, end_date, status, created_at,
      vehicle, lighting_color, assembly_at, teardown_at, agency_name, notes,
      executive_present, is_recorded, is_livestreamed, client_demanding,
      agency_detailed, previous_day_assembly, requires_advance_credential,
      strict_venue_hours,
      organizations!events_client_organization_id_fkey (name),
      event_checklist_items (id, done, required),
      event_equipment (id, equipment_id, variant_id, qty),
      event_dates (date)
    `)
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: false });

  if (allowedEventIds) {
    query = query.in("id", allowedEventIds);
  }

  const q = search?.trim();
  if (q) {
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,venue.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (
    data?.map((row) => {
      const clientOrg = row.organizations as unknown as { name: string } | null;
      const checklist =
        (row.event_checklist_items as unknown as { id: string; done: boolean; required: boolean }[]) ?? [];
      const equipment =
        (row.event_equipment as unknown as {
          id: string;
          equipment_id: string;
          variant_id: string | null;
          qty: number;
        }[]) ?? [];
      const dates =
        ((row.event_dates as unknown as { date: string }[]) ?? []).map((d) => d.date);
      const requiredItems = checklist.filter((c) => c.required ?? true);

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
        vehicle: row.vehicle,
        lightingColor: row.lighting_color,
        assemblyAt: row.assembly_at,
        teardownAt: row.teardown_at,
        agencyName: row.agency_name,
        notes: row.notes,
        executivePresent: row.executive_present,
        isRecorded: row.is_recorded,
        isLivestreamed: row.is_livestreamed,
        clientDemanding: row.client_demanding,
        agencyDetailed: row.agency_detailed,
        previousDayAssembly: row.previous_day_assembly,
        requiresAdvanceCredential: row.requires_advance_credential,
        strictVenueHours: row.strict_venue_hours,
        checklistTotal: requiredItems.length,
        checklistDone: requiredItems.filter((c) => c.done).length,
        equipmentCount: equipment.length,
        equipmentBrief: equipment.map((e) => ({
          equipmentId: e.equipment_id,
          variantId: e.variant_id ?? null,
          qty: e.qty,
        })),
        dates,
      };
    }) ?? []
  ) satisfies Event[];
}

/**
 * Retorna Set com IDs de OS que têm pelo menos 1 item alocado acima do
 * estoque disponível para o período. Considera apenas OS em
 * planning|ready_to_load|in_field (que ocupam estoque).
 *
 * Para cada OS ativa: chama getEquipmentAvailability com excludeEventId
 * (mostra cap real assumindo que esta OS ainda pode pegar o que precisa).
 * Se qty pedido > availability sobrante de outras OS, marca como oversold.
 */
export async function getEventsWithInsufficientStock(
  organizationId: string,
  events: Event[]
): Promise<Set<string>> {
  const activeStatuses: EventStatus[] = ["planning", "ready_to_load", "in_field"];
  const candidates = events.filter(
    (e) =>
      activeStatuses.includes(e.status) &&
      (e.equipmentBrief?.length ?? 0) > 0
  );

  const oversold = new Set<string>();

  await Promise.all(
    candidates.map(async (ev) => {
      const evDates = ev.dates ?? [];
      // OS sem datas reais: pula (sem como avaliar overlap).
      if (evDates.length === 0) return;
      const avail = await getEquipmentAvailability(organizationId, evDates, ev.id);
      for (const item of ev.equipmentBrief ?? []) {
        const key = availabilityKey(item.equipmentId, item.variantId);
        const a = avail.get(key);
        if (!a || item.qty > a.available) {
          oversold.add(ev.id);
          break;
        }
      }
    })
  );

  return oversold;
}

export async function getEventById(id: string): Promise<EventDetail | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("events")
    .select(`
      id, organization_id, client_organization_id, name, venue, city,
      venue_notes, start_date, end_date, status, created_at,
      vehicle, lighting_color, assembly_at, teardown_at, agency_name, notes,
      executive_present, is_recorded, is_livestreamed, client_demanding,
      agency_detailed, previous_day_assembly, requires_advance_credential,
      strict_venue_hours,
      organizations!events_client_organization_id_fkey (name),
      event_checklist_items (id, event_id, label, position, section, required, template_item_id, done, done_at, done_by),
      event_equipment (
        id, event_id, equipment_id, unit_id, variant_id, qty,
        separated, separated_at, separated_by,
        loaded, loaded_at, loaded_by,
        returned_at, notes,
        equipment (id, name),
        equipment_units (id, serial, status),
        equipment_variants (id, label),
        event_equipment_units (id, loaded_at, returned_at)
      ),
      event_speakers (
        id, event_id, name, organization,
        needs_mic, needs_notebook, needs_adapter, needs_dedicated_tech,
        notes, position
      ),
      event_extras (
        id, event_id, kind, description, qty, supplier, unit_price_cents,
        notes, position
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
      section: ChecklistSection; required: boolean; template_item_id: string | null;
      done: boolean; done_at: string | null; done_by: string | null;
    }[]
  ) ?? [];
  const equipRows = (
    data.event_equipment as unknown as {
      id: string; event_id: string; equipment_id: string; unit_id: string | null;
      variant_id: string | null;
      qty: number;
      separated: boolean; separated_at: string | null; separated_by: string | null;
      loaded: boolean; loaded_at: string | null; loaded_by: string | null;
      returned_at: string | null;
      notes: string | null;
      equipment: { id: string; name: string };
      equipment_units: { id: string; serial: string; status: string } | null;
      equipment_variants: { id: string; label: string } | null;
      event_equipment_units: { id: string; loaded_at: string | null; returned_at: string | null }[] | null;
    }[]
  ) ?? [];
  const speakerRows = (
    data.event_speakers as unknown as {
      id: string; event_id: string; name: string; organization: string | null;
      needs_mic: boolean; needs_notebook: boolean; needs_adapter: boolean;
      needs_dedicated_tech: boolean;
      notes: string | null; position: number;
    }[]
  ) ?? [];
  const extraRows = (
    data.event_extras as unknown as {
      id: string; event_id: string; kind: EventExtraKind; description: string;
      qty: number; supplier: string | null; unit_price_cents: number | null;
      notes: string | null; position: number;
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
    vehicle: data.vehicle,
    lightingColor: data.lighting_color,
    assemblyAt: data.assembly_at,
    teardownAt: data.teardown_at,
    agencyName: data.agency_name,
    notes: data.notes,
    executivePresent: data.executive_present,
    isRecorded: data.is_recorded,
    isLivestreamed: data.is_livestreamed,
    clientDemanding: data.client_demanding,
    agencyDetailed: data.agency_detailed,
    previousDayAssembly: data.previous_day_assembly,
    requiresAdvanceCredential: data.requires_advance_credential,
    strictVenueHours: data.strict_venue_hours,
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
        section: c.section,
        required: c.required,
        templateItemId: c.template_item_id,
        done: c.done,
        doneAt: c.done_at,
        doneBy: c.done_by,
      })),
    equipment: equipRows.map((e) => {
      const eeUnits = e.event_equipment_units ?? [];
      return {
        id: e.id,
        eventId: e.event_id,
        equipmentId: e.equipment_id,
        equipmentName: e.equipment.name,
        variantId: e.variant_id,
        variantLabel: e.equipment_variants?.label ?? null,
        unitId: e.unit_id,
        unitSerial: e.equipment_units?.serial ?? null,
        unitStatus: e.equipment_units?.status ?? null,
        qty: e.qty,
        separated: e.separated,
        separatedAt: e.separated_at,
        separatedBy: e.separated_by,
        loaded: e.loaded,
        loadedAt: e.loaded_at,
        loadedBy: e.loaded_by,
        returnedAt: e.returned_at,
        loadedUnitsCount: eeUnits.filter((u) => u.loaded_at !== null).length,
        returnedUnitsCount: eeUnits.filter((u) => u.returned_at !== null).length,
        notes: e.notes,
      };
    }),
    speakers: speakerRows
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        eventId: s.event_id,
        name: s.name,
        organization: s.organization,
        needsMic: s.needs_mic,
        needsNotebook: s.needs_notebook,
        needsAdapter: s.needs_adapter,
        needsDedicatedTech: s.needs_dedicated_tech,
        notes: s.notes,
        position: s.position,
      })),
    extras: extraRows
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((x) => ({
        id: x.id,
        eventId: x.event_id,
        kind: x.kind,
        description: x.description,
        qty: x.qty,
        supplier: x.supplier,
        unitPriceCents: x.unit_price_cents,
        notes: x.notes,
        position: x.position,
      })),
  };
}

// ──────────────────────────────────────────────────────────────────
// Hub do técnico: events onde tech está escalado, com agregados de
// carga/retorno pra decidir próxima ação.
// ──────────────────────────────────────────────────────────────────

export type ScanEventState =
  | "to_load"        // 0 carregado
  | "loading"        // parcialmente carregado
  | "to_return"      // tudo carregado, 0 retornado
  | "returning"      // retorno parcial
  | "done";          // tudo retornado

export interface MyScanEvent {
  id: string;
  name: string;
  venue: string | null;
  city: string | null;
  startDate: string;
  endDate: string;
  totalQty: number;
  loadedCount: number;
  returnedCount: number;
  state: ScanEventState;
  clientName: string | null;
}

export async function listMyScanEvents(
  teamMemberId: string
): Promise<MyScanEvent[]> {
  const supabase = createSupabaseAdminClient();

  // 1) event_ids onde tech está escalado.
  const { data: scheduleRows, error: scheduleErr } = await supabase
    .from("event_date_team_members")
    .select("event_dates!inner(event_id)")
    .eq("team_member_id", teamMemberId);
  if (scheduleErr) throw scheduleErr;

  const eventIds = Array.from(
    new Set(
      (scheduleRows as unknown as { event_dates: { event_id: string } }[] | null)
        ?.map((r) => r.event_dates?.event_id)
        .filter((id): id is string => Boolean(id)) ?? []
    )
  );
  if (eventIds.length === 0) return [];

  // 2) Eventos + equipment + units pra agregar.
  const { data: events, error: evErr } = await supabase
    .from("events")
    .select(`
      id, name, venue, city, start_date, end_date,
      organizations!events_client_organization_id_fkey (name),
      event_equipment (
        qty,
        event_equipment_units (loaded_at, returned_at)
      )
    `)
    .in("id", eventIds)
    .neq("status", "cancelled")
    .order("start_date", { ascending: true });
  if (evErr) throw evErr;

  type EventRow = {
    id: string;
    name: string;
    venue: string | null;
    city: string | null;
    start_date: string;
    end_date: string;
    organizations: { name: string } | null;
    event_equipment: {
      qty: number;
      event_equipment_units: { loaded_at: string | null; returned_at: string | null }[] | null;
    }[] | null;
  };

  return (events as unknown as EventRow[] | null ?? []).map((ev) => {
    const equipment = ev.event_equipment ?? [];
    let totalQty = 0;
    let loadedCount = 0;
    let returnedCount = 0;
    for (const e of equipment) {
      totalQty += e.qty;
      const units = e.event_equipment_units ?? [];
      loadedCount += units.filter((u) => u.loaded_at !== null).length;
      returnedCount += units.filter((u) => u.returned_at !== null).length;
    }

    let state: ScanEventState;
    if (totalQty === 0) {
      state = "to_load";
    } else if (loadedCount === 0) {
      state = "to_load";
    } else if (loadedCount < totalQty) {
      state = "loading";
    } else if (returnedCount === 0) {
      state = "to_return";
    } else if (returnedCount < totalQty) {
      state = "returning";
    } else {
      state = "done";
    }

    return {
      id: ev.id,
      name: ev.name,
      venue: ev.venue,
      city: ev.city,
      startDate: ev.start_date,
      endDate: ev.end_date,
      totalQty,
      loadedCount,
      returnedCount,
      state,
      clientName: ev.organizations?.name ?? null,
    };
  });
}

// ──────────────────────────────────────────────────────────────────
// Helpers de negócio
// ──────────────────────────────────────────────────────────────────

// Gate considera apenas itens required = true.
// Itens optional contam para o "progresso" mas não bloqueiam a promoção.
type ChecklistGateItem = { done: boolean; required?: boolean };

export function isChecklistComplete(items: ChecklistGateItem[]): boolean {
  const required = items.filter((i) => i.required ?? true);
  return required.length > 0 && required.every((i) => i.done);
}

export function getGateProgress(items: ChecklistGateItem[]): number {
  const required = items.filter((i) => i.required ?? true);
  if (required.length === 0) return 0;
  return Math.round((required.filter((i) => i.done).length / required.length) * 100);
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
