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

export async function createEquipmentTemplate(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const name = String(formData.get("name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!name) redirect("/settings/equipment-templates?error=Informe o nome do template.");

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_templates")
    .insert({ organization_id: organizationId, name, notes })
    .select("id")
    .maybeSingle();

  if (error) {
    redirect(`/settings/equipment-templates?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings/equipment-templates");
  redirect(`/settings/equipment-templates/${data?.id ?? ""}?success=Template criado.`);
}

export async function deleteEquipmentTemplate(formData: FormData) {
  await requireWriteRole();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/settings/equipment-templates?error=Template inválido.");

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("equipment_templates").delete().eq("id", id);
  if (error) {
    redirect(`/settings/equipment-templates?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings/equipment-templates");
  redirect("/settings/equipment-templates?success=Template removido.");
}

export async function addEquipmentTemplateItem(formData: FormData) {
  await requireWriteRole();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const raw = String(formData.get("equipment") ?? "").trim(); // "<equipmentId>" ou "<equipmentId>__<variantId>"
  const qtyRaw = parseInt(String(formData.get("qty") ?? "1"), 10);
  const qty = Number.isNaN(qtyRaw) || qtyRaw < 1 ? 1 : qtyRaw;

  if (!templateId || !raw) {
    redirect(`/settings/equipment-templates/${templateId}?error=Selecione um equipamento.`);
  }
  const [equipmentId, variantId] = raw.split("__");

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("equipment_template_items").upsert(
    {
      template_id: templateId,
      equipment_id: equipmentId,
      variant_id: variantId || null,
      qty,
    },
    { onConflict: "template_id,equipment_id,variant_id" }
  );

  if (error) {
    redirect(`/settings/equipment-templates/${templateId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/settings/equipment-templates/${templateId}`);
  redirect(`/settings/equipment-templates/${templateId}?success=Item adicionado.`);
}

export async function removeEquipmentTemplateItem(formData: FormData) {
  await requireWriteRole();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!templateId || !itemId) {
    redirect(`/settings/equipment-templates/${templateId}?error=Item inválido.`);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("equipment_template_items").delete().eq("id", itemId);
  if (error) {
    redirect(`/settings/equipment-templates/${templateId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/settings/equipment-templates/${templateId}`);
  redirect(`/settings/equipment-templates/${templateId}?success=Item removido.`);
}
