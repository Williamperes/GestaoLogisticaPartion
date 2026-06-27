import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface EquipmentTemplateItem {
  id: string;
  equipmentId: string;
  equipmentName: string;
  variantId: string | null;
  variantLabel: string | null;
  qty: number;
}

export interface EquipmentTemplate {
  id: string;
  organizationId: string;
  name: string;
  notes: string | null;
  itemCount: number;
}

export interface EquipmentTemplateWithItems extends EquipmentTemplate {
  items: EquipmentTemplateItem[];
}

export async function listEquipmentTemplates(
  organizationId: string
): Promise<EquipmentTemplate[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_templates")
    .select("id, organization_id, name, notes, equipment_template_items(count)")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error) throw error;

  return (
    data?.map((t) => ({
      id: t.id,
      organizationId: t.organization_id,
      name: t.name,
      notes: t.notes,
      itemCount:
        (t.equipment_template_items as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    })) ?? []
  );
}

export async function getEquipmentTemplateWithItems(
  id: string
): Promise<EquipmentTemplateWithItems | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_templates")
    .select(
      `
      id, organization_id, name, notes,
      equipment_template_items (
        id, equipment_id, variant_id, qty,
        equipment (name),
        equipment_variants (label)
      )
      `
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  type ItemRow = {
    id: string;
    equipment_id: string;
    variant_id: string | null;
    qty: number;
    equipment: { name: string } | null;
    equipment_variants: { label: string } | null;
  };

  const items = ((data.equipment_template_items as unknown as ItemRow[]) ?? []).map((i) => ({
    id: i.id,
    equipmentId: i.equipment_id,
    equipmentName: i.equipment?.name ?? "—",
    variantId: i.variant_id,
    variantLabel: i.equipment_variants?.label ?? null,
    qty: i.qty,
  }));

  return {
    id: data.id,
    organizationId: data.organization_id,
    name: data.name,
    notes: data.notes,
    itemCount: items.length,
    items,
  };
}
