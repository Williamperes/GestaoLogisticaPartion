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

  it("distingue inclusão serializada real de repetição idempotente e retorna o log canônico", () => {
    const registerSerialized = functionDefinition("register_extra_serialized_material");

    expect(registerSerialized).toMatch(/variant_id uuid/);
    expect(registerSerialized).toMatch(/added_qty integer/);
    expect(registerSerialized).toMatch(/extra_log_id uuid/);
    expect(registerSerialized).toMatch(/extra_log_created_at timestamptz/);
    expect(registerSerialized).toMatch(/extra_log_added_by uuid/);
    expect(registerSerialized).toMatch(
      /select ee_id, unit_equipment_id, unit_variant_id, p_equipment_unit_id,[\s\S]*0,[\s\S]*null::uuid,[\s\S]*null::timestamptz,[\s\S]*null::uuid/
    );
    expect(registerSerialized).toMatch(
      /returning log_entry\.id, log_entry\.created_at, log_entry\.added_by/
    );
    expect(registerSerialized).toMatch(
      /select ee_id, unit_equipment_id, unit_variant_id, p_equipment_unit_id,[\s\S]*1,[\s\S]*log_id,[\s\S]*log_created_at,[\s\S]*log_added_by/
    );
  });

  it("retorna a identidade canônica do log bulk", () => {
    const registerBulk = functionDefinition("register_extra_bulk_material");

    expect(registerBulk).toMatch(/variant_id uuid/);
    expect(registerBulk).toMatch(/added_qty integer/);
    expect(registerBulk).toMatch(/extra_log_id uuid/);
    expect(registerBulk).toMatch(
      /returning log_entry\.id, log_entry\.created_at, log_entry\.added_by/
    );
    expect(registerBulk).toMatch(
      /select ee_id, p_equipment_id, p_variant_id,[\s\S]*p_qty,[\s\S]*log_id,[\s\S]*log_created_at,[\s\S]*log_added_by/
    );
  });

  it("autoriza retorno por organização e exige vínculo de warehouse", () => {
    const helper = functionDefinition("assert_event_return_access");

    expect(helper).toMatch(/security definer/);
    expect(helper).toMatch(/set search_path = public, pg_temp/);
    expect(helper).toMatch(
      /has_org_role\(org_id, array\[[\s\S]*'super_admin'[\s\S]*'admin'[\s\S]*'operations'[\s\S]*'warehouse'/
    );
    expect(helper).toMatch(
      /organization_members[\s\S]*organization_id = org_id[\s\S]*caller_role = 'warehouse'/
    );
    expect(helper).toMatch(/event_date_team_members/);
    expect(helper).toMatch(/ready_to_load[\s\S]*in_field/);
    expect(helper).toMatch(/for update/);
    expect(helper).toMatch(
      /revoke execute on function public\.assert_event_return_access\(uuid\) from public;/
    );
    expect(helper).not.toMatch(/grant execute/);
  });

  it("finaliza retorno atomicamente sob locks e somente de in_field", () => {
    const finalize = functionDefinition("finalize_event_return");

    expect(finalize).toMatch(/security definer/);
    expect(finalize).toMatch(/set search_path = public, pg_temp/);
    expect(finalize).toMatch(/perform public\.assert_event_return_access\(p_event_id\)/);
    expect(finalize).toMatch(/order by ee\.id[\s\S]*for update of ee/);
    expect(finalize).toMatch(/order by eeu\.id[\s\S]*for update of eeu/);
    expect(finalize).toMatch(/bulk_returned_qty < ee\.bulk_loaded_qty/);
    expect(finalize).toMatch(/eeu\.loaded_at is not null[\s\S]*eeu\.returned_at is null/);
    expect(finalize).toMatch(
      /update public\.events[\s\S]*set status = 'completed'[\s\S]*where id = p_event_id[\s\S]*and status = 'in_field'/
    );
    expect(finalize).toMatch(/raise exception 'EXTRA_RETURN_PENDING'/);
    expect(finalize).toMatch(
      /revoke execute on function public\.finalize_event_return\(uuid\) from public;/
    );
    expect(finalize).toMatch(
      /grant execute on function public\.finalize_event_return\(uuid\) to authenticated;/
    );
  });

  it("desfaz retorno serializado dentro da RPC protegida por estado", () => {
    const unreturn = functionDefinition("unreturn_serialized_material");

    expect(unreturn).toMatch(/perform public\.assert_event_return_access\(p_event_id\)/);
    expect(unreturn).toMatch(/ee\.event_id = p_event_id/);
    expect(unreturn).toMatch(/for update of ee/);
    expect(unreturn).toMatch(/for update of eeu/);
    expect(unreturn).toMatch(/set returned_at = null,[\s\S]*returned_by = null/);
    expect(unreturn).toMatch(
      /revoke execute on function public\.unreturn_serialized_material\(uuid, uuid, uuid\) from public;/
    );
    expect(unreturn).toMatch(
      /grant execute on function public\.unreturn_serialized_material\(uuid, uuid, uuid\) to authenticated;/
    );
  });

  it("mantém updates bulk limitados por id e event_id", () => {
    for (const name of ["return_bulk_material", "unreturn_bulk_material"]) {
      expect(functionDefinition(name)).toMatch(
        /update public\.event_equipment ee[\s\S]*where ee\.id = p_event_equipment_id[\s\S]*and ee\.event_id = p_event_id/
      );
    }
  });
});
