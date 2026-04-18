import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/session";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  if (context.role !== "client" && context.role !== "admin" && context.role !== "super_admin") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
