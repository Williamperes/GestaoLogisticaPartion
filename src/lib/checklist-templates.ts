import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type ChecklistSection = "strategic" | "commercial" | "operational";

export const SECTION_LABELS: Record<ChecklistSection, string> = {
  strategic: "Estratégico",
  commercial: "Comercial",
  operational: "Operacional",
};

export const SECTION_ORDER: ChecklistSection[] = [
  "strategic",
  "commercial",
  "operational",
];

export interface ChecklistTemplateItem {
  id: string;
  templateId: string;
  label: string;
  section: ChecklistSection;
  position: number;
  required: boolean;
}

export interface ChecklistTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  itemCount: number;
  requiredCount: number;
  items?: ChecklistTemplateItem[];
}

export async function listChecklistTemplates(
  organizationId: string
): Promise<ChecklistTemplate[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("checklist_templates")
    .select(
      "id, organization_id, name, description, is_default, checklist_template_items(id, required)"
    )
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const items =
      (row.checklist_template_items as unknown as { id: string; required: boolean }[]) ?? [];
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      isDefault: row.is_default,
      itemCount: items.length,
      requiredCount: items.filter((i) => i.required).length,
    };
  });
}

export async function getChecklistTemplate(
  id: string
): Promise<ChecklistTemplate | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("checklist_templates")
    .select(
      `
      id, organization_id, name, description, is_default,
      checklist_template_items (
        id, template_id, label, section, position, required
      )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const itemsRaw =
    (data.checklist_template_items as unknown as {
      id: string;
      template_id: string;
      label: string;
      section: ChecklistSection;
      position: number;
      required: boolean;
    }[]) ?? [];

  const items = itemsRaw
    .slice()
    .sort((a, b) => {
      const sectionDiff =
        SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
      if (sectionDiff !== 0) return sectionDiff;
      return a.position - b.position;
    })
    .map((i) => ({
      id: i.id,
      templateId: i.template_id,
      label: i.label,
      section: i.section,
      position: i.position,
      required: i.required,
    }));

  return {
    id: data.id,
    organizationId: data.organization_id,
    name: data.name,
    description: data.description,
    isDefault: data.is_default,
    itemCount: items.length,
    requiredCount: items.filter((i) => i.required).length,
    items,
  };
}

export async function getDefaultChecklistTemplate(
  organizationId: string
): Promise<ChecklistTemplate | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("checklist_templates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return getChecklistTemplate(data.id);
}
