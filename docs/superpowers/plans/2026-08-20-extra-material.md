# Material a mais na carga da OS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que somente o perfil `warehouse` vinculado à OS registre material extra com motivo obrigatório, carga imediata, auditoria e devolução obrigatória.

**Architecture:** `event_equipment` permanece a fonte canônica da OS e recebe metadados de quantidade extra e contadores agregados para lote. Duas RPCs PostgreSQL fazem inclusão serializada e em lote atomicamente; actions Next.js validam sessão e traduzem erros, enquanto um Client Component isolado implementa a terceira aba da carga.

**Tech Stack:** Next.js 16.2.1 App Router, React 19.2.4, TypeScript 5, Supabase/PostgreSQL com RLS e RPC, Vitest 4.1.8, Testing Library, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-08-20-extra-material-design.md`

## Global Constraints

- A aba e as actions de inclusão são exclusivas para `role === "warehouse"`.
- O usuário `warehouse` precisa estar vinculado à OS por `event_date_team_members`.
- Inclusões são aceitas apenas em OS `ready_to_load` ou `in_field`.
- Motivo é obrigatório após `trim()` e cada operação gera auditoria imutável.
- O extra entra imediatamente em `event_equipment.qty`, é considerado carregado e participa da devolução.
- QR serializado e inclusão manual em lote devem ser atômicos e impedir overbooking.
- Não adicionar dependências npm.
- Ler os guias relevantes em `node_modules/next/dist/docs/` antes de alterar código Next.js.

---

## File Structure

- Create `supabase/migrations/20260820_000026_event_extra_material.sql`: colunas, auditoria, RLS e RPCs atômicas.
- Create `src/lib/extra-material.ts`: tipos e consultas de candidatos/histórico.
- Modify `src/lib/events.ts`: expor metadados extras e contagens de lote.
- Modify `src/app/(dashboard)/scan/actions.ts`: actions de inclusão e devolução manual de lote.
- Create `src/app/(dashboard)/scan/load/[eventId]/ExtraMaterialPanel.tsx`: scanner, busca, quantidade, motivo e histórico.
- Modify `src/app/(dashboard)/scan/load/[eventId]/LoadScanClient.tsx`: terceira aba condicionada a `warehouse`.
- Modify `src/app/(dashboard)/scan/load/[eventId]/page.tsx`: autorização, dados e props.
- Modify `src/app/(dashboard)/scan/return/[eventId]/ReturnScanClient.tsx`: contagem e devolução de lote.
- Modify `src/app/(dashboard)/scan/return/[eventId]/page.tsx`: propagar tipo e contadores.
- Create `tests/extra-material.migration.test.ts`, `tests/extra-material.lib.test.ts`, `tests/ExtraMaterialPanel.test.tsx`.
- Modify `tests/scan.actions.test.ts`, `tests/events.lib.test.ts`, `tests/LoadScanClient.test.tsx`, `tests/ReturnScanClient.test.tsx`, `tests/page.scanLoad.test.tsx`, `tests/page.scanReturn.test.tsx`.

---

### Task 1: Schema, auditoria e contratos SQL

**Files:**
- Create: `supabase/migrations/20260820_000026_event_extra_material.sql`
- Create: `tests/extra-material.migration.test.ts`

**Interfaces:**
- Produces: RPC `register_extra_serialized_material(p_event_id uuid, p_equipment_unit_id uuid, p_reason text)`.
- Produces: RPC `register_extra_bulk_material(p_event_id uuid, p_equipment_id uuid, p_variant_id uuid, p_qty integer, p_reason text)`.
- Produces: RPC `return_bulk_material(p_event_id uuid, p_event_equipment_id uuid, p_qty integer)`.
- Produces: RPC `unreturn_bulk_material(p_event_id uuid, p_event_equipment_id uuid, p_qty integer)`.
- Produces: colunas `extra_qty`, `extra_reason`, `extra_added_by`, `extra_added_at`, `bulk_loaded_qty`, `bulk_returned_qty` em `event_equipment`.
- Produces: tabela somente-acréscimo `event_equipment_extra_log`.

- [ ] **Step 1: Write the failing migration contract tests**

```ts
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
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/extra-material.migration.test.ts`

Expected: FAIL because `20260820_000026_event_extra_material.sql` does not exist.

- [ ] **Step 3: Create the migration schema and helper authorization function**

Use these exact constraints and signatures:

```sql
alter table public.event_equipment
  add column extra_qty integer not null default 0,
  add column extra_reason text,
  add column extra_added_by uuid references auth.users(id) on delete set null,
  add column extra_added_at timestamptz,
  add column bulk_loaded_qty integer not null default 0,
  add column bulk_returned_qty integer not null default 0,
  add constraint event_equipment_extra_qty_check check (extra_qty >= 0 and extra_qty <= qty),
  add constraint event_equipment_bulk_counts_check check (
    bulk_returned_qty >= 0 and
    bulk_returned_qty <= bulk_loaded_qty and
    bulk_loaded_qty <= qty
  );

