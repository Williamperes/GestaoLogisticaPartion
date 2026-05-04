"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/session";
import { generateQrToken } from "@/lib/inventory";

const WRITE_ROLES = ["super_admin", "admin", "operations", "warehouse"] as const;

async function requireWriteRole() {
  const context = await getCurrentUserContext();
  if (!context?.role || !WRITE_ROLES.includes(context.role as (typeof WRITE_ROLES)[number])) {
    redirect("/dashboard?error=unauthorized");
  }
  return context;
}

// ──────────────────────────────────────────────────────────────────
// createEquipment
// Cria um equipamento serializado (com N units) ou em lote.
// ──────────────────────────────────────────────────────────────────
export async function createEquipment(formData: FormData) {
  const context = await requireWriteRole();

  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    redirect("/dashboard?error=organization_not_found");
  }

  const type = String(formData.get("type") ?? "").trim() as "serialized" | "bulk";
  const name = String(formData.get("name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const model = String(formData.get("model") ?? "").trim() || null;
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name || !["serialized", "bulk"].includes(type)) {
    redirect("/inventory?error=Dados inválidos.");
  }

  const supabase = createSupabaseAdminClient();

  // Criação base do equipamento
  const { data: equipment, error: equipError } = await supabase
    .from("equipment")
    .insert({
      organization_id: organizationId,
      category_id: categoryId,
      name,
      brand,
      model,
      type,
      notes,
    })
    .select("id")
    .single();

  if (equipError) {
    redirect(`/inventory?error=${encodeURIComponent(equipError.message)}`);
  }

  if (type === "serialized") {
    const serial = String(formData.get("serial") ?? "").trim();
    const patrimony = String(formData.get("patrimony") ?? "").trim() || null;
    const purchaseDateRaw = String(formData.get("purchaseDate") ?? "").trim() || null;
    const purchaseValueRaw = String(formData.get("purchaseValue") ?? "").trim();

    const purchaseValueCents = purchaseValueRaw
      ? Math.round(parseFloat(purchaseValueRaw.replace(",", ".")) * 100)
      : null;

    const qrCode = generateQrToken("EQ", equipment.id);

    // Atualiza definição com metadados do serializado
    await supabase
      .from("equipment")
      .update({
        serial,
        patrimony,
        purchase_date: purchaseDateRaw,
        purchase_value_cents: purchaseValueCents ?? null,
        qr_code: qrCode,
      })
      .eq("id", equipment.id);

    // Cria a unidade individual
    const unitQrCode = generateQrToken("UN", equipment.id);
    const { error: unitError } = await supabase
      .from("equipment_units")
      .insert({
        equipment_id: equipment.id,
        serial,
        patrimony,
        status: "available",
        qr_code: unitQrCode,
      });

    if (unitError) {
      // Rollback: apaga o equipment criado
      await supabase.from("equipment").delete().eq("id", equipment.id);
      redirect(`/inventory?error=${encodeURIComponent(unitError.message)}`);
    }
  } else {
    // Lote
    const unit = String(formData.get("unit") ?? "unidades").trim();
    const totalQty = parseInt(String(formData.get("totalQty") ?? "0"), 10);

    if (isNaN(totalQty) || totalQty < 1) {
      await supabase.from("equipment").delete().eq("id", equipment.id);
      redirect("/inventory?error=Quantidade inválida para lote.");
    }

    const { error: bulkError } = await supabase
      .from("bulk_inventory")
      .insert({
        equipment_id: equipment.id,
        unit,
        total_qty: totalQty,
        available_qty: totalQty,
      });

    if (bulkError) {
      await supabase.from("equipment").delete().eq("id", equipment.id);
      redirect(`/inventory?error=${encodeURIComponent(bulkError.message)}`);
    }
  }

  revalidatePath("/inventory");
  redirect("/inventory?success=Equipamento cadastrado.");
}

