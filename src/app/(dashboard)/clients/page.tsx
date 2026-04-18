import { Users } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/session";
import { listClientOrganizations } from "@/lib/clients";
import { ClientsToolbar } from "@/app/(dashboard)/clients/ClientsToolbar";
import { ClientCard } from "@/app/(dashboard)/clients/ClientCard";
import { ClientsToastSync } from "@/app/(dashboard)/clients/ClientsToastSync";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [context, params] = await Promise.all([getCurrentUserContext(), searchParams]);

  if (!context) {
    redirect("/login");
  }

  if (!context.role || !["super_admin", "admin", "operations"].includes(context.role)) {
    redirect("/dashboard");
  }

  const query = typeof params.q === "string" ? params.q : "";
  const clients = await listClientOrganizations(query);

  return (
    <div className="space-y-6">
      <ClientsToastSync />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {clients.length} cliente(s) encontrado(s) no cadastro real do Supabase.
          </p>
        </div>
      </div>

      <ClientsToolbar defaultQuery={query} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {clients.map((client) => (
          <ClientCard key={client.id} client={client} />
        ))}

        {clients.length === 0 && (
          <div className="col-span-full rounded-3xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">Nenhum cliente encontrado.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre o primeiro cliente acima ou ajuste o filtro de busca.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
