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
  const hasVariants = formData.get("hasVariants") === "on";

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
      has_variants: hasVariants,
    })
    .select("id")
    .single();

  if (equipError) {
    redirect(`/inventory?error=${encodeURIComponent(equipError.message)}`);
  }

  if (type === "serialized") {
    const serial = String(formData.get("serial") ?? "").trim() || null;
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

    // Equipamentos com variantes: as unidades serão cadastradas DEPOIS por variante.
    // Sem variantes: cria uma unidade inicial com os dados do serializado.
    if (!hasVariants) {
      const providedQr = String(formData.get("qrCode") ?? "").trim();
      const unitQrCode = providedQr || generateQrToken("UN", equipment.id);
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
        await supabase.from("equipment").delete().eq("id", equipment.id);
        redirect(`/inventory?error=${encodeURIComponent(unitError.message)}`);
      }
    }
  } else {
    // Lote
    const unit = String(formData.get("unit") ?? "unidades").trim();

    // Equipamentos com variantes: bulk_inventory será criado POR variante depois.
    // Sem variantes: cria uma linha em bulk_inventory com variant_id NULL.
    if (!hasVariants) {
      const totalQty = parseInt(String(formData.get("totalQty") ?? "0"), 10);
      if (isNaN(totalQty) || totalQty < 1) {
        await supabase.from("equipment").delete().eq("id", equipment.id);
        redirect("/inventory?error=Quantidade inválida para lote.");
      }

      const { error: bulkError } = await supabase
        .from("bulk_inventory")
        .insert({
          equipment_id: equipment.id,
          variant_id: null,
          unit,
          total_qty: totalQty,
          available_qty: totalQty,
        });

      if (bulkError) {
        await supabase.from("equipment").delete().eq("id", equipment.id);
        redirect(`/inventory?error=${encodeURIComponent(bulkError.message)}`);
      }
    }
  }

  revalidatePath("/inventory");
  redirect(
    hasVariants
      ? `/inventory/${equipment.id}?success=${encodeURIComponent(
          "Equipamento cadastrado. Configure as variantes na aba abaixo."
        )}`
      : "/inventory?success=Equipamento cadastrado."
  );
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
// setUnitQrCode
// Vincula (ou re-vincula) o código de um adesivo QR a uma unidade
// existente. Retorna {ok, error?} pra uso por client modal.
// ──────────────────────────────────────────────────────────────────
export interface SetUnitQrCodeResult {
  ok: boolean;
  error?: string;
}

