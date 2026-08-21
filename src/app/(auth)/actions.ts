"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getDefaultAppPathForUser, getPrimaryAppRoleForUser } from "@/lib/auth/session";
import { getEmployeeOrganizationId } from "@/lib/env";

type LoginPortal = "internal" | "employee";

function loginErrorUrl(portal: LoginPortal, message: string) {
  const path = portal === "employee" ? "/login?portal=employee" : "/login";
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}error=${encodeURIComponent(message)}`;
}

async function signInForPortal(formData: FormData, portal: LoginPortal) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(loginErrorUrl(portal, "Preencha email e senha."));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(loginErrorUrl(portal, error?.message ?? "Nao foi possivel entrar."));
  }

  const role = await getPrimaryAppRoleForUser(data.user.id);

  if (portal === "employee" && role !== "employee") {
    await supabase.auth.signOut();
    redirect(
      `/login?portal=internal&error=${encodeURIComponent("Use o acesso da Equipe interna.")}`
    );
  }

  redirect(await getDefaultAppPathForUser(data.user.id));
}

export async function signInWithPassword(formData: FormData) {
  return signInForPortal(formData, "internal");
}

export async function signInEmployeeWithPassword(formData: FormData) {
  return signInForPortal(formData, "employee");
}

function registrationErrorUrl(message: string) {
  return `/login?portal=employee&mode=register&error=${encodeURIComponent(message)}`;
}

export async function registerEmployee(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("password_confirmation") ?? "");
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!fullName) {
    redirect(registrationErrorUrl("Informe seu nome completo."));
  }
  if (!emailPattern.test(email)) {
    redirect(registrationErrorUrl("Informe um email valido."));
  }
  if (password.length < 8) {
    redirect(registrationErrorUrl("A senha deve ter pelo menos 8 caracteres."));
  }
  if (password !== passwordConfirmation) {
    redirect(registrationErrorUrl("As senhas nao coincidem."));
  }

  let organizationId: string;
  try {
    organizationId = getEmployeeOrganizationId();
  } catch {
    redirect(registrationErrorUrl("Cadastro temporariamente indisponivel."));
  }

  const admin = createSupabaseAdminClient();
  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id, is_active")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError || !organization?.is_active) {
    redirect(registrationErrorUrl("Cadastro temporariamente indisponivel."));
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    redirect(registrationErrorUrl("Este email ja esta cadastrado ou nao pode ser utilizado."));
  }

  const { error: membershipError } = await admin.from("organization_members").insert({
    user_id: created.user.id,
    organization_id: organizationId,
    role: "employee",
    is_primary: true,
  });

  if (membershipError) {
    await admin.auth.admin.deleteUser(created.user.id);
    redirect(registrationErrorUrl("Nao foi possivel concluir o cadastro."));
  }

  const supabase = await createSupabaseServerClient();
  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !session.user) {
    redirect(
      `/login?portal=employee&message=${encodeURIComponent(
        "Conta criada. Entre com seu email e senha."
      )}`
    );
  }

  redirect("/events");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
