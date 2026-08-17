import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, Mail, UserRound } from "lucide-react";

import {
  registerEmployee,
  signInEmployeeWithPassword,
  signInWithPassword,
} from "@/app/(auth)/actions";
import { getCurrentUserContext, getDefaultAppPathForUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type LoginPortal = "internal" | "employee";
type EmployeeMode = "login" | "register";

function textParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function Field({
  id,
  label,
  name,
  type,
  placeholder,
  minLength,
  icon,
}: {
  id: string;
  label: string;
  name: string;
  type: "text" | "email" | "password";
  placeholder: string;
  minLength?: number;
  icon: "user" | "mail" | "lock";
}) {
  const Icon = icon === "user" ? UserRound : icon === "mail" ? Mail : Lock;

  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          id={id}
          type={type}
          name={name}
          required
          minLength={minLength}
          placeholder={placeholder}
          autoComplete={name === "full_name" ? "name" : name === "password_confirmation" ? "new-password" : name === "password" ? "current-password" : "email"}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </span>
    </label>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [context, params] = await Promise.all([getCurrentUserContext(), searchParams]);

  if (context) {
    redirect(await getDefaultAppPathForUser(context.userId));
  }

  const portal: LoginPortal = textParam(params.portal) === "employee" ? "employee" : "internal";
  const mode: EmployeeMode =
    portal === "employee" && textParam(params.mode) === "register" ? "register" : "login";
  const error = textParam(params.error);
  const message = textParam(params.message);
  const isRegistration = portal === "employee" && mode === "register";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/[0.035] via-background to-muted/40 px-4 py-10 sm:px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Partion</h1>
          <p className="text-sm text-muted-foreground">Acesso à plataforma Partion</p>
        </div>

        <Card className="gap-0 rounded-3xl border-0 py-0 shadow-[0_24px_64px_rgba(17,17,17,0.08)]">
          <nav aria-label="Tipo de acesso" className="grid grid-cols-2 border-b border-border/70 p-2">
            <Link
              href="/login?portal=internal"
              aria-current={portal === "internal" ? "page" : undefined}
              className={`rounded-2xl px-3 py-2.5 text-center text-sm font-medium transition-colors ${
                portal === "internal" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Equipe interna
            </Link>
            <Link
              href="/login?portal=employee"
              aria-current={portal === "employee" ? "page" : undefined}
              className={`rounded-2xl px-3 py-2.5 text-center text-sm font-medium transition-colors ${
                portal === "employee" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Funcionários
            </Link>
          </nav>

          <CardHeader className="px-6 pb-0 pt-6">
            <CardTitle className="text-base font-medium">
              {isRegistration ? "Criar conta de funcionário" : portal === "employee" ? "Acesso de funcionários" : "Entrar"}
            </CardTitle>
          </CardHeader>

          <CardContent className="px-6 pb-6 pt-4">
            <form
              action={isRegistration ? registerEmployee : portal === "employee" ? signInEmployeeWithPassword : signInWithPassword}
              className="space-y-4"
            >
              {isRegistration && (
                <Field id="employee-name" label="Nome completo" name="full_name" type="text" placeholder="Seu nome completo" icon="user" />
              )}
              <Field id={`${portal}-email`} label="Email" name="email" type="email" placeholder={portal === "employee" ? "voce@empresa.com" : "voce@partion.com"} icon="mail" />
              <Field id={`${portal}-password`} label="Senha" name="password" type="password" placeholder="Sua senha" minLength={isRegistration ? 8 : undefined} icon="lock" />
              {isRegistration && (
                <Field id="employee-password-confirmation" label="Confirmar senha" name="password_confirmation" type="password" placeholder="Repita sua senha" minLength={8} icon="lock" />
              )}

              {error && <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</div>}
              {message && <div role="status" className="rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-foreground">{message}</div>}

              <Button type="submit" className="h-11 w-full rounded-2xl text-sm font-semibold">
                {isRegistration ? "Criar conta" : "Entrar"}
              </Button>
            </form>

            {portal === "employee" ? (
              <p className="mt-5 text-center text-xs text-muted-foreground">
                {isRegistration ? "Já possui uma conta? " : "Ainda não possui uma conta? "}
                <Link href={isRegistration ? "/login?portal=employee" : "/login?portal=employee&mode=register"} className="font-semibold text-primary hover:underline">
                  {isRegistration ? "Entrar" : "Criar conta"}
                </Link>
              </p>
            ) : (
              <p className="mt-5 text-center text-xs text-muted-foreground">Sem acesso? Fale com o administrador do sistema.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
