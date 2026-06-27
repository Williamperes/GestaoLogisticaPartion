"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { toast } from "sonner";

import { resolveMaintenance } from "@/app/(dashboard)/maintenance/actions";

export function ResolveButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleResolve() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await resolveMaintenance(id);
      if (!result.ok) {
        toast.error(result.error ?? "Erro");
        return;
      }
      toast.success("Item devolvido ao estoque.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleResolve}
      disabled={busy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
    >
      <Wrench className="h-3.5 w-3.5" />
      {busy ? "Resolvendo..." : "Resolver"}
    </button>
  );
}
