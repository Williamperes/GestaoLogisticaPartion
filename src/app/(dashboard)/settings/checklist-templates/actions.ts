"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/session";

const WRITE_ROLES = ["super_admin", "admin", "operations"] as const;

async function requireWriteRole() {
  const context = await getCurrentUserContext();
  if (!context?.role || !WRITE_ROLES.includes(context.role as (typeof WRITE_ROLES)[number])) {
    redirect("/dashboard?error=unauthorized");
  }
  return context;
}

async function requireTemplateAccess(templateId: string) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    redirect("/dashboard?error=organization_not_found");
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("checklist_templates")
    .select("id, organization_id")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data || data.organization_id !== organizationId) {
    redirect("/settings/checklist-templates?error=Template não encontrado.");
  }
  return { context, organizationId, template: data };
}

const SECTION_VALUES = ["strategic", "commercial", "operational"] as const;
type Section = (typeof SECTION_VALUES)[number];

function parseSection(raw: string): Section {
  return (SECTION_VALUES as readonly string[]).includes(raw)
    ? (raw as Section)
    : "strategic";
}

// ──────────────────────────────────────────────────────────────────
// createTemplate
// ──────────────────────────────────────────────────────────────────
export async function createTemplate(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    redirect("/dashboard?error=organization_not_found");
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const isDefault = formData.get("isDefault") === "on" || formData.get("isDefault") === "true";

  if (!name) {
    redirect("/settings/checklist-templates?error=Nome obrigatório.");
  }

  const supabase = createSupabaseAdminClient();

  if (isDefault) {
    // Desmarca default existente para evitar colisão no índice único parcial.
    await supabase
      .from("checklist_templates")
      .update({ is_default: false })
      .eq("organization_id", organizationId)
      .eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("checklist_templates")
    .insert({
      organization_id: organizationId,
      name,
      description,
      is_default: isDefault,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/settings/checklist-templates?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings/checklist-templates");
  redirect(`/settings/checklist-templates/${data.id}?success=Template criado.`);
}

// ──────────────────────────────────────────────────────────────────
// updateTemplate (nome, descrição, default)
// ──────────────────────────────────────────────────────────────────
export async function updateTemplate(formData: FormData) {
  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!templateId) {
    redirect("/settings/checklist-templates?error=Template inválido.");
  }
  const { organizationId } = await requireTemplateAccess(templateId);

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const isDefault = formData.get("isDefault") === "on" || formData.get("isDefault") === "true";

  if (!name) {
    redirect(`/settings/checklist-templates/${templateId}?error=Nome obrigatório.`);
  }

  const supabase = createSupabaseAdminClient();

  if (isDefault) {
    await supabase
      .from("checklist_templates")
      .update({ is_default: false })
      .eq("organization_id", organizationId)
      .eq("is_default", true)
      .neq("id", templateId);
  }

  const { error } = await supabase
    .from("checklist_templates")
    .update({ name, description, is_default: isDefault })
    .eq("id", templateId);

  if (error) {
    redirect(`/settings/checklist-templates/${templateId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings/checklist-templates");
  revalidatePath(`/settings/checklist-templates/${templateId}`);
  redirect(`/settings/checklist-templates/${templateId}?success=Template atualizado.`);
}

// ──────────────────────────────────────────────────────────────────
// deleteTemplate
// ──────────────────────────────────────────────────────────────────
export async function deleteTemplate(formData: FormData) {
  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!templateId) {
    redirect("/settings/checklist-templates?error=Template inválido.");
  }
  await requireTemplateAccess(templateId);

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("id", templateId);

  if (error) {
    redirect(`/settings/checklist-templates?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings/checklist-templates");
  redirect("/settings/checklist-templates?success=Template excluído.");
}

// ──────────────────────────────────────────────────────────────────
// addTemplateItem
// ──────────────────────────────────────────────────────────────────
export async function addTemplateItem(formData: FormData) {
  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!templateId) {
    redirect("/settings/checklist-templates?error=Template inválido.");
  }
  await requireTemplateAccess(templateId);

  const label = String(formData.get("label") ?? "").trim();
  const section = parseSection(String(formData.get("section") ?? "strategic"));
  const required = formData.get("required") === "on" || formData.get("required") === "true";

  if (!label) {
    redirect(`/settings/checklist-templates/${templateId}?error=Texto do item obrigatório.`);
  }

  const supabase = createSupabaseAdminClient();

  // Próxima posição dentro da seção
  const { data: maxRow } = await supabase
    .from("checklist_template_items")
    .select("position")
    .eq("template_id", templateId)
    .eq("section", section)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxRow?.position ?? -1) + 1;

  const { error } = await supabase.from("checklist_template_items").insert({
    template_id: templateId,
    label,
    section,
    position: nextPosition,
    required,
  });

  if (error) {
    redirect(`/settings/checklist-templates/${templateId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/settings/checklist-templates/${templateId}`);
  redirect(`/settings/checklist-templates/${templateId}?success=Item adicionado.`);
}

// ──────────────────────────────────────────────────────────────────
// updateTemplateItem
// ──────────────────────────────────────────────────────────────────
export async function updateTemplateItem(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!itemId || !templateId) {
    redirect("/settings/checklist-templates?error=Item inválido.");
  }
  await requireTemplateAccess(templateId);

  const label = String(formData.get("label") ?? "").trim();
  const section = parseSection(String(formData.get("section") ?? "strategic"));
  const required = formData.get("required") === "on" || formData.get("required") === "true";

  if (!label) {
    redirect(`/settings/checklist-templates/${templateId}?error=Texto do item obrigatório.`);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("checklist_template_items")
    .update({ label, section, required })
    .eq("id", itemId)
    .eq("template_id", templateId);

  if (error) {
    redirect(`/settings/checklist-templates/${templateId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/settings/checklist-templates/${templateId}`);
  redirect(`/settings/checklist-templates/${templateId}?success=Item atualizado.`);
}

// ──────────────────────────────────────────────────────────────────
// deleteTemplateItem
// ──────────────────────────────────────────────────────────────────
export async function deleteTemplateItem(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!itemId || !templateId) {
    redirect("/settings/checklist-templates?error=Item inválido.");
  }
  await requireTemplateAccess(templateId);

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("checklist_template_items")
    .delete()
    .eq("id", itemId)
    .eq("template_id", templateId);

  if (error) {
    redirect(`/settings/checklist-templates/${templateId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/settings/checklist-templates/${templateId}`);
  redirect(`/settings/checklist-templates/${templateId}?success=Item removido.`);
}
