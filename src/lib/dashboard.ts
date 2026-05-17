import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface DashboardKPIs {
  eventsThisMonth: number;
  eventsNextMonth: number;
  itemsInMaintenance: number;
  utilizationRate: number;
  pendingReturns: number;
}

export interface CategoryStat {
  name: string;
  count: number;
}

export async function getDashboardKPIs(organizationId: string): Promise<DashboardKPIs> {
  const supabase = createSupabaseAdminClient();
  const now = new Date();

  const pad = (n: number) => String(n).padStart(2, "0");
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const thisStart = `${year}-${pad(month + 1)}-01`;
  const thisEnd = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;

  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const nextStart = `${nextYear}-${pad(nextMonth + 1)}-01`;
  const nextEnd = `${nextYear}-${pad(nextMonth + 1)}-${pad(new Date(nextYear, nextMonth + 1, 0).getDate())}`;

  const [
    { count: eventsThisMonth },
    { count: eventsNextMonth },
    { count: pendingReturns },
    { data: unitData },
  ] = await Promise.all([
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("start_date", thisStart)
      .lte("start_date", thisEnd),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("start_date", nextStart)
      .lte("start_date", nextEnd),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "in_field"),
    supabase
      .from("equipment_units")
      .select("status, equipment!inner(organization_id)")
      .eq("equipment.organization_id", organizationId)
      .neq("status", "inactive"),
  ]);

  const units = (unitData ?? []) as { status: string }[];
  const totalUnits = units.length;
  const inUse = units.filter((u) => u.status === "reserved" || u.status === "in_field").length;
  const maintenance = units.filter((u) => u.status === "maintenance").length;
  const utilizationRate = totalUnits > 0 ? Math.round((inUse / totalUnits) * 100) : 0;

  return {
    eventsThisMonth: eventsThisMonth ?? 0,
    eventsNextMonth: eventsNextMonth ?? 0,
    itemsInMaintenance: maintenance,
    utilizationRate,
    pendingReturns: pendingReturns ?? 0,
  };
}

export async function getCategoryStats(organizationId: string): Promise<CategoryStat[]> {
  const supabase = createSupabaseAdminClient();

  const { data } = await supabase
    .from("equipment_categories")
    .select("name, equipment(count)")
    .eq("organization_id", organizationId);

  if (!data) return [];

  return data
    .map((row) => ({
      name: row.name,
      count: (row.equipment as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}
