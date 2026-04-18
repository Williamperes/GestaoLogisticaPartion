import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { signInWithPassword } from "@/app/(auth)/actions";
import { getCurrentUserContext } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [context, params] = await Promise.all([getCurrentUserContext(), searchParams]);

  if (context) {
    redirect(context.role === "client" ? "/client" : "/dashboard");
  }

  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden rounded-3xl bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-primary)_88%,white),color-mix(in_srgb,var(--color-chart-2)_85%,white))] p-8 text-white shadow-[0_30px_80px_rgba(17,17,17,0.18)] lg:flex lg:flex-col lg:justify-between">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Partion
          </div>

          <div className="max-w-xl space-y-5">
            <h1 className="text-4xl font-semibold leading-tight">
              Acesso centralizado para operacao interna e portal do cliente.
            </h1>
            <p className="max-w-lg text-sm text-white/78">
              Faça login para abrir seu contexto principal de organização, com isolamento por tenant e áreas
              protegidas por role.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-white/84 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/16 bg-black/12 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/56">Area</p>
              <p className="mt-2 font-medium">Operations</p>
            </div>
            <div className="rounded-2xl border border-white/16 bg-black/12 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/56">Area</p>
              <p className="mt-2 font-medium">Warehouse</p>
            </div>
            <div className="rounded-2xl border border-white/16 bg-black/12 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/56">Area</p>
              <p className="mt-2 font-medium">Client Portal</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <Card className="w-full max-w-md rounded-3xl border-0 bg-white/90 py-0 shadow-[0_24px_64px_rgba(17,17,17,0.1)] backdrop-blur">
            <CardHeader className="gap-2 px-6 pt-6">
              <CardTitle className="text-2xl font-semibold">Entrar</CardTitle>
              <CardDescription>
                Use seu email e senha para acessar a organização principal vinculada ao seu usuário.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 pb-6">
              <form action={signInWithPassword} className="space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Email</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="voce@empresa.com"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Senha</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                    <Lock className="h-4 w-4 text-muted-foreground" />
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

              <div className="mt-5 text-center text-sm text-muted-foreground">
                Precisa de acesso? Solicite o provisionamento ao administrador da sua organização.
              </div>

              <div className="mt-6 border-t border-border pt-5 text-center text-xs text-muted-foreground">
                Conectado ao Supabase. Ambiente protegido por sessao e tenant.
                <div className="mt-2">
                  <Link href="/api/health/supabase" className="text-primary hover:underline">
                    Validar conexao
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