export async function setUnitQrCode(
  unitId: string,
  qrCode: string
): Promise<SetUnitQrCodeResult> {
  const context = await getCurrentUserContext();
  if (
    !context?.role ||
    !WRITE_ROLES.includes(context.role as (typeof WRITE_ROLES)[number])
  ) {
    return { ok: false, error: "Sem permissão" };
  }

  const trimmedId = unitId.trim();
  const trimmedQr = qrCode.trim();
  if (!trimmedId) return { ok: false, error: "Unidade inválida" };
  if (!trimmedQr) return { ok: false, error: "QR vazio" };

  const supabase = createSupabaseAdminClient();
  const { data: unit, error: updateError } = await supabase
    .from("equipment_units")
    .update({ qr_code: trimmedQr })
    .eq("id", trimmedId)
    .select("id, equipment_id")
    .maybeSingle();

  if (updateError) {
    if (updateError.code === "23505") {
      return { ok: false, error: "Este QR já está vinculado a outra unidade" };
    }
    return { ok: false, error: updateError.message };
  }
  if (!unit) return { ok: false, error: "Unidade não encontrada" };

  revalidatePath(`/inventory/${unit.equipment_id}`);
  revalidatePath("/inventory");
  return { ok: true };
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
  const hasVariants = formData.get("hasVariants") === "on";

  if (!equipmentId || !name) {
    redirect(`/inventory/${equipmentId}?error=Nome é obrigatório.`);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("equipment")
    .update({
      name,
      brand,
      model,
      category_id: categoryId,
      notes,
      has_variants: hasVariants,
    })
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
const MAX_UNITS_PER_BATCH = 200;

export async function addEquipmentUnit(formData: FormData) {
  await requireWriteRole();

  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  // Série e patrimônio são opcionais — o identificador real é o qr_code.
  const serial = String(formData.get("serial") ?? "").trim() || null;
  const patrimony = String(formData.get("patrimony") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const variantId = String(formData.get("variantId") ?? "").trim() || null;

  const quantityRaw = parseInt(String(formData.get("quantity") ?? "1"), 10);
  const quantity = isNaN(quantityRaw) ? 1 : quantityRaw;

  if (!equipmentId) {
    redirect(`/inventory?error=Equipamento inválido.`);
  }
  if (quantity < 1 || quantity > MAX_UNITS_PER_BATCH) {
    redirect(
      `/inventory/${equipmentId}?error=${encodeURIComponent(
        `Quantidade deve estar entre 1 e ${MAX_UNITS_PER_BATCH}.`
      )}`
    );
  }

  const supabase = createSupabaseAdminClient();

  // Cria N unidades de uma vez. Série/patrimônio (se informados) são
  // aplicados a todas — o normal ao usar quantidade > 1 é deixá-los em branco.
  const rows = Array.from({ length: quantity }, () => ({
    equipment_id: equipmentId,
    variant_id: variantId,
    serial,
    patrimony,
    notes,
    status: "available" as const,
  }));

  const { data: units, error: insertError } = await supabase
    .from("equipment_units")
    .insert(rows)
    .select("id");

  if (insertError || !units) {
    redirect(
      `/inventory/${equipmentId}?error=${encodeURIComponent(
        insertError?.message ?? "Falha ao criar unidades."
      )}`
    );
  }

  // Cada unidade recebe um QR único derivado do seu próprio id.
  await Promise.all(
    units.map((unit) =>
      supabase
        .from("equipment_units")
        .update({ qr_code: generateQrToken("UN", unit.id) })
        .eq("id", unit.id)
    )
  );

  revalidatePath(`/inventory/${equipmentId}`);
  redirect(
    `/inventory/${equipmentId}?success=${
      quantity === 1 ? "Unidade adicionada." : `${quantity} unidades adicionadas.`
    }`
  );
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
  // Restringe ao bulk SEM variante (variant_id IS NULL). Estoque por variante
  // é gerenciado por `updateBulkInventoryVariant`.
  const { error } = await supabase
    .from("bulk_inventory")
    .update({ total_qty: totalQty, available_qty: availableQty })
    .eq("equipment_id", equipmentId)
    .is("variant_id", null);

  if (error) redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/inventory/${equipmentId}`);
  redirect(`/inventory/${equipmentId}?success=Estoque atualizado.`);
}

// ──────────────────────────────────────────────────────────────────
// createCategory / renameCategory / deleteCategory
// ──────────────────────────────────────────────────────────────────

async function validateCategoryParent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  parentCategoryId: string | null,
  selfCategoryId?: string
): Promise<void> {
  if (!parentCategoryId) return;
  if (selfCategoryId && parentCategoryId === selfCategoryId) {
    redirect("/inventory/categories?error=Categoria não pode ser pai dela mesma.");
  }
  const { data, error } = await supabase
    .from("equipment_categories")
    .select("id, organization_id, parent_category_id")
    .eq("id", parentCategoryId)
    .maybeSingle();
  if (error || !data || data.organization_id !== organizationId) {
    redirect("/inventory/categories?error=Categoria pai inválida.");
  }
  // 1 nível só: pai não pode ter pai.
  if (data.parent_category_id) {
    redirect(
      "/inventory/categories?error=A categoria pai já é uma sub-categoria. Permitimos apenas 1 nível de hierarquia."
    );
  }
}

export async function createCategory(formData: FormData) {
  const context = await requireWriteRole();

  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    redirect("/inventory/categories?error=Organização não encontrada.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const parentCategoryId = String(formData.get("parentCategoryId") ?? "").trim() || null;
  if (!name) redirect("/inventory/categories?error=Nome é obrigatório.");

  const supabase = createSupabaseAdminClient();
  await validateCategoryParent(supabase, organizationId, parentCategoryId);

  const { error } = await supabase
    .from("equipment_categories")
    .insert({
      organization_id: organizationId,
      name,
      parent_category_id: parentCategoryId,
    });

  if (error) redirect(`/inventory/categories?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/inventory/categories");
  redirect("/inventory/categories?success=Categoria criada.");
}

// Mantém o nome `renameCategory` por compatibilidade. Agora atualiza
// também `parent_category_id` quando enviado no FormData.
export async function renameCategory(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    redirect("/inventory/categories?error=Organização não encontrada.");
  }

  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const parentRaw = formData.get("parentCategoryId");
  const parentCategoryId =
    parentRaw === null ? undefined : String(parentRaw).trim() || null;

  if (!categoryId || !name) redirect("/inventory/categories?error=Dados inválidos.");

  const supabase = createSupabaseAdminClient();

  if (parentCategoryId !== undefined && parentCategoryId !== null) {
    await validateCategoryParent(supabase, organizationId, parentCategoryId, categoryId);
  }

  // Se a categoria sendo editada TEM filhos e estamos tentando dar pai a ela,
  // bloqueia: viraria nível 3.
  if (parentCategoryId) {
    const { count, error: countErr } = await supabase
      .from("equipment_categories")
      .select("id", { count: "exact", head: true })
      .eq("parent_category_id", categoryId);
    if (countErr) redirect(`/inventory/categories?error=${encodeURIComponent(countErr.message)}`);
    if (count && count > 0) {
      redirect(
        "/inventory/categories?error=Esta categoria possui sub-categorias. Mova-as antes de torná-la sub-categoria."
      );
    }
  }

  const updateRow: { name: string; parent_category_id?: string | null } = { name };
  if (parentCategoryId !== undefined) updateRow.parent_category_id = parentCategoryId;

  const { error } = await supabase
    .from("equipment_categories")
    .update(updateRow)
    .eq("id", categoryId);

  if (error) redirect(`/inventory/categories?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/inventory/categories");
  revalidatePath("/inventory");
  redirect("/inventory/categories?success=Categoria atualizada.");
}

export async function deleteCategory(formData: FormData) {
  await requireWriteRole();

  const categoryId = String(formData.get("categoryId") ?? "").trim();
  if (!categoryId) redirect("/inventory/categories?error=Categoria inválida.");

  const supabase = createSupabaseAdminClient();

  const { count, error: countError } = await supabase
    .from("equipment")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);

  if (countError) redirect(`/inventory/categories?error=${encodeURIComponent(countError.message)}`);
  if (count && count > 0) {
    redirect("/inventory/categories?error=Categoria possui equipamentos vinculados. Remova ou reatribua-os primeiro.");
  }

  const { error } = await supabase
    .from("equipment_categories")
    .delete()
    .eq("id", categoryId);

  if (error) redirect(`/inventory/categories?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/inventory/categories");
  revalidatePath("/inventory");
  redirect("/inventory/categories?success=Categoria excluída.");
}

// ──────────────────────────────────────────────────────────────────
// Variantes (size/version) — CRUD + ajuste de estoque por variante
// ──────────────────────────────────────────────────────────────────

async function assertEquipmentInOrg(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  equipmentId: string,
  organizationId: string,
  redirectTo: string
): Promise<{ type: "serialized" | "bulk"; hasVariants: boolean }> {
  const { data, error } = await supabase
    .from("equipment")
    .select("id, organization_id, type, has_variants")
    .eq("id", equipmentId)
    .maybeSingle();
  if (error || !data || data.organization_id !== organizationId) {
    redirect(`${redirectTo}?error=Equipamento inválido.`);
  }
  return {
    type: data.type as "serialized" | "bulk",
    hasVariants: data.has_variants as boolean,
  };
}

export async function createEquipmentVariant(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const sortValueRaw = String(formData.get("sortValue") ?? "").trim();
  const sortValue = sortValueRaw ? parseInt(sortValueRaw, 10) : null;
  const positionRaw = parseInt(String(formData.get("position") ?? "0"), 10);
  const position = isNaN(positionRaw) ? 0 : positionRaw;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  // Para bulk: aceita totalQty e unit pra já cadastrar o estoque inicial.
  const totalQtyRaw = String(formData.get("totalQty") ?? "").trim();
  const totalQty = totalQtyRaw ? parseInt(totalQtyRaw, 10) : null;
  const unit = String(formData.get("unit") ?? "unidades").trim() || "unidades";

  if (!equipmentId || !label) {
    redirect(`/inventory/${equipmentId}?error=Label da variante é obrigatório.`);
  }

  const supabase = createSupabaseAdminClient();
  const meta = await assertEquipmentInOrg(
    supabase,
    equipmentId,
    organizationId,
    `/inventory/${equipmentId}`
  );

  const { data: variant, error: insertErr } = await supabase
    .from("equipment_variants")
    .insert({
      equipment_id: equipmentId,
      label,
      sort_value: sortValue,
      position,
      notes,
    })
    .select("id")
    .single();

  if (insertErr) {
    const msg =
      insertErr.code === "23505"
        ? `Já existe uma variante "${label}" neste equipamento.`
        : insertErr.message;
    redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(msg)}`);
  }

  // Para bulk, se totalQty foi informado, cria a linha de bulk_inventory
  // específica da variante.
  if (meta.type === "bulk" && totalQty !== null && !isNaN(totalQty) && totalQty >= 0) {
    const { error: bulkErr } = await supabase.from("bulk_inventory").insert({
      equipment_id: equipmentId,
      variant_id: variant.id,
      unit,
      total_qty: totalQty,
      available_qty: totalQty,
    });
    if (bulkErr) {
      await supabase.from("equipment_variants").delete().eq("id", variant.id);
      redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(bulkErr.message)}`);
    }
  }

  // Garante que has_variants = true assim que a primeira variante é criada.
  if (!meta.hasVariants) {
    await supabase
      .from("equipment")
      .update({ has_variants: true })
      .eq("id", equipmentId);
  }

  revalidatePath(`/inventory/${equipmentId}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${equipmentId}?success=Variante criada.`);
}