create table public.event_equipment_extra_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_equipment_id uuid not null references public.event_equipment(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  variant_id uuid references public.equipment_variants(id) on delete restrict,
  equipment_unit_id uuid references public.equipment_units(id) on delete restrict,
  qty integer not null check (qty > 0),
  reason text not null check (length(btrim(reason)) > 0),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);
```

Create indexes on `(event_id, created_at desc)` and `event_equipment_id`. Enable RLS. Add only a select policy for authenticated organization members; writes occur inside guarded `security definer` RPCs. Set `search_path = public, pg_temp` on both RPCs and revoke public execution before granting to `authenticated`.

Create private SQL helper `assert_warehouse_event_access(target_event_id uuid)` that raises stable error codes/messages after checking:

```sql
select e.organization_id, e.status
from public.events e
where e.id = target_event_id
for update;

-- role
public.has_org_role(org_id, array['warehouse'::public.app_role])

-- assigned member
exists (
  select 1
  from public.team_members tm
  join public.event_date_team_members edtm on edtm.team_member_id = tm.id
  join public.event_dates ed on ed.id = edtm.event_date_id
  where tm.user_id = auth.uid()
    and tm.organization_id = org_id
    and ed.event_id = target_event_id
)
```

Raise `EXTRA_NOT_AUTHENTICATED`, `EXTRA_FORBIDDEN`, `EXTRA_EVENT_STATE`, `EXTRA_REASON_REQUIRED`, `EXTRA_NOT_AVAILABLE`, and `EXTRA_UNIT_CONFLICT` as applicable.

- [ ] **Step 4: Implement serialized RPC atomically**

The function must trim `p_reason`, lock the `equipment_units` row `for update`, verify its equipment belongs to the event organization and its status is not `maintenance`/`inactive`, and reject any row in another non-cancelled/non-completed OS where the same unit has `loaded_at is not null and returned_at is null`.

Within one function call:

```sql
-- Find the canonical row for equipment + variant, preferring an existing row.
select id, qty, extra_qty into ee_id, current_qty, current_extra_qty
from public.event_equipment
where event_id = p_event_id
  and equipment_id = unit_equipment_id
  and variant_id is not distinct from unit_variant_id
order by created_at
limit 1
for update;

-- Insert or increment exactly once, then record the already-loaded unit.
update public.event_equipment
set qty = qty + 1,
    extra_qty = extra_qty + 1,
    extra_reason = clean_reason,
    extra_added_by = auth.uid(),
    extra_added_at = timezone('utc', now())
