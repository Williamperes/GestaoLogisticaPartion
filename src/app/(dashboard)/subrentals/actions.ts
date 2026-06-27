"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/session";

const WRITE_ROLES = ["super_admin", "admin", "operations", "finance"];

function parseValueToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

export async function createSubrental(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context || !context.role || !WRITE_ROLES.includes(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    redirect("/subrentals?error=Organização não encontrada.");
  }

  const direction = String(formData.get("direction") ?? "").trim();
  const partnerName = String(formData.get("partnerName") ?? "").trim();
  const itemDescription = String(formData.get("itemDescription") ?? "").trim();
  const qtyRaw = String(formData.get("qty") ?? "1").trim();
  const valueRaw = String(formData.get("value") ?? "").trim();
  const expectedStart = String(formData.get("expectedStart") ?? "").trim() || null;
  const expectedEnd = String(formData.get("expectedEnd") ?? "").trim() || null;
  const eventId = String(formData.get("eventId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (direction !== "inbound" && direction !== "outbound") {
    redirect("/subrentals?error=Selecione o tipo de sublocação.");
  }
  if (!partnerName) {
    redirect("/subrentals?error=Informe o parceiro/fornecedor.");
  }
  if (!itemDescription) {
    redirect("/subrentals?error=Descreva o item.");
  }
  const qty = Math.max(1, Number.parseInt(qtyRaw, 10) || 1);

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("subrentals").insert({
    organization_id: organizationId,
    direction,
    partner_name: partnerName,
    item_description: itemDescription,
    qty,
    value_cents: valueRaw ? parseValueToCents(valueRaw) : null,
    event_id: eventId,
    expected_start: expectedStart,
    expected_end: expectedEnd,
    notes,
    created_by: context.userId ?? null,
  });

  if (error) {
    redirect(`/subrentals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/subrentals");
  redirect(`/subrentals?success=${encodeURIComponent("Sublocação registrada.")}`);
}

export async function setSubrentalStatus(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context || !context.role || !WRITE_ROLES.includes(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !["pending", "out", "returned"].includes(status)) {
    redirect("/subrentals?error=Dados inválidos.");
  }

  const patch: Record<string, unknown> = { status };
  if (status === "out") patch.out_at = new Date().toISOString();
  if (status === "returned") patch.returned_at = new Date().toISOString();

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("subrentals").update(patch).eq("id", id);
  if (error) {
    redirect(`/subrentals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/subrentals");
  redirect(`/subrentals?success=${encodeURIComponent("Status atualizado.")}`);
}

export async function deleteSubrental(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context || !context.role || !["super_admin", "admin"].includes(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    redirect("/subrentals?error=Registro inválido.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("subrentals").delete().eq("id", id);
  if (error) {
    redirect(`/subrentals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/subrentals");
  redirect(`/subrentals?success=${encodeURIComponent("Sublocação removida.")}`);
}
