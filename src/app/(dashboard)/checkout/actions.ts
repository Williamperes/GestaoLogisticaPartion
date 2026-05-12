"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/session";

async function requireWriteRole() {
  const context = await getCurrentUserContext();
  const writeRoles = ["super_admin", "admin", "operations", "warehouse"];
  if (!writeRoles.includes(context?.role ?? "")) redirect("/dashboard?error=unauthorized");
}

export async function confirmCheckoutItem(formData: FormData) {
  await requireWriteRole();

  const eventEquipmentId = String(formData.get("eventEquipmentId") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";

  if (!eventEquipmentId || !eventId) redirect(`/checkout?eventId=${eventId}&error=Dados inválidos.`);

  const supabase = createSupabaseAdminClient();

  const { data: item, error: fetchErr } = await supabase
    .from("event_equipment")
    .select("unit_id")
    .eq("id", eventEquipmentId)
    .maybeSingle();

  if (fetchErr || !item) redirect(`/checkout?eventId=${eventId}&error=Item não encontrado.`);

  const { error } = await supabase
    .from("event_equipment")
    .update({ confirmed })
    .eq("id", eventEquipmentId);

  if (error) redirect(`/checkout?eventId=${eventId}&error=${encodeURIComponent(error.message)}`);

  if (item.unit_id && confirmed) {
    await supabase
      .from("equipment_units")
      .update({ status: "in_field" })
      .eq("id", item.unit_id);
  } else if (item.unit_id && !confirmed) {
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