where id = ee_id;
```

If the same unit is already loaded in this OS, return the existing IDs without incrementing. Otherwise upsert `event_equipment_units` with `loaded_at/loaded_by`, insert one audit row with `qty = 1`, synchronize `loaded/separated` when loaded count reaches `qty`, and return `(event_equipment_id, equipment_id, equipment_unit_id, qty, extra_qty)`.

- [ ] **Step 5: Implement bulk RPC atomically**

Lock the matching `bulk_inventory` row using `variant_id is not distinct from p_variant_id`. Validate `p_qty > 0`, equipment type `bulk`, same organization, and remaining capacity using active overlapping OS allocations. Then insert/increment `event_equipment`, increasing `qty`, `extra_qty`, and `bulk_loaded_qty` by `p_qty`, update latest metadata, and insert one audit row. Return `(event_equipment_id, equipment_id, qty, extra_qty, bulk_loaded_qty)`.

- [ ] **Step 6: Implement aggregate bulk return RPCs**

Implement `return_bulk_material` and `unreturn_bulk_material` with the same authorization helper. Both lock the target `event_equipment` row, require it to belong to `p_event_id`, require a positive `p_qty`, and update only when the resulting value satisfies `0 <= bulk_returned_qty <= bulk_loaded_qty`. Return the new aggregate count; otherwise raise `EXTRA_RETURN_RANGE`.

- [ ] **Step 7: Run migration tests and full tests**

Run: `npm test -- tests/extra-material.migration.test.ts`

Expected: PASS, 3 tests.

Run: `npm test`

Expected: all existing tests PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260820_000026_event_extra_material.sql tests/extra-material.migration.test.ts
git commit -m "feat(db): add atomic extra material records"
```

---

### Task 2: Domain types, event mapping and read queries

**Files:**
- Create: `src/lib/extra-material.ts`
- Create: `tests/extra-material.lib.test.ts`
- Modify: `src/lib/events.ts`
- Modify: `tests/events.lib.test.ts`

**Interfaces:**
- Produces: `ExtraMaterialCandidate`, `ExtraMaterialLog`, `listExtraMaterialCandidates(eventId, organizationId)`, `listExtraMaterialLog(eventId, organizationId)`.
- Produces on `EventEquipment`: `equipmentType`, `extraQty`, `extraReason`, `extraAddedBy`, `extraAddedAt`, `bulkLoadedQty`, `bulkReturnedQty`.

- [ ] **Step 1: Write failing mapping and query tests**

Add a fixture in `tests/events.lib.test.ts` with:

```ts
{
  qty: 5,
  extra_qty: 2,
  extra_reason: "Cliente pediu mais dois cabos",
  extra_added_by: "warehouse-user",
  extra_added_at: "2026-08-20T18:00:00.000Z",
  bulk_loaded_qty: 5,
  bulk_returned_qty: 1,
  equipment: { id: "eq-1", name: "Cabo XLR", type: "bulk" },
  event_equipment_units: []
}
```

Assert literal mapped values and that `loadedUnitsCount === 5` and `returnedUnitsCount === 1` for bulk. In `tests/extra-material.lib.test.ts`, mock Supabase at the query boundary and assert candidates exclude zero availability and history is newest first.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/events.lib.test.ts tests/extra-material.lib.test.ts`

Expected: FAIL because fields/module do not exist.

- [ ] **Step 3: Add exact domain interfaces**

```ts
export interface ExtraMaterialCandidate {
  equipmentId: string;
  equipmentName: string;
  equipmentType: "serialized" | "bulk";
  variantId: string | null;
  variantLabel: string | null;
  availableQty: number;
  unit: string;
}

export interface ExtraMaterialLog {
  id: string;
  eventEquipmentId: string;
  equipmentId: string;
  equipmentName: string;
  variantId: string | null;
  variantLabel: string | null;
  equipmentUnitId: string | null;
  qty: number;
  reason: string;
  addedBy: string | null;
  addedByName: string | null;
  createdAt: string;
}
```

`listExtraMaterialCandidates` must call existing availability logic for the OS dates and map serialized capacity and bulk `total_qty` consistently. `listExtraMaterialLog` must filter through the event organization, join equipment/variant/profile display name, and order descending by `created_at`.

- [ ] **Step 4: Extend `getEventById` selection and mapping**

Add all six columns and `equipment.type` to its Supabase selection and row types. Map bulk loaded/returned counts from aggregate columns and serialized counts from `event_equipment_units`.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/events.lib.test.ts tests/extra-material.lib.test.ts`

