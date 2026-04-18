import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/session";

export default async function Home() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  redirect(context.role === "client" ? "/client" : "/dashboard");
}
