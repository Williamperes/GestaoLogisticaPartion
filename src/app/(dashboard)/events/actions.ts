"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/session";
import { DEFAULT_CHECKLIST_ITEMS, isChecklistComplete } from "@/lib/events";
import { getChecklistTemplate } from "@/lib/checklist-templates";
import { getEquipmentAvailability, availabilityKey } from "@/lib/inventory";

const WRITE_ROLES = ["super_admin", "admin", "operations", "employee"] as const;
const CREATE_ROLES = ["super_admin", "admin", "operations"] as const;
const CHECKLIST_ROLES = ["super_admin", "admin", "operations", "warehouse", "employee"] as const;

async function requireCreateRole() {
  const context = await getCurrentUserContext();
  if (!context?.role || !CREATE_ROLES.includes(context.role as (typeof CREATE_ROLES)[number])) {
    redirect("/dashboard?error=unauthorized");
  }
  return context;
}

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
// Converte "1.234,56" / "1234.56" / "1234,56" em centavos. Vazio → null.
function parseEventValueToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

export async function createEvent(formData: FormData) {
  const context = await requireCreateRole();

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
  const templateId = String(formData.get("templateId") ?? "").trim() || null;

  // Campos operacionais opcionais
  const vehicle = String(formData.get("vehicle") ?? "").trim() || null;
  const lightingColor = String(formData.get("lightingColor") ?? "").trim() || null;
  const assemblyAt = String(formData.get("assemblyAt") ?? "").trim() || null;
  const teardownAt = String(formData.get("teardownAt") ?? "").trim() || null;
  const agencyName = String(formData.get("agencyName") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const valueCents = parseEventValueToCents(String(formData.get("value") ?? "").trim());
  const executivePresent = formData.get("executivePresent") === "on";
  const isRecorded = formData.get("isRecorded") === "on";
  const isLivestreamed = formData.get("isLivestreamed") === "on";
  const clientDemanding = formData.get("clientDemanding") === "on";
  const agencyDetailed = formData.get("agencyDetailed") === "on";
  const previousDayAssembly = formData.get("previousDayAssembly") === "on";
  const requiresAdvanceCredential = formData.get("requiresAdvanceCredential") === "on";
  const strictVenueHours = formData.get("strictVenueHours") === "on";

  if (!name || !startDate) {
    redirect("/events?error=Nome e data de início são obrigatórios.");
  }

  // Resolve template (se informado) e valida que pertence à org
  let templateItems: {
    label: string;
    position: number;
    section: "strategic" | "commercial" | "operational";
    required: boolean;
    template_item_id: string | null;
  }[] = [];

  if (templateId) {
    const template = await getChecklistTemplate(templateId);
    if (!template || template.organizationId !== organizationId) {
      redirect("/events?error=Template de checklist inválido.");
    }
    templateItems = (template.items ?? []).map((i) => ({
      label: i.label,
      position: i.position,
      section: i.section,
      required: i.required,
      template_item_id: i.id,
    }));
  } else {
    // Sem template selecionado: usa o checklist mínimo embutido para garantir
    // que a OS já nasça com um gate funcional.
    templateItems = DEFAULT_CHECKLIST_ITEMS.map((i) => ({
      label: i.label,
      position: i.position,
      section: i.section,
      required: i.required,
      template_item_id: null,
    }));
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
      vehicle,
      lighting_color: lightingColor,
      assembly_at: assemblyAt,
      teardown_at: teardownAt,
      agency_name: agencyName,
      notes,
      value_cents: valueCents,
      executive_present: executivePresent,
      is_recorded: isRecorded,
      is_livestreamed: isLivestreamed,
      client_demanding: clientDemanding,
      agency_detailed: agencyDetailed,
      previous_day_assembly: previousDayAssembly,
      requires_advance_credential: requiresAdvanceCredential,
      strict_venue_hours: strictVenueHours,
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (eventError) {
    redirect(`/events?error=${encodeURIComponent(eventError.message)}`);
  }

  if (templateItems.length > 0) {
    const checklistRows = templateItems.map((item) => ({
      event_id: event.id,
      label: item.label,
      position: item.position,
      section: item.section,
      required: item.required,
      template_item_id: item.template_item_id,
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
  }

  revalidatePath("/events");
  redirect(`/events/${event.id}?success=Evento%20criado.`);
}

// ──────────────────────────────────────────────────────────────────
// deleteEvent
// Exclui a OS por completo (cascata: checklist, datas, escala, palestrantes,
// extras, equipamentos/unidades). Restrito a admin. Bloqueado se a OS está
// "Em campo" — equipamento fora; conclua o retorno antes.
// ──────────────────────────────────────────────────────────────────
export async function deleteEvent(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context?.role || !["super_admin", "admin"].includes(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const eventId = String(formData.get("id") ?? "").trim();
  if (!eventId) redirect("/events?error=OS inválida.");

  const supabase = createSupabaseAdminClient();
  const { data: ev } = await supabase
    .from("events")
    .select("organization_id, status")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev || ev.organization_id !== organizationId) {
    redirect("/events?error=OS não encontrada.");
  }
  if (ev.status === "in_field") {
    redirect(
      `/events/${eventId}?error=${encodeURIComponent(
        "Não é possível excluir uma OS em campo. Conclua o retorno primeiro."
      )}`
    );
  }

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/events");
  redirect(`/events?success=${encodeURIComponent("OS excluída.")}`);
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
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    redirect("/dashboard?error=organization_not_found");
  }

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) redirect("/events?error=Evento inválido.");

  const supabase = createSupabaseAdminClient();

  // Validação na camada de aplicação: checklist obrigatório completo?
  const { data: items, error: fetchError } = await supabase
    .from("event_checklist_items")
    .select("id, done, required")
    .eq("event_id", eventId);

  if (fetchError) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(fetchError.message)}`);
  }

  if (!items || items.length === 0) {
    redirect(`/events/${eventId}?error=Este evento não possui checklist configurado.`);
  }

  if (!isChecklistComplete(items)) {
    const pending = items.filter((i) => (i.required ?? true) && !i.done).length;
    redirect(
      `/events/${eventId}?error=${encodeURIComponent(
        `Checklist incompleto: ${pending} item(s) obrigatório(s) pendente(s). Conclua todos para liberar a carga.`
      )}`
    );
  }

  // Validação de estoque: nenhuma OS pode ser promovida com overbooking.
  const { data: eventRow, error: eventFetchErr } = await supabase
    .from("events")
    .select("organization_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventFetchErr || !eventRow || eventRow.organization_id !== organizationId) {
    redirect(`/events/${eventId}?error=Evento inválido.`);
  }
  const eventDates = await getEventDateList(supabase, eventId);

  const { data: equipRows, error: equipFetchErr } = await supabase
    .from("event_equipment")
    .select("equipment_id, variant_id, qty, unit_id, equipment(name), equipment_variants(label)")
    .eq("event_id", eventId)
    .is("unit_id", null);
  if (equipFetchErr) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(equipFetchErr.message)}`);
  }

  const desiredByKey = new Map<string, { qty: number; name: string }>();
  for (const r of equipRows ?? []) {
    const equipmentRel = (r as unknown as { equipment: { name: string } | null }).equipment;
    const variantRel = (r as unknown as { equipment_variants: { label: string } | null })
      .equipment_variants;
    const baseName = equipmentRel?.name ?? "—";
    const name = variantRel ? `${baseName} ${variantRel.label}` : baseName;
    const key = availabilityKey(r.equipment_id, r.variant_id ?? null);
    const prev = desiredByKey.get(key) ?? { qty: 0, name };
    desiredByKey.set(key, { qty: prev.qty + r.qty, name });
  }

  if (desiredByKey.size > 0) {
    const availability = await getEquipmentAvailability(
      organizationId,
      eventDates,
      eventId
    );
    const oversold: { name: string; qty: number; available: number }[] = [];
    for (const [key, { qty, name }] of desiredByKey.entries()) {
      const avail = availability.get(key)?.available ?? 0;
      if (qty > avail) oversold.push({ name, qty, available: avail });
    }
    if (oversold.length > 0) {
      const detail = oversold
        .slice(0, 3)
        .map((o) => `${o.name} (${o.qty}/${o.available})`)
        .join(", ");
      redirect(
        `/events/${eventId}?error=${encodeURIComponent(
          `Estoque insuficiente para ${oversold.length} item(s): ${detail}. Ajuste a lista antes de liberar para carga.`
        )}`
      );
    }
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
  redirect(`/events/${eventId}?success=Evento%20liberado%20para%20carga!`);
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
    loaded: false,
  });

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
}