Expected: PASS.

```bash
git add src/lib/events.ts src/lib/extra-material.ts tests/events.lib.test.ts tests/extra-material.lib.test.ts
git commit -m "feat: expose extra material inventory data"
```

---

### Task 3: Authorized server actions for extra material

**Files:**
- Modify: `src/app/(dashboard)/scan/actions.ts`
- Modify: `tests/scan.actions.test.ts`

**Interfaces:**
- Produces: `registerExtraSerializedMaterial(eventId: string, qrCode: string, reason: string): Promise<ExtraMaterialResult>`.
- Produces: `registerExtraBulkMaterial(input: ExtraBulkInput): Promise<ExtraMaterialResult>`.

- [ ] **Step 1: Write failing authorization and RPC delegation tests**

Define expected contracts:

```ts
interface ExtraBulkInput {
  eventId: string;
  equipmentId: string;
  variantId: string | null;
  qty: number;
  reason: string;
}

interface ExtraMaterialResult extends ScanResult {
  qty?: number;
  extraQty?: number;
}
```

Tests must cover literals:

- unauthenticated → `{ ok: false, error: "Não autenticado" }`;
- admin → `{ ok: false, error: "Apenas a equipe de almoxarifado pode registrar material extra." }`;
- unassigned warehouse → `{ ok: false, error: "Sem acesso a esta OS." }`;
- blank reason → `{ ok: false, error: "Informe o motivo do material extra." }`;
- valid QR resolves the unit and calls `register_extra_serialized_material` once;
- valid bulk calls `register_extra_bulk_material` with integer quantity and nullable variant;
- RPC stable codes map to the Portuguese messages from Task 1.

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- tests/scan.actions.test.ts`

Expected: FAIL because the two exports do not exist.

- [ ] **Step 3: Implement shared authorization**

Add a private helper that calls `getCurrentUserContext`, requires role `warehouse`, checks `primaryOrganization.id`, resolves `getTeamMemberByUserId`, and calls `teamMemberHasEventAccess`. Do not rely on the admin client for authorization.

- [ ] **Step 4: Implement actions and error translation**

Normalize strings with `trim()`, reject `qty` unless `Number.isSafeInteger(qty) && qty > 0`, resolve QR with `getEquipmentUnitByQrCode`, call the exact RPC signatures from Task 1, revalidate `/scan/load/${eventId}`, `/scan/return/${eventId}`, and `/events/${eventId}`, and return IDs/counts from the single RPC row.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/scan.actions.test.ts`

Expected: PASS.

```bash
git add 'src/app/(dashboard)/scan/actions.ts' tests/scan.actions.test.ts
git commit -m "feat: authorize extra material registration"
```

---

### Task 4: Extra material panel behavior

**Files:**
- Create: `src/app/(dashboard)/scan/load/[eventId]/ExtraMaterialPanel.tsx`
- Create: `tests/ExtraMaterialPanel.test.tsx`

**Interfaces:**
- Consumes: `ExtraMaterialCandidate[]`, `ExtraMaterialLog[]`, both actions from Task 3.
- Produces: `ExtraMaterialPanel({ eventId, candidates, initialLog })`.

- [ ] **Step 1: Write failing component tests**

Use real component rendering and mock only server actions and `QrScanner`. Cover:

```ts
expect(screen.getByLabelText("Motivo do material extra")).toBeRequired();
expect(screen.getByPlaceholderText("Buscar material no estoque...")).toBeInTheDocument();
expect(screen.getByText("Cabo XLR · 10 m")).toBeInTheDocument();
expect(screen.getByText("Cliente pediu reforço")).toBeInTheDocument();
```

