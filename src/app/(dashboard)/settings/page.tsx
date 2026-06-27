import Link from "next/link";
import { redirect } from "next/navigation";
import { ListChecks, ChevronRight, Boxes } from "lucide-react";

import { getCurrentUserContext } from "@/lib/auth/session";

const SETTINGS_LINKS = [
  {
    href: "/settings/checklist-templates",
    icon: ListChecks,
    label: "Templates de Checklist",
    description: "Defina os blocos estratégicos, comerciais e operacionais que cada OS precisa preencher.",
  },
  {
    href: "/settings/equipment-templates",
    icon: Boxes,
    label: "Templates de Equipamento",
    description: "Monte presets de equipamento por tipo de evento e gere a lista de uma OS com um clique.",
  },
];

export default async function SettingsPage() {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (!context.role || !["super_admin", "admin"].includes(context.role)) {
    redirect("/dashboard");
  }
  const role = context.role;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Ajuste regras e templates que valem para toda a organização.
        </p>
      </div>

      <ul className="space-y-2">
        {SETTINGS_LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-amber-500/40 hover:bg-amber-500/5"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <item.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-amber-600" />
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground/70">
        Você está logado como{" "}
        <strong className="font-semibold text-foreground">{role || "—"}</strong>.
      </p>
    </div>
  );
}
