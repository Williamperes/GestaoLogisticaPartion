import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface ClientOrganization {
  id: string;
  name: string;
  slug: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  city: string | null;
  isActive: boolean;
  createdAt: string;
}

export async function listClientOrganizations(search?: string) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("organizations")
    .select("id, name, slug, contact_name, contact_email, contact_phone, address, city, is_active, created_at")
    .eq("type", "client")
    .order("created_at", { ascending: false });

  const normalizedSearch = search?.trim();

  if (normalizedSearch) {
    query = query.or(
      [
        `name.ilike.%${normalizedSearch}%`,
        `city.ilike.%${normalizedSearch}%`,
        `address.ilike.%${normalizedSearch}%`,
        `contact_name.ilike.%${normalizedSearch}%`,
        `contact_email.ilike.%${normalizedSearch}%`,
      ].join(",")
    );
  }

  const { data, error } = await query;

  if (error && error.code !== "42703") {
    throw error;
  }

  if (error?.code === "42703") {
    let fallbackQuery = supabase
      .from("organizations")
      .select("id, name, slug, is_active, created_at")
      .eq("type", "client")
      .order("created_at", { ascending: false });

    if (normalizedSearch) {
      fallbackQuery = fallbackQuery.ilike("name", `%${normalizedSearch}%`);
    }

    const { data: fallbackData, error: fallbackError } = await fallbackQuery;

    if (fallbackError) {
      throw fallbackError;
    }

    return (
      fallbackData?.map((client) => ({
        id: client.id,
        name: client.name,
        slug: client.slug,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        address: null,
        city: null,
        isActive: client.is_active,
        createdAt: client.created_at,
      })) ?? []
    ) satisfies ClientOrganization[];
  }

  return (
    data?.map((client) => ({
      id: client.id,
      name: client.name,
      slug: client.slug,
      contactName: client.contact_name,
      contactEmail: client.contact_email,
      contactPhone: client.contact_phone,
      address: client.address,
      city: client.city,
      isActive: client.is_active,
      createdAt: client.created_at,
    })) ?? []
  ) satisfies ClientOrganization[];
}

export type InvoiceStatus = "draft" | "sent" | "paid";

export interface ClientEvent {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  valueCents: number | null;
  invoiceStatus: InvoiceStatus;
}

export interface ClientBillingSummary {
  eventCount: number;
  totalCents: number;
  paidCents: number;
  pendingCents: number;
}

export async function getClientById(id: string): Promise<ClientOrganization | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, contact_name, contact_email, contact_phone, address, city, is_active, created_at"
    )
    .eq("id", id)
    .eq("type", "client")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    contactName: data.contact_name,
    contactEmail: data.contact_email,
    contactPhone: data.contact_phone,
    address: data.address,
    city: data.city,
    isActive: data.is_active,
    createdAt: data.created_at,
  };
}

/** Histórico de OS de um cliente, mais recente primeiro. */
export async function listClientEvents(clientOrganizationId: string): Promise<ClientEvent[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, name, status, start_date, end_date, value_cents, invoice_status")
    .eq("client_organization_id", clientOrganizationId)
    .order("start_date", { ascending: false });
  if (error) throw error;

  type Row = {
    id: string;
    name: string;
    status: string;
    start_date: string;
    end_date: string;
    value_cents: number | null;
    invoice_status: InvoiceStatus;
  };

  return ((data as unknown as Row[]) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    valueCents: r.value_cents,
    invoiceStatus: r.invoice_status,
  }));
}

export function summarizeClientBilling(events: ClientEvent[]): ClientBillingSummary {
  let totalCents = 0;
  let paidCents = 0;
  for (const e of events) {
    const value = e.valueCents ?? 0;
    totalCents += value;
    if (e.invoiceStatus === "paid") paidCents += value;
  }
  return {
    eventCount: events.length,
    totalCents,
    paidCents,
    pendingCents: totalCents - paidCents,
  };
}

export function formatInvoiceStatus(status: InvoiceStatus): string {
  const map: Record<InvoiceStatus, string> = {
    draft: "Rascunho",
    sent: "Enviada",
    paid: "Paga",
  };
  return map[status];
}

export function slugifyOrganizationName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function resolveUniqueOrganizationSlug(
  name: string,
  options?: {
    excludeId?: string;
  }
) {
  const supabase = createSupabaseAdminClient();
  const baseSlug = slugifyOrganizationName(name) || `cliente-${Date.now()}`;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    let query = supabase
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .limit(1);

    if (options?.excludeId) {
      query = query.neq("id", options.excludeId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return candidate;
    }
  }

  return `${baseSlug}-${Date.now()}`;
}