Submit with blank reason and assert the action is not called. Scan QR with a reason and assert `registerExtraSerializedMaterial("event-1", "QR-123", "Cliente pediu reforço")`. Submit bulk and assert exact object `{ eventId: "event-1", equipmentId: "eq-2", variantId: null, qty: 3, reason: "Reserva técnica" }`. On failure, assert the reason remains in the field.

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- tests/ExtraMaterialPanel.test.tsx`

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement the panel**

Use one required textarea for reason, `QrScanner` for serialized QR, a text filter over candidates, quantity input only for `bulk`, confirmation buttons disabled while busy, Sonner feedback, and a local audit list prepended after success. Format audit timestamp with `formatDateTimeBR`.

Do not clear the reason on failure. Clear quantity/selection after success; retain the reason so several scans caused by the same request can be performed efficiently.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/ExtraMaterialPanel.test.tsx`

Expected: PASS.

```bash
git add 'src/app/(dashboard)/scan/load/[eventId]/ExtraMaterialPanel.tsx' tests/ExtraMaterialPanel.test.tsx
git commit -m "feat: add extra material registration panel"
```

---

### Task 5: Warehouse-only third tab on load page

**Files:**
- Modify: `src/app/(dashboard)/scan/load/[eventId]/LoadScanClient.tsx`
- Modify: `src/app/(dashboard)/scan/load/[eventId]/page.tsx`
- Modify: `tests/LoadScanClient.test.tsx`
- Modify: `tests/page.scanLoad.test.tsx`

**Interfaces:**
- `LoadScanClient` gains `role: AppRole | null`, `extraCandidates: ExtraMaterialCandidate[]`, `initialExtraLog: ExtraMaterialLog[]`.

- [ ] **Step 1: Write failing visibility tests**

Render with each role and assert:

```ts
expect(screen.getByRole("button", { name: "Material a mais" })).toBeInTheDocument(); // warehouse
expect(screen.queryByRole("button", { name: "Material a mais" })).not.toBeInTheDocument(); // admin
```

Click the warehouse tab and assert the real `ExtraMaterialPanel` marker/content is displayed. Page test must assert candidate/log queries run only for `warehouse` and receive the current event and organization IDs.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/LoadScanClient.test.tsx tests/page.scanLoad.test.tsx`

Expected: FAIL because props/tab are absent.

- [ ] **Step 3: Implement tab composition**

Extend mode to `"load" | "unload" | "extra"`. Render a three-column selector only for warehouse and keep two columns for other roles. When mode is `extra`, hide the standard scanner/progress lists and render `ExtraMaterialPanel`.

On the server page, keep the existing assignment redirect, fetch candidate/log data only after warehouse access succeeds, and pass empty arrays for all other roles.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/LoadScanClient.test.tsx tests/page.scanLoad.test.tsx`

Expected: PASS.

```bash
git add 'src/app/(dashboard)/scan/load/[eventId]/LoadScanClient.tsx' 'src/app/(dashboard)/scan/load/[eventId]/page.tsx' tests/LoadScanClient.test.tsx tests/page.scanLoad.test.tsx
git commit -m "feat: show extra material tab to warehouse"
```

---

### Task 6: Bulk load/return progress and mandatory return

**Files:**
- Modify: `src/app/(dashboard)/scan/actions.ts`
- Modify: `src/app/(dashboard)/scan/return/[eventId]/ReturnScanClient.tsx`
- Modify: `src/app/(dashboard)/scan/return/[eventId]/page.tsx`
- Modify: `tests/scan.actions.test.ts`
- Modify: `tests/ReturnScanClient.test.tsx`
- Modify: `tests/page.scanReturn.test.tsx`

**Interfaces:**
- Produces: `manualReturnBulk(eventId: string, eventEquipmentId: string, qty: number): Promise<ScanResult>`.
- Produces: `manualUnreturnBulk(eventId: string, eventEquipmentId: string, qty: number): Promise<ScanResult>`.
- Return item gains `equipmentType: "serialized" | "bulk"`.

- [ ] **Step 1: Write failing bulk-return tests**

