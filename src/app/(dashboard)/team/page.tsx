import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/session";
import { listTeamMembers } from "@/lib/team";
import { TeamToolbar } from "@/app/(dashboard)/team/TeamToolbar";
import { TeamMemberCard } from "@/app/(dashboard)/team/TeamMemberCard";
import { TeamToastSync } from "@/app/(dashboard)/team/TeamToastSync";

export default async function TeamPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  if (!context.role || !["super_admin", "admin", "operations"].includes(context.role)) {
    redirect("/dashboard");
  }

  const organizationId = context.primaryOrganization?.id;

  if (!organizationId) {
    redirect("/dashboard");
  }

  const members = await listTeamMembers(organizationId);

  return (
    <div className="space-y-8">
      <TeamToastSync />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{members.length} técnicos cadastrados</p>
        </div>
        <TeamToolbar canProvision={context.role === "super_admin" || context.role === "admin"} />
      </div>

      {members.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <TeamMemberCard
              key={member.id}
              member={member}
              canResetPassword={context.role === "super_admin" || context.role === "admin"}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-sm text-muted-foreground">
          Nenhum técnico cadastrado ainda.
        </div>
      )}
    </div>
  );
}
