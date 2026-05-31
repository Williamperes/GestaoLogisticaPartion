import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  if (context.role === "client") {
    redirect("/client");
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar
        userName={context.profile?.fullName ?? context.email ?? "Usuário"}
        userRole={context.role ?? "Sem role"}
        role={context.role ?? null}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          userName={context.profile?.fullName ?? context.email ?? "Usuário"}
          userRole={context.role ?? "Sem role"}
          role={context.role ?? null}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
