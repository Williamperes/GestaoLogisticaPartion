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

export interface UtilizationPoint {
  month: string;
  utilization: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

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

export async function getUtilizationHistory(organizationId: string): Promise<UtilizationPoint[]> {
  const supabase = createSupabaseAdminClient();
  const now = new Date();

  // Buckets dos últimos 6 meses (do mais antigo para o atual).
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const start = `${y}-${pad2(m + 1)}-01`;
    const end = `${y}-${pad2(m + 1)}-${pad2(new Date(y, m + 1, 0).getDate())}`;
    const label = d
      .toLocaleDateString("pt-BR", { month: "short" })
      .replace(".", "");
    return {
      label: label.charAt(0).toUpperCase() + label.slice(1),
      start,
      end,
      units: new Set<string>(),
    };
  });

  const windowStart = buckets[0].start;
  const windowEnd = buckets[buckets.length - 1].end;

  const [{ count: totalUnits }, { data: events }] = await Promise.all([
    supabase
      .from("equipment_units")
      .select("id, equipment!inner(organization_id)", { count: "exact", head: true })
      .eq("equipment.organization_id", organizationId)
      .neq("status", "inactive"),
    supabase
      .from("events")
      .select("start_date, end_date, event_equipment(unit_id)")
      .eq("organization_id", organizationId)
      .neq("status", "cancelled")
      .lte("start_date", windowEnd)
      .gte("end_date", windowStart),
  ]);

  const total = totalUnits ?? 0;

  for (const event of (events ?? []) as {
    start_date: string;
    end_date: string;
    event_equipment: { unit_id: string | null }[] | null;
  }[]) {
    const unitIds = (event.event_equipment ?? [])
      .map((ee) => ee.unit_id)
      .filter((id): id is string => Boolean(id));
    if (unitIds.length === 0) continue;

    for (const bucket of buckets) {
      // Evento sobrepõe o mês do bucket?
      if (event.start_date <= bucket.end && event.end_date >= bucket.start) {
        for (const id of unitIds) bucket.units.add(id);
      }
    }
  }

  return buckets.map((b) => ({
    month: b.label,
    utilization: total > 0 ? Math.round((b.units.size / total) * 100) : 0,
  }));
}