export async function updateEquipmentVariant(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const variantId = String(formData.get("variantId") ?? "").trim();
  if (!variantId) redirect("/inventory?error=Variante inválida.");

  const label = String(formData.get("label") ?? "").trim();
  if (!label) {
    redirect(`/inventory?error=${encodeURIComponent("Label da variante é obrigatório.")}`);
  }
  const sortValueRaw = String(formData.get("sortValue") ?? "").trim();
  const sortValue = sortValueRaw ? parseInt(sortValueRaw, 10) : null;
  const positionRaw = parseInt(String(formData.get("position") ?? "0"), 10);
  const position = isNaN(positionRaw) ? 0 : positionRaw;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const supabase = createSupabaseAdminClient();

  const { data: variant, error: fetchErr } = await supabase
    .from("equipment_variants")
    .select("id, equipment_id, equipment!inner (organization_id)")
    .eq("id", variantId)
    .maybeSingle();
  if (fetchErr || !variant) {
    redirect("/inventory?error=Variante não encontrada.");
  }
  const equipmentRel = (variant as unknown as { equipment: { organization_id: string } | null })
    .equipment;
  if (!equipmentRel || equipmentRel.organization_id !== organizationId) {
    redirect("/inventory?error=Variante inválida.");
  }
  const equipmentId = (variant as { equipment_id: string }).equipment_id;

  const { error } = await supabase
    .from("equipment_variants")
    .update({ label, sort_value: sortValue, position, notes })
    .eq("id", variantId);

  if (error) {
    const msg =
      error.code === "23505"
        ? `Já existe uma variante "${label}" neste equipamento.`
        : error.message;
    redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath(`/inventory/${equipmentId}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${equipmentId}?success=Variante atualizada.`);
}

export async function deleteEquipmentVariant(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const variantId = String(formData.get("variantId") ?? "").trim();
  if (!variantId) redirect("/inventory?error=Variante inválida.");

  const supabase = createSupabaseAdminClient();

  const { data: variant, error: fetchErr } = await supabase
    .from("equipment_variants")
    .select("id, equipment_id, equipment!inner (organization_id)")
    .eq("id", variantId)
    .maybeSingle();
  if (fetchErr || !variant) {
    redirect("/inventory?error=Variante não encontrada.");
  }
  const equipmentRel = (variant as unknown as { equipment: { organization_id: string } | null })
    .equipment;
  if (!equipmentRel || equipmentRel.organization_id !== organizationId) {
    redirect("/inventory?error=Variante inválida.");
  }
  const equipmentId = (variant as { equipment_id: string }).equipment_id;

  // Bloqueia delete se a variante está em uso em alguma OS.
  const { count: usageCount, error: usageErr } = await supabase
    .from("event_equipment")
    .select("id", { count: "exact", head: true })
    .eq("variant_id", variantId);
  if (usageErr) redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(usageErr.message)}`);
  if (usageCount && usageCount > 0) {
    redirect(
      `/inventory/${equipmentId}?error=${encodeURIComponent(
        "Variante está vinculada a uma OS. Remova-a da OS antes de apagar."
      )}`
    );
  }

  const { error } = await supabase
    .from("equipment_variants")
    .delete()
    .eq("id", variantId);

  if (error) redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/inventory/${equipmentId}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${equipmentId}?success=Variante removida.`);
}