// ──────────────────────────────────────────────────────────────────
// updateEquipmentUnitStatus
// Altera o status de uma unidade serializada.
// ──────────────────────────────────────────────────────────────────
export async function updateEquipmentUnitStatus(formData: FormData) {
  await requireWriteRole();

  const unitId = String(formData.get("unitId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const equipmentId = String(formData.get("equipmentId") ?? "").trim();

  const validStatuses = ["available", "reserved", "in_field", "maintenance", "inactive"];
  if (!unitId || !validStatuses.includes(status)) {
    redirect(`/inventory/${equipmentId}?error=Status inválido.`);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("equipment_units")
    .update({ status })
    .eq("id", unitId);

  if (error) {
    redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/inventory/${equipmentId}`);
  revalidatePath("/inventory");
}

// ──────────────────────────────────────────────────────────────────
// deactivateEquipment
// Soft-delete: status = 'inactive' (não apaga dados históricos)
// ──────────────────────────────────────────────────────────────────
export async function deactivateEquipment(formData: FormData) {
  await requireWriteRole();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/inventory?error=Equipamento inválido.");

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("equipment")
    .update({ status: "inactive" })
    .eq("id", id);

  if (error) {
    redirect(`/inventory?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/inventory");
  redirect("/inventory?success=Equipamento desativado.");
}

// ──────────────────────────────────────────────────────────────────
// updateEquipment
// Edita nome, marca, modelo, categoria e notas. Tipo não é editável.
// ──────────────────────────────────────────────────────────────────
export async function updateEquipment(formData: FormData) {
  await requireWriteRole();

  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const model = String(formData.get("model") ?? "").trim() || null;
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!equipmentId || !name) {
    redirect(`/inventory/${equipmentId}?error=Nome é obrigatório.`);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("equipment")
    .update({ name, brand, model, category_id: categoryId, notes })
    .eq("id", equipmentId);

  if (error) redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/inventory/${equipmentId}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${equipmentId}?success=Equipamento atualizado.`);
}

// ──────────────────────────────────────────────────────────────────
// addEquipmentUnit
// Adiciona uma unidade serializada a um equipamento existente.
// ──────────────────────────────────────────────────────────────────
export async function addEquipmentUnit(formData: FormData) {
  await requireWriteRole();

  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const serial = String(formData.get("serial") ?? "").trim();
  const patrimony = String(formData.get("patrimony") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!equipmentId || !serial) {
    redirect(`/inventory/${equipmentId}?error=Número de série é obrigatório.`);
  }

  const supabase = createSupabaseAdminClient();

  const { data: unit, error: insertError } = await supabase
    .from("equipment_units")
    .insert({ equipment_id: equipmentId, serial, patrimony, notes, status: "available" })
    .select("id")
    .single();

  if (insertError) {
    redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(insertError.message)}`);
  }

  const qrCode = generateQrToken("UN", unit.id);
  await supabase.from("equipment_units").update({ qr_code: qrCode }).eq("id", unit.id);

  revalidatePath(`/inventory/${equipmentId}`);
  redirect(`/inventory/${equipmentId}?success=Unidade adicionada.`);
}

// ──────────────────────────────────────────────────────────────────
// deleteEquipmentUnit
// Remove uma unidade. Busca equipment_id internamente para o redirect.
// ──────────────────────────────────────────────────────────────────
export async function deleteEquipmentUnit(formData: FormData) {
  await requireWriteRole();

  const unitId = String(formData.get("unitId") ?? "").trim();

  if (!unitId) {
    redirect("/inventory?error=Unidade inválida.");
  }

  const supabase = createSupabaseAdminClient();

  const { data: unit, error: fetchError } = await supabase
    .from("equipment_units")
    .select("equipment_id")
    .eq("id", unitId)
    .single();

  if (fetchError || !unit) {
    redirect("/inventory?error=Unidade não encontrada.");
  }

  const equipmentId = unit.equipment_id;

  const { error } = await supabase
    .from("equipment_units")
    .delete()
    .eq("id", unitId);

  if (error) {
    redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/inventory/${equipmentId}`);
  redirect(`/inventory/${equipmentId}?success=Unidade removida.`);
}

// ──────────────────────────────────────────────────────────────────
// updateBulkInventory
// Ajusta totalQty e availableQty do estoque em lote.
// ──────────────────────────────────────────────────────────────────
export async function updateBulkInventory(formData: FormData) {
  await requireWriteRole();

  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const totalQty = parseInt(String(formData.get("totalQty") ?? ""), 10);
  const availableQty = parseInt(String(formData.get("availableQty") ?? ""), 10);

  if (
    !equipmentId ||
    isNaN(totalQty) ||
    isNaN(availableQty) ||
    totalQty < 0 ||
    availableQty < 0 ||
    availableQty > totalQty
  ) {
    redirect(`/inventory/${equipmentId}?error=Quantidades inválidas.`);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("bulk_inventory")
    .update({ total_qty: totalQty, available_qty: availableQty })
    .eq("equipment_id", equipmentId);

  if (error) redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/inventory/${equipmentId}`);
  redirect(`/inventory/${equipmentId}?success=Estoque atualizado.`);
}