// ──────────────────────────────────────────────────────────────────
// applyEquipmentTemplate
// Popula event_equipment a partir de um template de equipamento. Linhas
// já presentes (mesmo equipment+variant, sem unit_id) têm a qty somada;
// as ausentes são inseridas. Base da "geração automática de OS".
// ──────────────────────────────────────────────────────────────────
export async function applyEquipmentTemplate(formData: FormData) {
  await requireWriteRole();

  const eventId = String(formData.get("eventId") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!eventId || !templateId) {
    redirect(`/events/${eventId}?error=Selecione um template.`);
  }

  const supabase = createSupabaseAdminClient();

  const { data: items, error: itemsErr } = await supabase
    .from("equipment_template_items")
    .select("equipment_id, variant_id, qty")
    .eq("template_id", templateId);
  if (itemsErr) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(itemsErr.message)}`);
  }
  if (!items || items.length === 0) {
    redirect(`/events/${eventId}?error=Template%20sem%20itens.`);
  }

  // Linhas existentes (estilo lote: unit_id IS NULL) para somar quantidades.
  const { data: existing, error: existErr } = await supabase
    .from("event_equipment")
    .select("id, equipment_id, variant_id, qty")
    .eq("event_id", eventId)
    .is("unit_id", null);
  if (existErr) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(existErr.message)}`);
  }

  const existingMap = new Map(
    (existing ?? []).map((r) => [availabilityKey(r.equipment_id, r.variant_id ?? null), r])
  );

  // Disponibilidade efetiva por (equipment, variant) nas datas da OS,
  // ignorando o que esta própria OS já reserva (excludeEventId).
  const { data: ev } = await supabase
    .from("events")
    .select("organization_id")
    .eq("id", eventId)
    .maybeSingle();
  const { data: dateRows } = await supabase
    .from("event_dates")
    .select("date")
    .eq("event_id", eventId);
  const dates = (dateRows ?? []).map((d) => d.date as string);
  const availability = ev
    ? await getEquipmentAvailability(ev.organization_id, dates, eventId)
    : new Map();

  // Nomes para a mensagem de aviso.
  const ids = Array.from(new Set((items ?? []).map((i) => i.equipment_id)));
  const { data: names } = await supabase.from("equipment").select("id, name").in("id", ids);
  const nameMap = new Map((names ?? []).map((n) => [n.id, n.name as string]));

  const inserts: { event_id: string; equipment_id: string; variant_id: string | null; qty: number; loaded: boolean }[] =
    [];
  const shortages: string[] = [];
  for (const item of items ?? []) {
    const vid = item.variant_id ?? null;
    const k = availabilityKey(item.equipment_id, vid);
    const found = existingMap.get(k);
    const finalQty = (found?.qty ?? 0) + item.qty;
    const available = (availability.get(k) as { available: number } | undefined)?.available ?? 0;
    if (finalQty > available) {
      shortages.push(`${nameMap.get(item.equipment_id) ?? "Item"} (precisa ${finalQty}, há ${available})`);
    }
    if (found) {
      await supabase
        .from("event_equipment")
        .update({ qty: finalQty })
        .eq("id", found.id);
    } else {
      inserts.push({
        event_id: eventId,
        equipment_id: item.equipment_id,
        variant_id: vid,
        qty: item.qty,
        loaded: false,
      });
    }
  }

  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from("event_equipment").insert(inserts);
    if (insErr) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(insErr.message)}`);
    }
  }

  revalidatePath(`/events/${eventId}`);
  const msg =
    shortages.length > 0
      ? `Lista gerada, mas estoque insuficiente: ${shortages.join("; ")}.`
      : "Lista de equipamentos gerada.";
  redirect(`/events/${eventId}?success=${encodeURIComponent(msg)}`);
}

// ──────────────────────────────────────────────────────────────────
// setEventEquipmentBatch
// Sincroniza a lista de equipamentos (bulk-style, unit_id IS NULL) de
// um evento a partir de um FormData com pares qty_<equipmentId> = N.
//   - qty > 0 e linha existe  -> UPDATE
//   - qty > 0 e linha ausente -> INSERT
//   - qty = 0 e linha existe  -> DELETE
//   - linhas com unit_id preenchido permanecem intocadas
// ──────────────────────────────────────────────────────────────────
export async function setEventEquipmentBatch(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    redirect("/dashboard?error=organization_not_found");
  }

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) redirect("/events?error=Evento inválido.");

  // Extrai pares do FormData. Formatos aceitos:
  //   qty_<equipmentId>                  → sem variante
  //   qty_<equipmentId>__<variantId>     → variante específica (separador __ )
  type DesiredRow = { equipmentId: string; variantId: string | null; qty: number };
  const desired = new Map<string, DesiredRow>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;
    const rest = key.slice(4);
    const [equipmentId, variantId] = rest.split("__");
    if (!equipmentId) continue;
    const qty = parseInt(String(value ?? "0"), 10);
    if (isNaN(qty) || qty < 0) continue;
    const vid = variantId || null;
    desired.set(availabilityKey(equipmentId, vid), { equipmentId, variantId: vid, qty });
  }

  if (desired.size === 0) {
    revalidatePath(`/events/${eventId}`);
    redirect(`/events/${eventId}?success=Nenhuma%20altera%C3%A7%C3%A3o.`);
  }

  const supabase = createSupabaseAdminClient();

  // Confirma que o evento pertence à org do usuário
  const { data: eventRow, error: eventErr } = await supabase
    .from("events")
    .select("id, organization_id, status")
    .eq("id", eventId)
    .maybeSingle();
  if (eventErr || !eventRow || eventRow.organization_id !== organizationId) {
    redirect(`/events/${eventId}?error=Evento inválido.`);
  }
  const eventDates = await getEventDateList(supabase, eventId);

  // Confirma que todos os equipamentos solicitados são da mesma org
  const equipmentIds = Array.from(new Set(Array.from(desired.values()).map((d) => d.equipmentId)));
  const { data: equipRows, error: equipErr } = await supabase
    .from("equipment")
    .select("id, organization_id")
    .in("id", equipmentIds);
  if (equipErr) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(equipErr.message)}`);
  }
  const validIds = new Set(
    (equipRows ?? [])
      .filter((e) => e.organization_id === organizationId)
      .map((e) => e.id)
  );
  if (validIds.size !== equipmentIds.length) {
    redirect(`/events/${eventId}?error=Um ou mais equipamentos são inválidos.`);
  }

  // Carrega estado atual (somente linhas bulk-style, unit_id IS NULL).
  const { data: currentRows, error: currentErr } = await supabase
    .from("event_equipment")
    .select("id, equipment_id, variant_id, qty")
    .eq("event_id", eventId)
    .is("unit_id", null);
  if (currentErr) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(currentErr.message)}`);
  }

  const currentByKey = new Map<string, { id: string; qty: number }>();
  for (const r of currentRows ?? []) {
    const k = availabilityKey(r.equipment_id, r.variant_id ?? null);
    currentByKey.set(k, { id: r.id, qty: r.qty });
  }

  // Disponibilidade conforme o status do evento.
  // - planning  : aceita overbooking (UI permite, gate impede promoção depois).
  // - outros    : hard block.
  const availability = await getEquipmentAvailability(
    organizationId,
    eventDates,
    eventId
  );

  if (eventRow.status !== "planning") {
    const oversold: { qty: number; available: number }[] = [];
    for (const [key, row] of desired.entries()) {
      if (row.qty <= 0) continue;
      const avail = availability.get(key)?.available ?? 0;
      if (row.qty > avail) {
        oversold.push({ qty: row.qty, available: avail });
      }
    }
    if (oversold.length > 0) {
      const detail = oversold
        .slice(0, 3)
        .map((o) => `${o.qty}/${o.available}`)
        .join(", ");
      redirect(
        `/events/${eventId}?error=${encodeURIComponent(
          `Estoque insuficiente em ${oversold.length} item(s) (${detail}). Reduza as quantidades ou volte ao status Planejamento.`
        )}`
      );
    }
  }

  const inserts: {
    event_id: string;
    equipment_id: string;
    variant_id: string | null;
    qty: number;
    loaded: boolean;
  }[] = [];
  const updates: { id: string; qty: number }[] = [];
  const deletes: string[] = [];

  for (const [key, row] of desired.entries()) {
    const existing = currentByKey.get(key);
    if (row.qty <= 0) {
      if (existing) deletes.push(existing.id);
      continue;
    }
    if (!existing) {
      inserts.push({
        event_id: eventId,
        equipment_id: row.equipmentId,
        variant_id: row.variantId,
        qty: row.qty,
        loaded: false,
      });
    } else if (existing.qty !== row.qty) {
      updates.push({ id: existing.id, qty: row.qty });
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("event_equipment").insert(inserts);
    if (error) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
    }
  }

  for (const u of updates) {
    const { error } = await supabase
      .from("event_equipment")
      .update({ qty: u.qty })
      .eq("id", u.id);
    if (error) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
    }
  }

  if (deletes.length > 0) {
    const { error } = await supabase
      .from("event_equipment")
      .delete()
      .in("id", deletes);
    if (error) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
    }
  }

  // Soft-warning quando em planejamento: avisa qualquer overbooking remanescente.
  let warning = "";
  if (eventRow.status === "planning") {
    const oversold: { qty: number; available: number }[] = [];
    for (const [key, row] of desired.entries()) {
      if (row.qty <= 0) continue;
      const avail = availability.get(key)?.available ?? 0;
      if (row.qty > avail) oversold.push({ qty: row.qty, available: avail });
    }
    if (oversold.length > 0) {
      warning = ` Atenção: ${oversold.length} item(s) acima do disponível — resolva antes de promover a OS.`;
    }
  }

  revalidatePath(`/events/${eventId}`);
  redirect(
    `/events/${eventId}?success=${encodeURIComponent(
      `Lista de equipamentos atualizada.${warning}`
    )}`
  );
}

// ──────────────────────────────────────────────────────────────────
// toggleEquipmentSeparated
// Marca/desmarca um item como SEPARADO (primeira conferência —
// almoxarifado tirou da prateleira). Não altera o estado loaded.
// ──────────────────────────────────────────────────────────────────
export async function toggleEquipmentSeparated(formData: FormData) {
  const context = await requireChecklistRole();

  const eventEquipmentId = String(formData.get("eventEquipmentId") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const separated =
    formData.get("separated") === "true" || formData.get("separated") === "1";

  if (!eventEquipmentId || !eventId) {
    redirect(`/events/${eventId}?error=Item inválido.`);
  }

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("event_equipment")
    .update({
      separated,
      separated_at: separated ? new Date().toISOString() : null,
      separated_by: separated ? context.userId : null,
    })
    .eq("id", eventEquipmentId)
    .eq("event_id", eventId);

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

// ──────────────────────────────────────────────────────────────────
// updateEventDetails
// Atualiza campos básicos + operacionais da OS (sem mexer em status,
// checklist ou equipamentos). Usado pelo card "Detalhes operacionais"
// no detalhe do evento.
// ──────────────────────────────────────────────────────────────────
export async function updateEventDetails(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) {
    redirect("/dashboard?error=organization_not_found");
  }

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) redirect("/events?error=Evento inválido.");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/events/${eventId}?error=${encodeURIComponent("Nome é obrigatório.")}`);
  }

  const clientOrganizationId = String(formData.get("clientOrganizationId") ?? "").trim() || null;
  const venue = String(formData.get("venue") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const venueNotes = String(formData.get("venueNotes") ?? "").trim() || null;
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim() || startDate;

  const vehicle = String(formData.get("vehicle") ?? "").trim() || null;
  const lightingColor = String(formData.get("lightingColor") ?? "").trim() || null;
  const assemblyAt = String(formData.get("assemblyAt") ?? "").trim() || null;
  const teardownAt = String(formData.get("teardownAt") ?? "").trim() || null;
  const agencyName = String(formData.get("agencyName") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const valueCents = parseEventValueToCents(String(formData.get("value") ?? "").trim());
  const invoiceStatusRaw = String(formData.get("invoiceStatus") ?? "").trim();
  const invoiceStatus = ["draft", "sent", "paid"].includes(invoiceStatusRaw)
    ? invoiceStatusRaw
    : "draft";
  const executivePresent = formData.get("executivePresent") === "on";
  const isRecorded = formData.get("isRecorded") === "on";
  const isLivestreamed = formData.get("isLivestreamed") === "on";
  const clientDemanding = formData.get("clientDemanding") === "on";
  const agencyDetailed = formData.get("agencyDetailed") === "on";
  const previousDayAssembly = formData.get("previousDayAssembly") === "on";
  const requiresAdvanceCredential = formData.get("requiresAdvanceCredential") === "on";
  const strictVenueHours = formData.get("strictVenueHours") === "on";

  if (!startDate) {
    redirect(`/events/${eventId}?error=${encodeURIComponent("Data de início é obrigatória.")}`);
  }

  const supabase = createSupabaseAdminClient();

  // Confirma que a OS pertence à org do usuário
  const { data: existing, error: fetchErr } = await supabase
    .from("events")
    .select("organization_id")
    .eq("id", eventId)
    .maybeSingle();
  if (fetchErr || !existing || existing.organization_id !== organizationId) {
    redirect(`/events/${eventId}?error=Evento inválido.`);
  }

  const { error } = await supabase
    .from("events")
    .update({
      name,
      client_organization_id: clientOrganizationId,
      venue,
      city,
      venue_notes: venueNotes,
      start_date: startDate,
      end_date: endDate,
      vehicle,
      lighting_color: lightingColor,
      assembly_at: assemblyAt,
      teardown_at: teardownAt,
      agency_name: agencyName,
      notes,
      value_cents: valueCents,
      invoice_status: invoiceStatus,
      executive_present: executivePresent,
      is_recorded: isRecorded,
      is_livestreamed: isLivestreamed,
      client_demanding: clientDemanding,
      agency_detailed: agencyDetailed,
      previous_day_assembly: previousDayAssembly,
      requires_advance_credential: requiresAdvanceCredential,
      strict_venue_hours: strictVenueHours,
    })
    .eq("id", eventId);

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  redirect(`/events/${eventId}?success=Detalhes%20atualizados.`);
}

// ──────────────────────────────────────────────────────────────────
// Helpers de autorização para event_dates / team
// ──────────────────────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

async function getEventDateList(
  supabase: SupabaseClient,
  eventId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("event_dates")
    .select("date")
    .eq("event_id", eventId);
  if (error) return [];
  return (data ?? []).map((r) => (r as { date: string }).date);
}

async function assertEventInOrg(
  supabase: SupabaseClient,
  eventId: string,
  organizationId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("events")
    .select("organization_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data || data.organization_id !== organizationId) {
    redirect(`/events/${eventId}?error=Evento inválido.`);
  }
}

async function resolveEventDate(
  supabase: SupabaseClient,
  eventDateId: string,
  organizationId: string
): Promise<{ eventId: string }> {
  const { data, error } = await supabase
    .from("event_dates")
    .select("id, event_id, events!inner (organization_id)")
    .eq("id", eventDateId)
    .maybeSingle();
  if (error || !data) {
    redirect(`/events?error=Data inválida.`);
  }
  const eventRel = (data as unknown as { events: { organization_id: string } | null }).events;
  if (!eventRel || eventRel.organization_id !== organizationId) {
    redirect(`/events?error=Data inválida.`);
  }
  return { eventId: (data as { event_id: string }).event_id };
}

async function resolveTeamAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  organizationId: string
): Promise<{ eventId: string }> {
  const { data, error } = await supabase
    .from("event_date_team_members")
    .select(
      `
      id, event_date_id,
      event_dates!inner (
        event_id,
        events!inner (organization_id)
      )
    `
    )
    .eq("id", assignmentId)
    .maybeSingle();
  if (error || !data) {
    redirect(`/events?error=Atribuição inválida.`);
  }
  const dateRel = (data as unknown as {
    event_dates: { event_id: string; events: { organization_id: string } | null } | null;
  }).event_dates;
  if (!dateRel || !dateRel.events || dateRel.events.organization_id !== organizationId) {
    redirect(`/events?error=Atribuição inválida.`);
  }
  return { eventId: dateRel.event_id };
}

