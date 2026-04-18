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
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        userName={context.profile?.fullName ?? context.email ?? "Usuário"}
        userRole={context.role ?? "Sem role"}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
