import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const roleMigrationPath = "supabase/migrations/20260816_000024_employee_role.sql";
const policiesMigrationPath =
  "supabase/migrations/20260816_000025_employee_events_maintenance_policies.sql";
const roleSql = existsSync(roleMigrationPath) ? readFileSync(roleMigrationPath, "utf8") : "";
const policiesSql = existsSync(policiesMigrationPath)
  ? readFileSync(policiesMigrationPath, "utf8")
  : "";

describe("employee access migration", () => {
  it("exists as an incremental migration", () => {
    expect(existsSync(roleMigrationPath)).toBe(true);
    expect(existsSync(policiesMigrationPath)).toBe(true);
  });

  it("declares employee before policies reference the role", () => {
    expect(roleSql).toContain("alter type public.app_role add value if not exists 'employee'");
    expect(roleMigrationPath.localeCompare(policiesMigrationPath)).toBeLessThan(0);
  });

  it.each([
    "events_insert",
    "events_update",
    "event_checklist_items_insert",
    "event_checklist_items_update",
    "event_equipment_insert",
    "event_equipment_update",
    "event_equipment_delete",
    "event_dates_insert",
    "event_dates_update",
    "event_dates_delete",
    "event_date_team_members_insert",
    "event_date_team_members_update",
    "event_date_team_members_delete",
    "event_speakers_insert",
    "event_speakers_update",
    "event_speakers_delete",
    "event_extras_insert",
    "event_extras_update",
    "event_extras_delete",
    "equipment_maintenance_update",
  ])("extends policy %s", (policy) => {
    const start = policiesSql.indexOf(`alter policy "${policy}"`);
    const next = policiesSql.indexOf("alter policy", start + 1);
    const statement = policiesSql.slice(start, next === -1 ? undefined : next);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(statement).toContain("'employee'::public.app_role");
  });

  it("keeps event deletion admin-only", () => {
    expect(policiesSql).not.toContain('alter policy "events_delete"');
  });
});