const TEAM_ROLES = [
  "tecnico_responsavel",
  "audio",
  "luz",
  "led",
  "auxiliar",
  "comercial",
  "outro",
] as const;
type TeamRole = (typeof TEAM_ROLES)[number];

function parseTeamRole(raw: string): TeamRole | null {
  return (TEAM_ROLES as readonly string[]).includes(raw) ? (raw as TeamRole) : null;
}

// ──────────────────────────────────────────────────────────────────
// addEventDate
// Adiciona uma nova data ao evento. Trigger sincroniza
// events.start_date / end_date (min/max).
// ──────────────────────────────────────────────────────────────────
export async function addEventDate(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const eventId = String(formData.get("eventId") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  if (!eventId || !date) {
    redirect(`/events/${eventId}?error=Data obrigatória.`);
  }

  const supabase = createSupabaseAdminClient();
  await assertEventInOrg(supabase, eventId, organizationId);

  const positionRaw = parseInt(String(formData.get("position") ?? "0"), 10);
  const position = isNaN(positionRaw) ? 0 : positionRaw;
  const eventStartTime = String(formData.get("eventStartTime") ?? "").trim() || null;
  const eventEndTime = String(formData.get("eventEndTime") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const { error } = await supabase.from("event_dates").insert({
    event_id: eventId,
    date,
    position,
    event_start_time: eventStartTime,
    event_end_time: eventEndTime,
    notes,
  });

  if (error) {
    const msg = error.code === "23505" ? "Já existe uma data igual nessa OS." : error.message;
    redirect(`/events/${eventId}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  redirect(`/events/${eventId}?success=Data%20adicionada.`);
}

// ──────────────────────────────────────────────────────────────────
// updateEventDate
// ──────────────────────────────────────────────────────────────────
export async function updateEventDate(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const eventDateId = String(formData.get("eventDateId") ?? "").trim();
  if (!eventDateId) redirect("/events?error=Data inválida.");

  const supabase = createSupabaseAdminClient();
  const { eventId } = await resolveEventDate(supabase, eventDateId, organizationId);

  const date = String(formData.get("date") ?? "").trim();
  if (!date) {
    redirect(`/events/${eventId}?error=Data obrigatória.`);
  }
  const positionRaw = parseInt(String(formData.get("position") ?? "0"), 10);
  const position = isNaN(positionRaw) ? 0 : positionRaw;
  const eventStartTime = String(formData.get("eventStartTime") ?? "").trim() || null;
  const eventEndTime = String(formData.get("eventEndTime") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const { error } = await supabase
    .from("event_dates")
    .update({
      date,
      position,
      event_start_time: eventStartTime,
      event_end_time: eventEndTime,
      notes,
    })
    .eq("id", eventDateId);

  if (error) {
    const msg = error.code === "23505" ? "Já existe uma data igual nessa OS." : error.message;
    redirect(`/events/${eventId}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=Data%20atualizada.`);
}

// ──────────────────────────────────────────────────────────────────
// removeEventDate
// ──────────────────────────────────────────────────────────────────
export async function removeEventDate(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const eventDateId = String(formData.get("eventDateId") ?? "").trim();
  if (!eventDateId) redirect("/events?error=Data inválida.");

  const supabase = createSupabaseAdminClient();
  const { eventId } = await resolveEventDate(supabase, eventDateId, organizationId);

  const { error } = await supabase
    .from("event_dates")
    .delete()
    .eq("id", eventDateId);

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=Data%20removida.`);
}

// ──────────────────────────────────────────────────────────────────
// addEventDateTeamMember
// Adiciona pessoa à escala de uma data específica.
// Híbrido: team_member_id (FK) OU external_name (texto).
// Papel via enum; se 'outro', custom_role é obrigatório.
// ──────────────────────────────────────────────────────────────────
export async function addEventDateTeamMember(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const eventDateId = String(formData.get("eventDateId") ?? "").trim();
  if (!eventDateId) redirect("/events?error=Data inválida.");

  const supabase = createSupabaseAdminClient();
  const { eventId } = await resolveEventDate(supabase, eventDateId, organizationId);

  const teamMemberId = String(formData.get("teamMemberId") ?? "").trim() || null;
  const externalName = String(formData.get("externalName") ?? "").trim() || null;
  const roleRaw = String(formData.get("role") ?? "").trim();
  const role = parseTeamRole(roleRaw);
  const customRole = String(formData.get("customRole") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!role) {
    redirect(`/events/${eventId}?error=${encodeURIComponent("Papel inválido.")}`);
  }
  if (!teamMemberId && !externalName) {
    redirect(
      `/events/${eventId}?error=${encodeURIComponent(
        "Selecione um membro da equipe ou informe um nome."
      )}`
    );
  }
  if (role === "outro" && !customRole) {
    redirect(
      `/events/${eventId}?error=${encodeURIComponent(
        "Descreva o papel personalizado quando seleciona 'Outro'."
      )}`
    );
  }

  // Se foi escolhido um team_member, valida que ele é da mesma org.
  if (teamMemberId) {
    const { data: tm, error: tmErr } = await supabase
      .from("team_members")
      .select("id, organization_id")
      .eq("id", teamMemberId)
      .maybeSingle();
    if (tmErr || !tm || tm.organization_id !== organizationId) {
      redirect(`/events/${eventId}?error=${encodeURIComponent("Membro inválido.")}`);
    }
  }

  const { error } = await supabase.from("event_date_team_members").insert({
    event_date_id: eventDateId,
    team_member_id: teamMemberId,
    external_name: teamMemberId ? null : externalName,
    role,
    custom_role: role === "outro" ? customRole : null,
    notes,
  });

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=Pessoa%20adicionada%20%C3%A0%20escala.`);
}

// ──────────────────────────────────────────────────────────────────
// updateEventDateTeamMember
// ──────────────────────────────────────────────────────────────────
export async function updateEventDateTeamMember(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  if (!assignmentId) redirect("/events?error=Atribuição inválida.");

  const supabase = createSupabaseAdminClient();
  const { eventId } = await resolveTeamAssignment(supabase, assignmentId, organizationId);

  const teamMemberId = String(formData.get("teamMemberId") ?? "").trim() || null;
  const externalName = String(formData.get("externalName") ?? "").trim() || null;
  const roleRaw = String(formData.get("role") ?? "").trim();
  const role = parseTeamRole(roleRaw);
  const customRole = String(formData.get("customRole") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!role) {
    redirect(`/events/${eventId}?error=${encodeURIComponent("Papel inválido.")}`);
  }
  if (!teamMemberId && !externalName) {
    redirect(
      `/events/${eventId}?error=${encodeURIComponent(
        "Selecione um membro da equipe ou informe um nome."
      )}`
    );
  }
  if (role === "outro" && !customRole) {
    redirect(
      `/events/${eventId}?error=${encodeURIComponent(
        "Descreva o papel personalizado quando seleciona 'Outro'."
      )}`
    );
  }

  if (teamMemberId) {
    const { data: tm, error: tmErr } = await supabase
      .from("team_members")
      .select("id, organization_id")
      .eq("id", teamMemberId)
      .maybeSingle();
    if (tmErr || !tm || tm.organization_id !== organizationId) {
      redirect(`/events/${eventId}?error=${encodeURIComponent("Membro inválido.")}`);
    }
  }

  const { error } = await supabase
    .from("event_date_team_members")
    .update({
      team_member_id: teamMemberId,
      external_name: teamMemberId ? null : externalName,
      role,
      custom_role: role === "outro" ? customRole : null,
      notes,
    })
    .eq("id", assignmentId);

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=Escala%20atualizada.`);
}

// ──────────────────────────────────────────────────────────────────
// removeEventDateTeamMember
// ──────────────────────────────────────────────────────────────────
export async function removeEventDateTeamMember(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  if (!assignmentId) redirect("/events?error=Atribuição inválida.");

  const supabase = createSupabaseAdminClient();
  const { eventId } = await resolveTeamAssignment(supabase, assignmentId, organizationId);

  const { error } = await supabase
    .from("event_date_team_members")
    .delete()
    .eq("id", assignmentId);

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=Pessoa%20removida%20da%20escala.`);
}

// ──────────────────────────────────────────────────────────────────
// Speakers (palestrantes/artistas da OS)
// ──────────────────────────────────────────────────────────────────

async function resolveSpeaker(
  supabase: SupabaseClient,
  speakerId: string,
  organizationId: string
): Promise<{ eventId: string }> {
  const { data, error } = await supabase
    .from("event_speakers")
    .select("id, event_id, events!inner (organization_id)")
    .eq("id", speakerId)
    .maybeSingle();
  if (error || !data) {
    redirect(`/events?error=Palestrante inválido.`);
  }
  const eventRel = (data as unknown as { events: { organization_id: string } | null }).events;
  if (!eventRel || eventRel.organization_id !== organizationId) {
    redirect(`/events?error=Palestrante inválido.`);
  }
  return { eventId: (data as { event_id: string }).event_id };
}

export async function addEventSpeaker(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const eventId = String(formData.get("eventId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!eventId || !name) {
    redirect(`/events/${eventId}?error=Nome do palestrante obrigatório.`);
  }

  const supabase = createSupabaseAdminClient();
  await assertEventInOrg(supabase, eventId, organizationId);

  const positionRaw = parseInt(String(formData.get("position") ?? "0"), 10);
  const position = isNaN(positionRaw) ? 0 : positionRaw;

  const { error } = await supabase.from("event_speakers").insert({
    event_id: eventId,
    name,
    organization: String(formData.get("organization") ?? "").trim() || null,
    needs_mic: formData.get("needsMic") === "on",
    needs_notebook: formData.get("needsNotebook") === "on",
    needs_adapter: formData.get("needsAdapter") === "on",
    needs_dedicated_tech: formData.get("needsDedicatedTech") === "on",
    notes: String(formData.get("notes") ?? "").trim() || null,
    position,
  });

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=Palestrante%20adicionado.`);
}

export async function updateEventSpeaker(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const speakerId = String(formData.get("speakerId") ?? "").trim();
  if (!speakerId) redirect("/events?error=Palestrante inválido.");

  const supabase = createSupabaseAdminClient();
  const { eventId } = await resolveSpeaker(supabase, speakerId, organizationId);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/events/${eventId}?error=Nome do palestrante obrigatório.`);
  }

  const { error } = await supabase
    .from("event_speakers")
    .update({
      name,
      organization: String(formData.get("organization") ?? "").trim() || null,
      needs_mic: formData.get("needsMic") === "on",
      needs_notebook: formData.get("needsNotebook") === "on",
      needs_adapter: formData.get("needsAdapter") === "on",
      needs_dedicated_tech: formData.get("needsDedicatedTech") === "on",
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .eq("id", speakerId);

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=Palestrante%20atualizado.`);
}