// Ajuste de estoque em lote PARA UMA VARIANTE específica.
export async function updateBulkInventoryVariant(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const variantId = String(formData.get("variantId") ?? "").trim();
  const totalQty = parseInt(String(formData.get("totalQty") ?? ""), 10);
  const availableQty = parseInt(String(formData.get("availableQty") ?? ""), 10);
  const unit = String(formData.get("unit") ?? "unidades").trim() || "unidades";

  if (
    !equipmentId ||
    !variantId ||
    isNaN(totalQty) ||
    isNaN(availableQty) ||
    totalQty < 0 ||
    availableQty < 0 ||
    availableQty > totalQty
  ) {
    redirect(`/inventory/${equipmentId}?error=Quantidades inválidas.`);
  }

  const supabase = createSupabaseAdminClient();
  await assertEquipmentInOrg(supabase, equipmentId, organizationId, `/inventory/${equipmentId}`);

  // Upsert manual: tenta UPDATE; se não houver row, INSERT.
  const { data: existing } = await supabase
    .from("bulk_inventory")
    .select("id")
    .eq("equipment_id", equipmentId)
    .eq("variant_id", variantId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("bulk_inventory")
      .update({ total_qty: totalQty, available_qty: availableQty, unit })
      .eq("id", existing.id);
    if (error) redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(error.message)}`);
  } else {
    const { error } = await supabase.from("bulk_inventory").insert({
      equipment_id: equipmentId,
      variant_id: variantId,
      unit,
      total_qty: totalQty,
      available_qty: availableQty,
    });
    if (error) redirect(`/inventory/${equipmentId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/inventory/${equipmentId}`);
  redirect(`/inventory/${equipmentId}?success=Estoque da variante atualizado.`);
}
