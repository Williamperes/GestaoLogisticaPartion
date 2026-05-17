"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/session";

async function requireWriteRole() {
  const context = await getCurrentUserContext();
  const writeRoles = ["super_admin", "admin", "operations", "warehouse"];
  if (!writeRoles.includes(context?.role ?? "")) redirect("/dashboard?error=unauthorized");
  return context;
}

export async function confirmCheckoutItem(formData: FormData) {
  const context = await requireWriteRole();

  const eventEquipmentId = String(formData.get("eventEquipmentId") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  // Manteve o name "confirmed" no FormData por compat com a UI; semântica = loaded.
  const loaded = formData.get("confirmed") === "true";

  if (!eventEquipmentId || !eventId) redirect(`/checkout?eventId=${eventId}&error=Dados inválidos.`);

  const supabase = createSupabaseAdminClient();

  const { data: item, error: fetchErr } = await supabase
    .from("event_equipment")
    .select("unit_id, separated")
    .eq("id", eventEquipmentId)
    .maybeSingle();

  if (fetchErr || !item) redirect(`/checkout?eventId=${eventId}&error=Item não encontrado.`);

  const nowIso = new Date().toISOString();
  // Carregar implica separado. Se ainda não estava separado, marca também.
  const update: Record<string, unknown> = {
    loaded,
    loaded_at: loaded ? nowIso : null,
    loaded_by: loaded ? context?.userId ?? null : null,
  };
  if (loaded && !item.separated) {
    update.separated = true;
    update.separated_at = nowIso;
    update.separated_by = context?.userId ?? null;
  }

  const { error } = await supabase
    .from("event_equipment")
    .update(update)
    .eq("id", eventEquipmentId);

  if (error) redirect(`/checkout?eventId=${eventId}&error=${encodeURIComponent(error.message)}`);

  if (item.unit_id && loaded) {
    await supabase
      .from("equipment_units")
      .update({ status: "in_field" })
      .eq("id", item.unit_id);
  } else if (item.unit_id && !loaded) {
    await supabase
      .from("equipment_units")
      .update({ status: "available" })
      .eq("id", item.unit_id);
  }

  revalidatePath(`/checkout`);
}

export async function finalizeCheckout(formData: FormData) {
  await requireWriteRole();

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) redirect("/events");

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("events")
    .update({ status: "in_field" })
    .eq("id", eventId);

  if (error) redirect(`/checkout?eventId=${eventId}&error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=${encodeURIComponent("Checkout finalizado. Evento em campo.")}`);
}
