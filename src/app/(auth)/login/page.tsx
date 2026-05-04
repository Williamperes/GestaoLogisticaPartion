import { redirect } from "next/navigation";
import { Lock, Mail } from "lucide-react";

import { signInWithPassword } from "@/app/(auth)/actions";
import { getCurrentUserContext } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [context, params] = await Promise.all([getCurrentUserContext(), searchParams]);

  if (context) {
    redirect("/dashboard");
  }

  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Partion</h1>
          <p className="text-sm text-muted-foreground">Acesso restrito à equipe interna</p>
        </div>

        <Card className="rounded-3xl border-0 shadow-[0_24px_64px_rgba(17,17,17,0.08)]">
          <CardHeader className="px-6 pt-6 pb-0">
            <CardTitle className="text-base font-medium">Entrar</CardTitle>
          </CardHeader>

          <CardContent className="px-6 pb-6 pt-4">
            <form action={signInWithPassword} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">Email</span>
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="voce@partion.com"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">Senha</span>
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type="password"
                    name="password"
                    required
                    placeholder="Sua senha"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </label>

              {error && (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="h-11 w-full rounded-2xl text-sm font-semibold">
                Entrar
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              Sem acesso? Fale com o administrador do sistema.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