Action tests require warehouse/event access, positive integer deltas, and updates constrained by both `id` and `event_id`. Assert return cannot exceed `bulk_loaded_qty` and undo cannot make `bulk_returned_qty` negative.

Component fixture:

```ts
{
  id: "ee-bulk",
  equipmentName: "Cabo XLR",
  variantLabel: null,
  equipmentType: "bulk",
  loadedUnitsCount: 5,
  returnedUnitsCount: 0
}
```

Click `Bipar 1` and assert `manualReturnBulk("event-1", "ee-bulk", 1)`, updated `1/5`, and pending until `5/5`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/scan.actions.test.ts tests/ReturnScanClient.test.tsx tests/page.scanReturn.test.tsx`

Expected: FAIL because bulk actions/type dispatch are absent.

- [ ] **Step 3: Implement atomic bulk return actions**

Call the exact `return_bulk_material` and `unreturn_bulk_material` RPCs created in Task 1 after the same warehouse assignment validation. Translate `EXTRA_RETURN_RANGE` to `"Quantidade de devolução inválida."`, revalidate the return and event routes, and return the new aggregate count in `returnedUnitsCount`.

- [ ] **Step 4: Dispatch UI by equipment type**

Page maps aggregate counts supplied by `getEventById`. `ReturnScanClient.handleManual` calls serialized actions for `serialized` and bulk actions for `bulk`. QR defect flow remains serialized-only. Finalization uses combined counts and refuses completion while any loaded quantity remains unreturned.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/scan.actions.test.ts tests/ReturnScanClient.test.tsx tests/page.scanReturn.test.tsx`

Expected: PASS.

```bash
git add 'src/app/(dashboard)/scan/actions.ts' 'src/app/(dashboard)/scan/return/[eventId]/ReturnScanClient.tsx' 'src/app/(dashboard)/scan/return/[eventId]/page.tsx' tests/scan.actions.test.ts tests/ReturnScanClient.test.tsx tests/page.scanReturn.test.tsx
git commit -m "feat: require return of extra bulk material"
```

---

### Task 7: Cross-flow verification and documentation

**Files:**
- Modify: `supabase/README.md`
- Modify: `README.md`
- Test: all affected and full suites.

**Interfaces:**
- Consumes all prior tasks; produces a documented deploy/migration sequence.

- [ ] **Step 1: Run focused regression suite**

Run:

```bash
npm test -- \
  tests/extra-material.migration.test.ts \
  tests/extra-material.lib.test.ts \
  tests/events.lib.test.ts \
  tests/scan.actions.test.ts \
  tests/ExtraMaterialPanel.test.tsx \
  tests/LoadScanClient.test.tsx \
  tests/ReturnScanClient.test.tsx \
  tests/page.scanLoad.test.tsx \
  tests/page.scanReturn.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run lint and full suite**

Run: `npm run lint`

Expected: no new errors in changed files; if global pre-existing lint errors remain, record their exact paths without modifying unrelated code.

Run: `npm test`

Expected: all tests PASS with only explicitly skipped tests skipped.

- [ ] **Step 3: Apply migration in a controlled Supabase environment**

Run the project's established Supabase migration command after confirming the target project. Verify columns, RPC grants, RLS, and a transaction rollback using a non-production OS. Do not apply to production without explicit authorization.

- [ ] **Step 4: Perform manual acceptance**

As assigned `warehouse`: add one serialized QR and one bulk quantity with reasons, confirm both appear in the OS and return page, return both, and complete the OS. As `admin`: confirm the third tab is absent. As unassigned `warehouse`: confirm direct route/action is rejected.

- [ ] **Step 5: Document operations and commit**

Add migration order, accepted OS states, warehouse-only rule, reason/audit behavior, and rollback guidance to the two README files.

```bash
git add README.md supabase/README.md
git commit -m "docs: document extra material workflow"
```

- [ ] **Step 6: Final verification evidence**

Run: `git status --short`

Expected: empty output.

Run: `git log --oneline -7`

Expected: the task commits appear in order with no unrelated changes.
