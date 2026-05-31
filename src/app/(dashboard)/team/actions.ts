"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/session";
import { ensureTeamSpecialty } from "@/lib/team";

const ACCESS_ROLES = new Set(["warehouse", "operations"] as const);
type AccessRole = "warehouse" | "operations";

function ensureTeamPermission(role: string | null | undefined) {
  return !!role && ["super_admin", "admin", "operations"].includes(role);
}

// Provisioning login is more sensitive than just managing the team roster.
function ensureProvisioningPermission(role: string | null | undefined) {
  return role === "super_admin" || role === "admin";
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

  const provisionAccess = formData.get("provision_access") === "on";
  const accessRoleRaw = String(formData.get("access_role") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!organizationId || !name || !role) {
    redirect("/team?error=Informe nome e função.");
  }

  if (provisionAccess) {
    if (!ensureProvisioningPermission(context.role)) {
      redirect("/team?error=Apenas administradores podem criar acesso ao sistema.");
    }
    if (!email) {
      redirect("/team?error=Email é obrigatório para criar acesso.");
    }
    if (!ACCESS_ROLES.has(accessRoleRaw as AccessRole)) {
      redirect("/team?error=Permissão de acesso inválida.");
    }
    if (password.length < 8) {
      redirect("/team?error=Senha deve ter ao menos 8 caracteres.");
    }
  }

  const specialty = await ensureTeamSpecialty(organizationId, "Equipe");
  const supabase = createSupabaseAdminClient();

  let provisionedUserId: string | null = null;

  if (provisionAccess && email) {
    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (authErr || !created.user) {
      const msg = authErr?.message ?? "Não foi possível criar acesso.";
      redirect(`/team?error=${encodeURIComponent(msg)}`);
    }
    provisionedUserId = created.user.id;

    const { error: memberErr } = await supabase
      .from("organization_members")
      .insert({
        user_id: provisionedUserId,
        organization_id: organizationId,
        role: accessRoleRaw,
        is_primary: true,
      });
    if (memberErr) {
      // Compensa: remove auth user que foi criado mas não pôde virar membro.
      await supabase.auth.admin.deleteUser(provisionedUserId);
      redirect(`/team?error=${encodeURIComponent(memberErr.message)}`);
    }
  }

  const { error } = await supabase.from("team_members").insert({
    organization_id: organizationId,
    name,
    specialty_id: specialty.id,
    role,
    phone,
    email,
    notes,
    available,
    user_id: provisionedUserId,
  });

  if (error) {
    if (provisionedUserId) {
      await supabase.auth.admin.deleteUser(provisionedUserId);
    }
    redirect(`/team?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/team");

  const successMsg = provisionAccess
    ? `Técnico cadastrado. Acesso criado para ${email}. Senha temporária: ${password} — anote, não será mostrada novamente.`
    : "Técnico cadastrado.";

  redirect(`/team?success=${encodeURIComponent(successMsg)}`);
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
  redirect(`/team?success=${encodeURIComponent("Técnico atualizado.")}`);
}

export async function resetTeamMemberPassword(formData: FormData) {
  const context = await getCurrentUserContext();

  if (!context || !ensureProvisioningPermission(context.role)) {
    redirect("/team?error=Apenas administradores podem redefinir senhas.");
  }

  const organizationId = context.primaryOrganization?.id;
  const id = String(formData.get("id") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!organizationId || !id) {
    redirect("/team?error=Técnico inválido.");
  }
  if (password.length < 8) {
    redirect("/team?error=Senha deve ter ao menos 8 caracteres.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: member, error: memberErr } = await supabase
    .from("team_members")
    .select("user_id, email")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (memberErr) {
    redirect(`/team?error=${encodeURIComponent(memberErr.message)}`);
  }
  if (!member?.user_id) {
    redirect("/team?error=Este técnico não possui acesso ao app.");
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    member.user_id,
    { password }
  );

  if (updateErr) {
    redirect(`/team?error=${encodeURIComponent(updateErr.message)}`);
  }

  revalidatePath("/team");
  const msg = `Senha redefinida para ${member.email ?? "usuário"}. Senha temporária: ${password} — anote, não será mostrada novamente.`;
  redirect(`/team?success=${encodeURIComponent(msg)}`);
}

export async function deleteTeamMember(formData: FormData) {
  const context = await getCurrentUserContext();

  if (!context || !ensureTeamPermission(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const organizationId = context.primaryOrganization?.id;
  const id = String(formData.get("id") ?? "").trim();

  if (!organizationId || !id) {
    redirect(`/team?error=${encodeURIComponent("Técnico inválido.")}`);
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
  redirect(`/team?success=${encodeURIComponent("Técnico apagado.")}`);
}
