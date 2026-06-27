"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentAuthUser } from "@/lib/auth/session";

export interface ResolveResult {
  ok: boolean;
  error?: string;
}

/**
 * Resolve uma ocorrência da fila de manutenção: fecha o registro e devolve a
 * unidade ao estoque (status 'available'), liberando-a para novas OS.
 */
export async function resolveMaintenance(id: string): Promise<ResolveResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const supabase = createSupabaseAdminClient();

  const { data: record, error: recErr } = await supabase
    .from("equipment_maintenance")
    .select("id, equipment_unit_id, status")
    .eq("id", id)
    .maybeSingle();
  if (recErr) return { ok: false, error: recErr.message };
  if (!record) return { ok: false, error: "Ocorrência não encontrada" };
  if (record.status === "resolved") return { ok: true };

  const { error: updErr } = await supabase
    .from("equipment_maintenance")
    .update({
      status: "resolved",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) return { ok: false, error: updErr.message };

  const { error: unitErr } = await supabase
    .from("equipment_units")
    .update({ status: "available" })
    .eq("id", record.equipment_unit_id);
  if (unitErr) return { ok: false, error: unitErr.message };

  revalidatePath("/maintenance");
  revalidatePath("/inventory");
  return { ok: true };
}
