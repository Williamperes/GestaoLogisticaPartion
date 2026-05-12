"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/session";
import { DEFAULT_CHECKLIST_ITEMS, isChecklistComplete } from "@/lib/events";

const WRITE_ROLES = ["super_admin", "admin", "operations"] as const;
const CHECKLIST_ROLES = ["super_admin", "admin", "operations", "warehouse"] as const;

async function requireWriteRole() {
  const context = await getCurrentUserContext();
  if (!context?.role || !WRITE_ROLES.includes(context.role as (typeof WRITE_ROLES)[number])) {
    redirect("/dashboard?error=unauthorized");
  }
  return context;
}

async function requireChecklistRole() {
  const context = await getCurrentUserContext();
  if (!context?.role || !CHECKLIST_ROLES.includes(context.role as (typeof CHECKLIST_ROLES)[number])) {
    redirect("/dashboard?error=unauthorized");
  }
  return context;
}

// ──────────────────────────────────────────────────────────────────
// createEvent
// Cria evento e insere o checklist padrão automaticamente.
// ──────────────────────────────────────────────────────────────────
export async function createEvent(formData: FormData) {
  const context = await requireWriteRole();

  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    redirect("/dashboard?error=organization_not_found");
  }

  const name = String(formData.get("name") ?? "").trim();
  const clientOrganizationId = String(formData.get("clientOrganizationId") ?? "").trim() || null;
  const venue = String(formData.get("venue") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const venueNotes = String(formData.get("venueNotes") ?? "").trim() || null;
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim() || startDate;

  if (!name || !startDate) {
    redirect("/events?error=Nome e data de início são obrigatórios.");
  }

  const supabase = createSupabaseAdminClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      organization_id: organizationId,
      client_organization_id: clientOrganizationId,
      name,
      venue,
      city,
      venue_notes: venueNotes,
      start_date: startDate,
      end_date: endDate,
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (eventError) {
    redirect(`/events?error=${encodeURIComponent(eventError.message)}`);
  }

  // Insere checklist padrão automaticamente
  const checklistRows = DEFAULT_CHECKLIST_ITEMS.map((item) => ({
    event_id: event.id,
    label: item.label,
    position: item.position,
    done: false,
  }));

  const { error: checklistError } = await supabase
    .from("event_checklist_items")
    .insert(checklistRows);

  if (checklistError) {
    // Rollback do evento
    await supabase.from("events").delete().eq("id", event.id);
    redirect(`/events?error=${encodeURIComponent(checklistError.message)}`);
  }

  revalidatePath("/events");
  redirect(`/events/${event.id}?success=Evento criado.`);
}

// ──────────────────────────────────────────────────────────────────
// toggleChecklistItem
// Marca/desmarca um item do checklist estratégico.
// ──────────────────────────────────────────────────────────────────
export async function toggleChecklistItem(formData: FormData) {
  const context = await requireChecklistRole();

  const itemId = String(formData.get("itemId") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const doneRaw = formData.get("done");
  const done = doneRaw === "true" || doneRaw === "1";

  if (!itemId || !eventId) {
    redirect(`/events/${eventId}?error=Item inválido.`);
  }

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("event_checklist_items")
    .update({
      done,
      done_at: done ? new Date().toISOString() : null,
      done_by: done ? context.userId : null,
    })
    .eq("id", itemId)
    .eq("event_id", eventId);

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
}

// ──────────────────────────────────────────────────────────────────
// promoteToReadyToLoad
// Tenta avançar o status do evento para 'ready_to_load'.
// O trigger do banco bloqueia se o checklist estiver incompleto.
// A validação aqui é uma camada adicional com mensagem amigável.
// ──────────────────────────────────────────────────────────────────
export async function promoteToReadyToLoad(formData: FormData) {
  await requireWriteRole();

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) redirect("/events?error=Evento inválido.");

  const supabase = createSupabaseAdminClient();

  // Validação na camada de aplicação: checklist completo?
  const { data: items, error: fetchError } = await supabase
    .from("event_checklist_items")
    .select("id, done")
    .eq("event_id", eventId);

  if (fetchError) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(fetchError.message)}`);
  }

  if (!items || items.length === 0) {
    redirect(`/events/${eventId}?error=Este evento não possui checklist configurado.`);
  }

  if (!isChecklistComplete(items)) {
    const pending = items.filter((i) => !i.done).length;
    redirect(
      `/events/${eventId}?error=${encodeURIComponent(
        `Checklist incompleto: ${pending} item(s) pendente(s). Conclua todos para liberar a carga.`
      )}`
    );
  }

  // Atualização — o trigger do banco é a segunda barreira
  const { error: updateError } = await supabase
    .from("events")
    .update({ status: "ready_to_load" })
    .eq("id", eventId);

  if (updateError) {
    // Captura o erro específico do trigger (GATE_BLOCKED)
    const isGateBlocked =
      updateError.message?.includes("GATE_BLOCKED") ||
      updateError.code === "P0001";

    const message = isGateBlocked
      ? "Checklist ainda incompleto. Conclua todos os itens antes de liberar a carga."
      : updateError.message;

    redirect(`/events/${eventId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  redirect(`/events/${eventId}?success=Evento liberado para carga!`);
}

// ──────────────────────────────────────────────────────────────────
// addEquipmentToEvent
// Vincula um equipamento (ou unidade) a um evento.
// ──────────────────────────────────────────────────────────────────
export async function addEquipmentToEvent(formData: FormData) {
  await requireWriteRole();

  const eventId = String(formData.get("eventId") ?? "").trim();
  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const unitId = String(formData.get("unitId") ?? "").trim() || null;
  const qtyRaw = parseInt(String(formData.get("qty") ?? "1"), 10);
  const qty = isNaN(qtyRaw) || qtyRaw < 1 ? 1 : qtyRaw;

  if (!eventId || !equipmentId) {
    redirect(`/events/${eventId}?error=Dados inválidos.`);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("event_equipment").insert({
    event_id: eventId,
    equipment_id: equipmentId,
    unit_id: unitId,
    qty,
    confirmed: false,
  });

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
}

// ──────────────────────────────────────────────────────────────────
// removeEquipmentFromEvent
// Remove um equipamento vinculado a um evento.
// ──────────────────────────────────────────────────────────────────
export async function removeEquipmentFromEvent(formData: FormData) {
  await requireWriteRole();

  const eventEquipmentId = String(formData.get("eventEquipmentId") ?? "").trim();
  if (!eventEquipmentId) redirect("/events?error=Dados inválidos.");

  const supabase = createSupabaseAdminClient();

  const { data: row } = await supabase
    .from("event_equipment")
    .select("event_id")
    .eq("id", eventEquipmentId)
    .maybeSingle();

  const eventId = row?.event_id ?? "";

  const { error } = await supabase
    .from("event_equipment")
    .delete()
    .eq("id", eventEquipmentId);

  if (error) redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/events/${eventId}`);
}