export async function removeEventSpeaker(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const speakerId = String(formData.get("speakerId") ?? "").trim();
  if (!speakerId) redirect("/events?error=Palestrante inválido.");

  const supabase = createSupabaseAdminClient();
  const { eventId } = await resolveSpeaker(supabase, speakerId, organizationId);

  const { error } = await supabase
    .from("event_speakers")
    .delete()
    .eq("id", speakerId);

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=Palestrante%20removido.`);
}

// ──────────────────────────────────────────────────────────────────
// Extras (itens contratados externamente: gerador, palco, etc.)
// ──────────────────────────────────────────────────────────────────

const EXTRA_KINDS = [
  "generator",
  "box_truss",
  "tv",
  "projector",
  "stage",
  "other",
] as const;
type ExtraKind = (typeof EXTRA_KINDS)[number];

function parseExtraKind(raw: string): ExtraKind | null {
  return (EXTRA_KINDS as readonly string[]).includes(raw) ? (raw as ExtraKind) : null;
}

async function resolveExtra(
  supabase: SupabaseClient,
  extraId: string,
  organizationId: string
): Promise<{ eventId: string }> {
  const { data, error } = await supabase
    .from("event_extras")
    .select("id, event_id, events!inner (organization_id)")
    .eq("id", extraId)
    .maybeSingle();
  if (error || !data) {
    redirect(`/events?error=Extra inválido.`);
  }
  const eventRel = (data as unknown as { events: { organization_id: string } | null }).events;
  if (!eventRel || eventRel.organization_id !== organizationId) {
    redirect(`/events?error=Extra inválido.`);
  }
  return { eventId: (data as { event_id: string }).event_id };
}

function parseUnitPriceCents(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = parseFloat(raw.replace(",", "."));
  if (isNaN(value) || value < 0) return null;
  return Math.round(value * 100);
}

export async function addEventExtra(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const eventId = String(formData.get("eventId") ?? "").trim();
  const kind = parseExtraKind(String(formData.get("kind") ?? "").trim());
  const description = String(formData.get("description") ?? "").trim();
  if (!eventId || !kind || !description) {
    redirect(`/events/${eventId}?error=Dados do extra inválidos.`);
  }

  const supabase = createSupabaseAdminClient();
  await assertEventInOrg(supabase, eventId, organizationId);

  const qtyRaw = parseInt(String(formData.get("qty") ?? "1"), 10);
  const qty = isNaN(qtyRaw) || qtyRaw < 1 ? 1 : qtyRaw;
  const positionRaw = parseInt(String(formData.get("position") ?? "0"), 10);
  const position = isNaN(positionRaw) ? 0 : positionRaw;

  const { error } = await supabase.from("event_extras").insert({
    event_id: eventId,
    kind,
    description,
    qty,
    supplier: String(formData.get("supplier") ?? "").trim() || null,
    unit_price_cents: parseUnitPriceCents(String(formData.get("unitPrice") ?? "")),
    notes: String(formData.get("notes") ?? "").trim() || null,
    position,
  });

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=Extra%20adicionado.`);
}

