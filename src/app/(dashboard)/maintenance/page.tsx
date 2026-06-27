import { redirect } from "next/navigation";
import Link from "next/link";
import { Wrench } from "lucide-react";

import { getCurrentUserContext } from "@/lib/auth/session";
import { listMaintenance, formatUnitCondition } from "@/lib/maintenance";

import { ResolveButton } from "./ResolveButton";

export default async function MaintenancePage() {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (!context.role || !["super_admin", "admin", "operations", "warehouse"].includes(context.role)) {
    redirect("/dashboard");
  }

  const organizationId = context.primaryOrganization?.id;
  const records = organizationId ? await listMaintenance(organizationId) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Manutenção</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {records.length} {records.length === 1 ? "item bloqueado" : "itens bloqueados"} aguardando
          resolução.
        </p>
      </div>

      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <Wrench className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum item na fila de manutenção.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Itens marcados como danificados ou perdidos na conferência de retorno aparecem aqui.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {records.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/inventory/${r.equipmentId}`}
                    className="font-medium hover:text-amber-600"
                  >
                    {r.equipmentName}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      r.condition === "lost"
                        ? "bg-red-500/15 text-red-700"
                        : "bg-amber-500/15 text-amber-700"
                    }`}
                  >
                    {formatUnitCondition(r.condition)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.unitSerial ? `Série ${r.unitSerial}` : "Sem série"}
                  {r.eventName ? ` · OS: ${r.eventName}` : ""}
                </p>
                {r.note ? (
                  <p className="mt-1 truncate text-xs italic text-muted-foreground">“{r.note}”</p>
                ) : null}
              </div>
              <ResolveButton id={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
