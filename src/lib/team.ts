import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { TeamMember, TeamSpecialty } from "@/lib/team-shared";

function slugifyTeamSpecialty(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function listTeamSpecialties(organizationId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("team_specialties")
    .select("id, organization_id, name, slug, is_active, created_at")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (
    data?.map((specialty) => ({
      id: specialty.id,
      organizationId: specialty.organization_id,
      name: specialty.name,
      slug: specialty.slug,
      isActive: specialty.is_active,
      createdAt: specialty.created_at,
    })) ?? []
  ) satisfies TeamSpecialty[];
}

export async function ensureTeamSpecialty(organizationId: string, name: string) {
  const supabase = createSupabaseAdminClient();
  const normalizedName = name.trim();
  const slug = slugifyTeamSpecialty(normalizedName);

  if (!normalizedName || !slug) {
    throw new Error("Especialidade inválida.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("team_specialties")
    .select("id, organization_id, name, slug, is_active, created_at")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return {
      id: existing.id,
      organizationId: existing.organization_id,
      name: existing.name,
      slug: existing.slug,
      isActive: existing.is_active,
      createdAt: existing.created_at,
    } satisfies TeamSpecialty;
  }

  const { data: created, error: createError } = await supabase
    .from("team_specialties")
    .upsert(
      {
        organization_id: organizationId,
        name: normalizedName,
        slug,
        is_active: true,
      },
      { onConflict: "organization_id,slug" }
    )
    .select("id, organization_id, name, slug, is_active, created_at")
    .single();

  if (createError) {
    throw createError;
  }

  return {
    id: created.id,
    organizationId: created.organization_id,
    name: created.name,
    slug: created.slug,
    isActive: created.is_active,
    createdAt: created.created_at,
  } satisfies TeamSpecialty;
}

export async function listTeamMembers(organizationId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("team_members")
    .select(`
      id,
      organization_id,
      name,
      specialty_id,
      role,
      phone,
      email,
      available,
      notes,
      created_at,
      user_id,
      team_specialties!inner (
        id,
        name,
        slug
      )
    `)
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (
    data?.map((member) => ({
      id: member.id,
      organizationId: member.organization_id,
      name: member.name,
      specialtyId: member.specialty_id,
      specialtyName: (member.team_specialties as unknown as { id: string; name: string; slug: string }).name,
      specialtySlug: (member.team_specialties as unknown as { id: string; name: string; slug: string }).slug,
      role: member.role,
      phone: member.phone,
      email: member.email,
      available: member.available,
      notes: member.notes,
      createdAt: member.created_at,
      userId: member.user_id ?? null,
    })) ?? []
  ) satisfies TeamMember[];
}

export async function getTeamMemberByUserId(
  userId: string,
  organizationId: string
): Promise<{ id: string } | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

// Verifica se o team_member está escalado em alguma data deste evento.
export async function teamMemberHasEventAccess(
  teamMemberId: string,
  eventId: string
): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_date_team_members")
    .select("event_dates!inner(event_id)")
    .eq("team_member_id", teamMemberId)
    .eq("event_dates.event_id", eventId)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
