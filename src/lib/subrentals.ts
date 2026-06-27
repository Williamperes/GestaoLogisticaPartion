import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type SubrentalDirection = "inbound" | "outbound";
export type SubrentalStatus = "pending" | "out" | "returned";

export interface Subrental {
  id: string;
  organizationId: string;
  direction: SubrentalDirection;
  partnerName: string;
  itemDescription: string;
  qty: number;
  valueCents: number | null;
  eventId: string | null;
  eventName: string | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  status: SubrentalStatus;
  outAt: string | null;
  returnedAt: string | null;
  notes: string | null;
  createdAt: string;
}

/**
 * Lista as sublocações de uma organização. Filtro opcional por direção.
 * Ordenado por mais recente primeiro.
 */
export async function listSubrentals(
  organizationId: string,
  options: { direction?: SubrentalDirection } = {}
): Promise<Subrental[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("subrentals")
    .select(
      `
      id, organization_id, direction, partner_name, item_description, qty,
      value_cents, event_id, expected_start, expected_end, status,
      out_at, returned_at, notes, created_at,
      events (name)
      `
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (options.direction) {
    query = query.eq("direction", options.direction);
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    id: string;
    organization_id: string;
    direction: SubrentalDirection;
    partner_name: string;
    item_description: string;
    qty: number;
    value_cents: number | null;
    event_id: string | null;
    expected_start: string | null;
    expected_end: string | null;
    status: SubrentalStatus;
    out_at: string | null;
    returned_at: string | null;
    notes: string | null;
    created_at: string;
    events: { name: string } | null;
  };

  return ((data as unknown as Row[]) ?? []).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    direction: r.direction,
    partnerName: r.partner_name,
    itemDescription: r.item_description,
    qty: r.qty,
    valueCents: r.value_cents,
    eventId: r.event_id,
    eventName: r.events?.name ?? null,
    expectedStart: r.expected_start,
    expectedEnd: r.expected_end,
    status: r.status,
    outAt: r.out_at,
    returnedAt: r.returned_at,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

export function formatSubrentalDirection(direction: SubrentalDirection): string {
  return direction === "inbound" ? "Alugado de terceiro" : "Locado para parceiro";
}

export function formatSubrentalStatus(status: SubrentalStatus): string {
  const map: Record<SubrentalStatus, string> = {
    pending: "Pendente",
    out: "Em uso",
    returned: "Devolvido",
  };
  return map[status];
}
