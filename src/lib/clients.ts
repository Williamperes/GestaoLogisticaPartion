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
