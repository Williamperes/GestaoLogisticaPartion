import { cache } from "react";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/roles";

type OrganizationType = "internal" | "client" | "vendor";

export interface UserOrganizationMembership {
  id: string;
  organizationId: string;
  role: AppRole;
  isPrimary: boolean;
}

export interface UserOrganization {
  id: string;
  name: string;
  slug: string | null;
  type: OrganizationType;
  isActive: boolean;
}

export interface UserProfile {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface UserContext {
  userId: string;
  email: string | null;
  profile: UserProfile | null;
  memberships: UserOrganizationMembership[];
  organizations: UserOrganization[];
  primaryMembership: UserOrganizationMembership | null;
  primaryOrganization: UserOrganization | null;
  role: AppRole | null;
}

export const getCurrentAuthUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    // Sessão ausente ou refresh token inválido/expirado → trata como não autenticado
    if (
      error.name === "AuthSessionMissingError" ||
      error.message?.toLowerCase().includes("refresh token")
    ) {
      return null;
    }

    throw error;
  }

  return user;
});

export const getCurrentUserContext = cache(async (): Promise<UserContext | null> => {
  const user = await getCurrentAuthUser();

  if (!user) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: memberships }, { data: organizations }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url, is_active")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("id, organization_id, role, is_primary")
      .eq("user_id", user.id),
    supabase.from("organizations").select("id, name, slug, type, is_active"),
  ]);

  const normalizedMemberships: UserOrganizationMembership[] =
    memberships?.map((membership) => ({
      id: membership.id,
      organizationId: membership.organization_id,
      role: membership.role,
      isPrimary: membership.is_primary,
    })) ?? [];

  const normalizedOrganizations: UserOrganization[] =
    organizations?.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      type: organization.type,
      isActive: organization.is_active,
    })) ?? [];

  const primaryMembership =
    normalizedMemberships.find((membership) => membership.isPrimary) ?? normalizedMemberships[0] ?? null;

  const primaryOrganization =
    normalizedOrganizations.find((organization) => organization.id === primaryMembership?.organizationId) ?? null;

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile
      ? {
          id: profile.id,
          fullName: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          avatarUrl: profile.avatar_url,
          isActive: profile.is_active,
        }
      : null,
    memberships: normalizedMemberships,
    organizations: normalizedOrganizations,
    primaryMembership,
    primaryOrganization,
    role: primaryMembership?.role ?? null,
  };
});

export async function getDefaultAppPathForUser(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("organization_members")
    .select("role, is_primary")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data?.role === "client") return "/client";
  if (data?.role === "warehouse") return "/scan";
  if (data?.role === "employee") return "/events";
  return "/dashboard";
}
