"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/session";
import { ensureTeamSpecialty } from "@/lib/team";

function ensureTeamPermission(role: string | null | undefined) {
  return !!role && ["super_admin", "admin", "operations"].includes(role);
}

export async function createTeamMember(formData: FormData) {
  const context = await getCurrentUserContext();

  if (!context || !ensureTeamPermission(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const organizationId = context.primaryOrganization?.id;
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const available = formData.get("available") === "on";

  if (!organizationId || !name || !role) {
    redirect("/team?error=Informe nome e função.");
  }

  const specialty = await ensureTeamSpecialty(organizationId, "Equipe");
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("team_members").insert({
    organization_id: organizationId,
    name,
    specialty_id: specialty.id,
    role,
    phone,
    email,
    notes,
    available,
  });

  if (error) {
    redirect(`/team?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/team");
  redirect("/team?success=Técnico cadastrado.");
}

export async function updateTeamMember(formData: FormData) {
  const context = await getCurrentUserContext();

  if (!context || !ensureTeamPermission(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const organizationId = context.primaryOrganization?.id;
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const available = formData.get("available") === "on";

  if (!organizationId || !id || !name || !role) {
    redirect("/team?error=Dados inválidos para atualizar técnico.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("team_members")
    .update({
      name,
      role,
      phone,
      email,
      notes,
      available,
    })
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    redirect(`/team?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/team");
  redirect("/team?success=Técnico atualizado.");
}

export async function deleteTeamMember(formData: FormData) {
  const context = await getCurrentUserContext();

  if (!context || !ensureTeamPermission(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const organizationId = context.primaryOrganization?.id;
  const id = String(formData.get("id") ?? "").trim();

  if (!organizationId || !id) {
    redirect("/team?error=Técnico inválido.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    redirect(`/team?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/team");
  redirect("/team?success=Técnico apagado.");
}
