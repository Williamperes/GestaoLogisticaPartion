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

export async function setEventBilling(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context || !context.role || !WRITE_ROLES.includes(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const eventId = String(formData.get("eventId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const valueRaw = String(formData.get("value") ?? "").trim();
  const invoiceStatus = String(formData.get("invoiceStatus") ?? "draft").trim();

  if (!eventId || !clientId) {
    redirect("/clients?error=Dados inválidos.");
  }
  if (!["draft", "sent", "paid"].includes(invoiceStatus)) {
    redirect(`/clients/${clientId}?error=Status de fatura inválido.`);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("events")
    .update({
      value_cents: valueRaw ? parseValueToCents(valueRaw) : null,
      invoice_status: invoiceStatus,
    })
    .eq("id", eventId);

  if (error) {
    redirect(`/clients/${clientId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/events/${eventId}`);
  redirect(`/clients/${clientId}?success=Faturamento atualizado.`);
}
