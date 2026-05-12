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

export async function returnCheckinItem(formData: FormData) {
  await requireWriteRole();

  const unitId = String(formData.get("unitId") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const damaged = formData.get("damaged") === "true";

  if (!unitId || !eventId) redirect(`/checkin?eventId=${eventId}&error=Dados inválidos.`);

  const supabase = createSupabaseAdminClient();
  const newStatus = damaged ? "maintenance" : "available";

  const { error } = await supabase
    .from("equipment_units")
    .update({ status: newStatus })
    .eq("id", unitId);

  if (error) redirect(`/checkin?eventId=${eventId}&error=${encodeURIComponent(error.message)}`);

  revalidatePath("/checkin");
}

export async function finalizeCheckin(formData: FormData) {
  await requireWriteRole();

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) redirect("/events");

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("events")
    .update({ status: "completed" })
    .eq("id", eventId);

  if (error) redirect(`/checkin?eventId=${eventId}&error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=${encodeURIComponent("Check-in finalizado. Evento concluído.")}`);
}
