import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260820_000026_event_extra_material.sql",
  "utf8"
);

describe("migration 026 — material extra", () => {
  it("adiciona metadados e contadores consistentes", () => {
    expect(sql).toMatch(/add column extra_qty integer not null default 0/);
    expect(sql).toMatch(/extra_qty <= qty/);
    expect(sql).toMatch(/bulk_returned_qty <= bulk_loaded_qty/);
    expect(sql).toMatch(/bulk_loaded_qty <= qty/);
  });

  it("cria auditoria imutavel e as duas RPCs", () => {
    expect(sql).toMatch(/create table public\.event_equipment_extra_log/);
    expect(sql).toMatch(/register_extra_serialized_material/);
    expect(sql).toMatch(/register_extra_bulk_material/);
    expect(sql).toMatch(/return_bulk_material/);
    expect(sql).toMatch(/unreturn_bulk_material/);
    expect(sql).not.toMatch(/event_equipment_extra_log_update/);
    expect(sql).not.toMatch(/event_equipment_extra_log_delete/);
  });

  it("valida warehouse, vinculo e estado dentro das RPCs", () => {
    expect(sql).toMatch(/has_org_role\([\s\S]*'warehouse'/);
    expect(sql).toMatch(/event_date_team_members/);
    expect(sql).toMatch(/ready_to_load[\s\S]*in_field/);
  });
});
