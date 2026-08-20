import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260820_000026_event_extra_material.sql",
  "utf8"
);

function functionDefinition(name: string) {
  const marker = `create or replace function public.${name}(`;
  const start = sql.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${name}`);

  const next = sql.indexOf("\ncreate or replace function public.", start + marker.length);
  return sql.slice(start, next === -1 ? undefined : next);
}

const rpcContracts = [
  {
    name: "register_extra_serialized_material",
    signature: "uuid, uuid, text",
    lock: /for update of u/,
  },
  {
    name: "register_extra_bulk_material",
    signature: "uuid, uuid, uuid, integer, text",
    lock: /for update of bi/,
  },
  {
    name: "return_bulk_material",
    signature: "uuid, uuid, integer",
    lock: /for update of ee/,
  },
  {
    name: "unreturn_bulk_material",
    signature: "uuid, uuid, integer",
    lock: /for update of ee/,
  },
] as const;

describe("migration 026 — material extra", () => {
  it("adiciona metadados e contadores consistentes", () => {
    expect(sql).toMatch(/add column extra_qty integer not null default 0/);
    expect(sql).toMatch(/extra_qty <= qty/);
    expect(sql).toMatch(/bulk_returned_qty <= bulk_loaded_qty/);
    expect(sql).toMatch(/bulk_loaded_qty <= qty/);
  });

  it("cria auditoria imutavel", () => {
    expect(sql).toMatch(/create table public\.event_equipment_extra_log/);
    expect(sql).not.toMatch(/event_equipment_extra_log_update/);
    expect(sql).not.toMatch(/event_equipment_extra_log_delete/);
  });

  it("mantem o helper privado e valida warehouse, vinculo e estado", () => {
    const helper = functionDefinition("assert_warehouse_event_access");

    expect(helper).toMatch(/security definer/);
    expect(helper).toMatch(/set search_path = public, pg_temp/);
    expect(helper).toMatch(/has_org_role\(org_id, array\['warehouse'::public\.app_role\]\)/);
    expect(helper).toMatch(/event_date_team_members/);
    expect(helper).toMatch(/ready_to_load[\s\S]*in_field/);
    expect(helper).toMatch(/for update/);
    expect(helper).toMatch(
      /revoke execute on function public\.assert_warehouse_event_access\(uuid\) from public;/
    );
    expect(helper).not.toMatch(/grant execute/);
  });

  it.each(rpcContracts)(
    "$name chama o helper, trava sua fonte e restringe execute",
    ({ name, signature, lock }) => {
      const definition = functionDefinition(name);
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedSignature = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      expect(definition).toMatch(/security definer/);
      expect(definition).toMatch(/set search_path = public, pg_temp/);
      expect(definition).toMatch(/perform public\.assert_warehouse_event_access\(p_event_id\)/);
      expect(definition).toMatch(lock);
      expect(definition).toMatch(
        new RegExp(
          `revoke execute on function public\\.${escapedName}\\(${escapedSignature}\\) from public;`
        )
      );
      expect(definition).toMatch(
        new RegExp(
          `grant execute on function public\\.${escapedName}\\(${escapedSignature}\\) to authenticated;`
        )
      );
    }
  );

  it("devolver extra bulk recompõe a capacidade para uma nova inclusão", () => {
    const registerBulk = functionDefinition("register_extra_bulk_material");
    const returnBulk = functionDefinition("return_bulk_material");

    expect(registerBulk).toMatch(
      /sum\(\s*case\s+when ee\.returned_at is not null then 0\s+else ee\.qty - ee\.bulk_returned_qty\s+end\s*\)/
    );
    expect(registerBulk).not.toMatch(/sum\(ee\.qty\)/);
    expect(returnBulk).toMatch(/new_returned_qty := returned_qty \+ p_qty/);
    expect(returnBulk).toMatch(/set bulk_returned_qty = new_returned_qty/);
  });
});
