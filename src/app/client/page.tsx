import { Building2, CalendarDays, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUserContext } from "@/lib/auth/session";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export default async function ClientHomePage() {
  const context = await getCurrentUserContext();

  if (!context) {
    return null;
  }

  const displayName = context.profile?.fullName ?? context.email ?? "Cliente";

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl bg-card p-6 shadow-[0_18px_48px_rgba(17,17,17,0.08)] ring-1 ring-foreground/10 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit rounded-full px-3 py-1">Portal do Cliente</Badge>
            <div>
              <h1 className="text-3xl font-semibold">{displayName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sua visão restrita será construída aqui, vinculada à organização principal e aos eventos liberados.
              </p>
            </div>
          </div>

          <form action={signOut}>
            <Button type="submit" variant="outline" className="rounded-2xl">
              Sair
            </Button>
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" />
                Organização
              </CardTitle>
              <CardDescription>Contexto principal carregado no login.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {context.primaryOrganization?.name ?? "Sem organização principal"}
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Role
              </CardTitle>
              <CardDescription>Papel atual resolvido pelo vínculo primário.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">{context.role ?? "Sem role"}</CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-primary" />
                Próxima etapa
              </CardTitle>
              <CardDescription>Eventos liberados por cliente entram na próxima migration.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">Criar tabela de eventos e políticas de acesso por cliente.</CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