export async function updateEventExtra(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const extraId = String(formData.get("extraId") ?? "").trim();
  if (!extraId) redirect("/events?error=Extra inválido.");

  const supabase = createSupabaseAdminClient();
  const { eventId } = await resolveExtra(supabase, extraId, organizationId);

  const kind = parseExtraKind(String(formData.get("kind") ?? "").trim());
  const description = String(formData.get("description") ?? "").trim();
  if (!kind || !description) {
    redirect(`/events/${eventId}?error=Dados do extra inválidos.`);
  }
  const qtyRaw = parseInt(String(formData.get("qty") ?? "1"), 10);
  const qty = isNaN(qtyRaw) || qtyRaw < 1 ? 1 : qtyRaw;

  const { error } = await supabase
    .from("event_extras")
    .update({
      kind,
      description,
      qty,
      supplier: String(formData.get("supplier") ?? "").trim() || null,
      unit_price_cents: parseUnitPriceCents(String(formData.get("unitPrice") ?? "")),
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .eq("id", extraId);

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=Extra%20atualizado.`);
}

export async function removeEventExtra(formData: FormData) {
  const context = await requireWriteRole();
  const organizationId = context.primaryOrganization?.id;
  if (!organizationId) redirect("/dashboard?error=organization_not_found");

  const extraId = String(formData.get("extraId") ?? "").trim();
  if (!extraId) redirect("/events?error=Extra inválido.");

  const supabase = createSupabaseAdminClient();
  const { eventId } = await resolveExtra(supabase, extraId, organizationId);

  const { error } = await supabase
    .from("event_extras")
    .delete()
    .eq("id", extraId);

  if (error) {
    redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?success=Extra%20removido.`);
}
