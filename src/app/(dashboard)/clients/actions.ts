"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/session";
import { resolveUniqueOrganizationSlug } from "@/lib/clients";

export async function createClient(formData: FormData) {
  const context = await getCurrentUserContext();

  if (!context || !context.role || !["super_admin", "admin", "operations"].includes(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const name = String(formData.get("name") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim() || null;
  const contactEmail = String(formData.get("contactEmail") ?? "").trim() || null;
  const contactPhone = String(formData.get("contactPhone") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;

  if (!name) {
    redirect("/clients?error=Informe o nome do cliente.");
  }

  const supabase = createSupabaseAdminClient();
  const slug = await resolveUniqueOrganizationSlug(name);

  const { error } = await supabase.from("organizations").insert({
    name,
    slug,
    type: "client",
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    address,
    city,
  });

  if (error?.code === "42703") {
    const { error: fallbackError } = await supabase.from("organizations").insert({
      name,
      slug,
      type: "client",
    });

    if (fallbackError) {
      redirect(`/clients?error=${encodeURIComponent(fallbackError.message)}`);
    }
  } else if (error) {
    redirect(`/clients?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/clients");
  redirect("/clients?success=Cliente cadastrado.");
}

export async function updateClient(formData: FormData) {
  const context = await getCurrentUserContext();

  if (!context || !context.role || !["super_admin", "admin", "operations"].includes(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim() || null;
  const contactEmail = String(formData.get("contactEmail") ?? "").trim() || null;
  const contactPhone = String(formData.get("contactPhone") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;

  if (!id || !name) {
    redirect("/clients?error=Dados inválidos para atualizar cliente.");
  }

  const supabase = createSupabaseAdminClient();
  const nextSlug = await resolveUniqueOrganizationSlug(name, { excludeId: id });

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      slug: nextSlug,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      address,
      city,
    })
    .eq("id", id)
    .eq("type", "client");

  if (error?.code === "42703") {
    const { error: fallbackError } = await supabase
      .from("organizations")
      .update({
        name,
        slug: nextSlug,
      })
      .eq("id", id)
      .eq("type", "client");

    if (fallbackError) {
      redirect(`/clients?error=${encodeURIComponent(fallbackError.message)}`);
    }
  } else if (error) {
    redirect(`/clients?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/clients");
  redirect("/clients?success=Cliente atualizado.");
}

export async function deleteClient(formData: FormData) {
  const context = await getCurrentUserContext();

  if (!context || !context.role || !["super_admin", "admin", "operations"].includes(context.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    redirect("/clients?error=Cliente inválido.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("organizations").delete().eq("id", id).eq("type", "client");

  if (error) {
    redirect(`/clients?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/clients");
  redirect("/clients?success=Cliente apagado.");
}
