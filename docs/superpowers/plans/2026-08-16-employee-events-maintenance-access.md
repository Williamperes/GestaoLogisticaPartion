# Employee Events and Maintenance Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a “Funcionário” access profile that can create and edit Eventos/OS and resolve Manutenção records, while all other application areas remain inaccessible.

**Architecture:** Add `employee` as a first-class application/database role and grant capabilities explicitly at navigation, React Server Component, Server Action, and Supabase RLS boundaries. Keep destructive event deletion admin-only, route employees to `/events`, and harden maintenance resolution with organization-scoped reads and writes because the action uses the Supabase admin client.

**Tech Stack:** Next.js 16.2.1 App Router, React 19.2.4, TypeScript 5, Supabase/PostgreSQL RLS, Vitest 4.1.4, Testing Library.

## Global Constraints

- The role identifier is exactly `employee`; the user-facing label is exactly `Funcionário — Eventos/OS e Manutenção`.
- Employee access includes only Eventos & OS and Manutenção.
- Employee may create and edit Eventos/OS, but may not delete an Evento/OS.
- Employee may list and resolve maintenance belonging to their primary organization.
- Existing roles retain their current behavior; do not migrate existing users automatically.
- UI visibility is not authorization: every admin-client mutation must validate role and organization on the server.
- Follow the installed Next.js 16 documentation in `node_modules/next/dist/docs/01-app/02-guides/authentication.md`, `forms.md`, and `03-api-reference/04-functions/redirect.md`; authorization belongs inside each Server Action as well as at page boundaries.
- Preserve unrelated worktree changes (`proposta.md` and `.claude/`) and stage only task-owned files.

---

### Task 1: Database role and row-level policies

**Files:**
- Create: `supabase/migrations/20260816_000024_employee_events_maintenance_access.sql`
- Create: `tests/employee-access.migration.test.ts`

**Interfaces:**
- Consumes: `public.app_role`, `public.has_org_role(uuid, public.app_role[])`, and existing policy names from migrations 007, 012, 014, 015, and 020.
- Produces: database enum value `employee` plus organization-scoped RLS access for event editing and maintenance resolution.

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260816_000024_employee_events_maintenance_access.sql",
  "utf8"
);

describe("employee access migration", () => {
  it("adds employee to app_role before policies use it", () => {
    const enumChange = sql.indexOf("alter type public.app_role add value if not exists 'employee'");
    const firstPolicy = sql.indexOf("alter policy");
    expect(enumChange).toBeGreaterThanOrEqual(0);
    expect(firstPolicy).toBeGreaterThan(enumChange);
  });

  it.each([
    "events_insert", "events_update",
    "event_checklist_items_insert", "event_checklist_items_update",
    "event_equipment_insert", "event_equipment_update", "event_equipment_delete",
    "event_dates_insert", "event_dates_update", "event_dates_delete",
    "event_date_team_members_insert", "event_date_team_members_update", "event_date_team_members_delete",
    "event_speakers_insert", "event_speakers_update", "event_speakers_delete",
    "event_extras_insert", "event_extras_update", "event_extras_delete",
    "equipment_maintenance_update",
  ])("alters %s to include employee", (policy) => {
    expect(sql).toContain(`alter policy "${policy}"`);
  });

  it("does not grant employee event deletion", () => {
    expect(sql).not.toContain('alter policy "events_delete"');
  });
});
```

- [ ] **Step 2: Run the contract test and confirm the migration is missing**

Run: `npm test -- tests/employee-access.migration.test.ts`

Expected: FAIL because `20260816_000024_employee_events_maintenance_access.sql` does not exist.

- [ ] **Step 3: Create the migration with explicit policy changes**

Start the migration with:

```sql
alter type public.app_role add value if not exists 'employee';

alter policy "events_insert" on public.events
with check ((select public.has_org_role(
  organization_id,
  array['super_admin'::public.app_role, 'admin'::public.app_role,
        'operations'::public.app_role, 'employee'::public.app_role]
)));

alter policy "events_update" on public.events
using ((select public.has_org_role(
  organization_id,
  array['super_admin'::public.app_role, 'admin'::public.app_role,
        'operations'::public.app_role, 'employee'::public.app_role]
)))
with check ((select public.has_org_role(
  organization_id,
  array['super_admin'::public.app_role, 'admin'::public.app_role,
        'operations'::public.app_role, 'employee'::public.app_role]
)));
```

For event-owned tables, alter every policy named in Step 1 using its existing `exists (...)` join and add `'employee'::public.app_role` beside `operations`. Preserve the current `warehouse` allowance where present. Include both `using` and `with check` on update policies so rows cannot be moved across organizations. Do not alter `events_delete`, template-management policies, inventory policies, or subrental policies.

Alter maintenance update explicitly:

```sql
alter policy "equipment_maintenance_update" on public.equipment_maintenance
using ((select public.has_org_role(
  organization_id,
  array['super_admin'::public.app_role, 'admin'::public.app_role,
        'operations'::public.app_role, 'warehouse'::public.app_role,
        'employee'::public.app_role]
)))
with check ((select public.has_org_role(
  organization_id,
  array['super_admin'::public.app_role, 'admin'::public.app_role,
        'operations'::public.app_role, 'warehouse'::public.app_role,
        'employee'::public.app_role]
)));
```

- [ ] **Step 4: Run the migration contract test**

Run: `npm test -- tests/employee-access.migration.test.ts`

Expected: PASS for enum ordering, every named policy, and the `events_delete` exclusion.

- [ ] **Step 5: Commit the database authorization foundation**

```bash
git add supabase/migrations/20260816_000024_employee_events_maintenance_access.sql tests/employee-access.migration.test.ts
git commit -m "feat: add employee database access policies"
```

---

### Task 2: Application role, landing route, navigation, and page gates

**Files:**
- Modify: `src/lib/auth/roles.ts`
- Modify: `src/lib/auth/session.ts`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/app/(dashboard)/events/page.tsx`
- Modify: `src/app/(dashboard)/events/[id]/page.tsx`
- Modify: `src/app/(dashboard)/maintenance/page.tsx`
- Modify: `tests/auth.roles.test.ts`
- Modify: `tests/session.lib.test.ts`
- Modify: `tests/Sidebar.test.tsx`
- Modify: `tests/page.dashboard.test.tsx`
- Modify: `tests/page.events.test.tsx`
- Modify: `tests/page.event-detail.test.tsx`
- Create: `tests/page.maintenance.test.tsx`

**Interfaces:**
- Consumes: database role string `employee` from Task 1.
- Produces: `AppRole` including `employee`, `getDefaultAppPathForUser()` returning `/events`, and page-level employee capability flags.

- [ ] **Step 1: Add failing role, route, and menu tests**

Add assertions equivalent to:

```ts
expect(APP_ROLES).toContain("employee");
expect(canAccessArea("employee", "operations")).toBe(false);
```

```tsx
render(<Sidebar userName="Funcionário" userRole="Funcionário" role="employee" />);
expect(screen.getByText("Eventos & OS")).toBeInTheDocument();
expect(screen.getByText("Manutenção")).toBeInTheDocument();
for (const hidden of ["Dashboard", "Bipar OS", "Inventário", "Clientes", "Equipe", "Sublocações", "Configurações"]) {
  expect(screen.queryByText(hidden)).not.toBeInTheDocument();
}
```

In `session.lib.test.ts`, mock a primary `{ role: "employee" }` membership and expect `getDefaultAppPathForUser("u1")` to resolve to `/events`. In the page tests, set the mocked context role to `employee` and assert Events renders its creation control, event detail renders edit/checklist controls but not the delete control, Maintenance renders, and Dashboard throws `REDIRECT:/events`.

- [ ] **Step 2: Run the focused tests and verify the new role is rejected or hidden**

Run: `npm test -- tests/auth.roles.test.ts tests/session.lib.test.ts tests/Sidebar.test.tsx tests/page.dashboard.test.tsx tests/page.events.test.tsx tests/page.event-detail.test.tsx tests/page.maintenance.test.tsx`

Expected: FAIL because `employee` is not an `AppRole`, has no landing route, and has no navigation/page permissions.

- [ ] **Step 3: Add the role and default destination**

In `roles.ts`, append `"employee"` to `APP_ROLES`. Do not add it to the broad `operations`, `warehouse`, `admin`, or `client` areas; its two capabilities stay resource-specific.

In `getDefaultAppPathForUser` add:

```ts
if (data?.role === "employee") return "/events";
```

In the Dashboard page add:

```ts
if (context?.role === "employee") redirect("/events");
```

- [ ] **Step 4: Add resource-specific navigation and page flags**

Add `employee` only to the role arrays used by the two links:

```ts
const EVENTS_ROLES: readonly NavRole[] = ["super_admin", "admin", "operations", "finance", "employee"];
const MAINTENANCE_ROLES: readonly NavRole[] = ["super_admin", "admin", "operations", "warehouse", "employee"];
```

Use `EVENTS_ROLES` for `/events`, `MAINTENANCE_ROLES` for `/maintenance`, and leave every other nav item unchanged. Add `employee` to Maintenance page’s allowed roles; add it to `canCreate`, `canManageChecklist`, and `canPromote` on the Events pages. Keep `canDelete` exactly `super_admin | admin`.

- [ ] **Step 5: Run the focused tests**

Run the command from Step 2.

Expected: PASS; the employee sees exactly two menu items, lands on Events, and receives the intended page controls.

- [ ] **Step 6: Commit application routing and navigation**

```bash
git add src/lib/auth/roles.ts src/lib/auth/session.ts src/components/layout/Sidebar.tsx src/app/(dashboard)/dashboard/page.tsx src/app/(dashboard)/events/page.tsx src/app/(dashboard)/events/[id]/page.tsx src/app/(dashboard)/maintenance/page.tsx tests/auth.roles.test.ts tests/session.lib.test.ts tests/Sidebar.test.tsx tests/page.dashboard.test.tsx tests/page.events.test.tsx tests/page.event-detail.test.tsx tests/page.maintenance.test.tsx
git commit -m "feat: route employee to events and maintenance"
```

---

### Task 3: Provision the new access profile from Equipe

**Files:**
- Modify: `src/app/(dashboard)/team/actions.ts`
- Modify: `src/app/(dashboard)/team/TeamToolbar.tsx`
- Modify: `src/app/(dashboard)/team/TeamMemberCard.tsx`
- Modify: `tests/team.actions.test.ts`
- Modify: `tests/TeamToolbar.test.tsx`
- Modify: `tests/TeamMemberCard.test.tsx`

**Interfaces:**
- Consumes: `AppRole` value `employee` from Task 2.
- Produces: both provisioning actions accepting `access_role=employee` and both forms presenting the exact approved label.

- [ ] **Step 1: Write failing UI and action tests**

In each component test, open the access form and assert:

```ts
expect(screen.getByRole("option", {
  name: "Funcionário — Eventos/OS e Manutenção",
})).toHaveValue("employee");
```

Add action tests for both `createTeamMember` with `provision_access=on` and `provisionTeamMemberAccess`. Submit `access_role=employee`, then assert the `organization_members` insert receives:

```ts
expect.objectContaining({ role: "employee", organization_id: "org-1", is_primary: true })
```

Retain one invalid-role test proving `access_role=admin` redirects with `Permissão de acesso inválida.`

- [ ] **Step 2: Run provisioning tests and confirm failure**

Run: `npm test -- tests/team.actions.test.ts tests/TeamToolbar.test.tsx tests/TeamMemberCard.test.tsx`

Expected: FAIL because the option and allowed role are absent.

- [ ] **Step 3: Extend the closed provisioning allowlist and both selects**

Use a typed allowlist:

```ts
const ACCESS_ROLES = new Set(["warehouse", "operations", "employee"] as const);
type AccessRole = "warehouse" | "operations" | "employee";
```

Add this option to both components:

```tsx
<option value="employee">Funcionário — Eventos/OS e Manutenção</option>
```

Do not add `employee` to `ensureTeamPermission` or `ensureProvisioningPermission`; employees cannot open Equipe or create users.

- [ ] **Step 4: Run provisioning tests**

Run the command from Step 2.

Expected: PASS for both forms, both actions, and invalid-role rejection.

- [ ] **Step 5: Commit access provisioning**

```bash
git add src/app/(dashboard)/team/actions.ts src/app/(dashboard)/team/TeamToolbar.tsx src/app/(dashboard)/team/TeamMemberCard.tsx tests/team.actions.test.ts tests/TeamToolbar.test.tsx tests/TeamMemberCard.test.tsx
git commit -m "feat: provision employee access from team"
```

---

### Task 4: Authorize employee Event/OS mutations without event deletion

**Files:**
- Modify: `src/app/(dashboard)/events/actions.ts`
- Modify: `tests/events.actions.test.ts`

**Interfaces:**
- Consumes: authenticated `UserContext.role: AppRole | null`.
- Produces: all functions guarded by `requireWriteRole()` and `requireChecklistRole()` accepting `employee`; `deleteEvent()` remains admin-only.

- [ ] **Step 1: Write a failing authorization matrix test**

Add an `EMPLOYEE_CONTEXT` fixture and table-driven tests covering one action from each guard plus deletion:

```ts
const EMPLOYEE_CONTEXT = {
  role: "employee",
  userId: "employee-1",
  primaryOrganization: { id: "org-1" },
};

it("allows employee to create events", async () => {
  mocks.getCurrentUserContext.mockResolvedValue(EMPLOYEE_CONTEXT);
  // Reuse the minimal successful events/event_checklist_items mock.
  await expect(createEvent(buildFormData({ name: "OS Funcionário", startDate: "2026-09-01" })))
    .rejects.toThrow("NEXT_REDIRECT:/events/event-1?success=Evento%20criado.");
});

it("keeps employee blocked from deleting an event", async () => {
  mocks.getCurrentUserContext.mockResolvedValue(EMPLOYEE_CONTEXT);
  await expect(deleteEvent(buildFormData({ eventId: "event-1" })))
    .rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
});
```

Also run existing successful fixtures with employee context for `updateEventDetails`, `toggleChecklistItem`, `setEventEquipmentBatch`, `addEventDate`, `addEventDateTeamMember`, `addEventSpeaker`, and `addEventExtra`. These representatives exercise every event-owned table; the shared guards cover the paired update/remove functions.

- [ ] **Step 2: Run event action tests and confirm employee writes fail**

Run: `npm test -- tests/events.actions.test.ts`

Expected: employee mutation cases FAIL at `requireWriteRole`/`requireChecklistRole`; deletion case already passes.

- [ ] **Step 3: Extend only the shared non-destructive guards**

```ts
const WRITE_ROLES = ["super_admin", "admin", "operations", "employee"] as const;
const CHECKLIST_ROLES = ["super_admin", "admin", "operations", "warehouse", "employee"] as const;
```

Do not change the explicit `['super_admin', 'admin']` check inside `deleteEvent`.

- [ ] **Step 4: Run all event action and page tests**

Run: `npm test -- tests/events.actions.test.ts tests/page.events.test.tsx tests/page.event-detail.test.tsx`

Expected: PASS, including employee create/edit and employee delete denial.

- [ ] **Step 5: Commit event authorization**

```bash
git add src/app/(dashboard)/events/actions.ts tests/events.actions.test.ts
git commit -m "feat: allow employee event editing"
```

---

### Task 5: Secure organization-scoped maintenance resolution

**Files:**
- Modify: `src/app/(dashboard)/maintenance/actions.ts`
- Create: `tests/maintenance.actions.test.ts`

**Interfaces:**
- Consumes: `getCurrentUserContext(): Promise<UserContext | null>` and admin Supabase query builder.
- Produces: `resolveMaintenance(id: string): Promise<ResolveResult>` authorized for `super_admin | admin | operations | warehouse | employee` and scoped to the primary organization.

- [ ] **Step 1: Write failing maintenance authorization tests**

Mock `getCurrentUserContext`, not `getCurrentAuthUser`. Cover:

```ts
it.each(["super_admin", "admin", "operations", "warehouse", "employee"])(
  "allows %s to resolve maintenance in its organization",
  async (role) => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role, userId: "u1", primaryOrganization: { id: "org-1" },
    });
    installMaintenanceChain({
      id: "m1", organization_id: "org-1", equipment_id: "eq1",
      equipment_unit_id: "unit1", status: "open",
    });
    await expect(resolveMaintenance("m1")).resolves.toEqual({ ok: true });
    expect(maintenanceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "resolved", resolved_by: "u1",
    }));
    expect(unitUpdate).toHaveBeenCalledWith({ status: "available" });
  }
);

it.each([null, "finance", "client"])("rejects role %s", async (role) => {
  mocks.getCurrentUserContext.mockResolvedValue(role ? {
    role, primaryOrganization: { id: "org-1" }, userId: "u1",
  } : null);
  await expect(resolveMaintenance("m1")).resolves.toEqual({
    ok: false,
    error: role ? "Sem permissão" : "Não autenticado",
  });
  expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
});

it("does not resolve a record from another organization", async () => {
  // The mocked `.eq("organization_id", "org-1")` chain returns null.
  await expect(resolveMaintenance("m-other")).resolves.toEqual({
    ok: false, error: "Ocorrência não encontrada",
  });
  expect(maintenanceUpdate).not.toHaveBeenCalled();
  expect(unitUpdate).not.toHaveBeenCalled();
});
```

Define `installMaintenanceChain(record)` in the test file as the Supabase fluent-chain mock that exposes the shared spies `maintenanceUpdate` and `unitUpdate`. Add assertions that the record lookup filters both `.eq("id", id)` and `.eq("organization_id", organizationId)`, the maintenance update repeats both filters, and the unit update filters `.eq("id", equipment_unit_id)` plus `.eq("equipment_id", equipment_id)`. This prevents cross-tenant mutation even under the admin client.

- [ ] **Step 2: Run the new action tests and confirm authorization/scoping failures**

Run: `npm test -- tests/maintenance.actions.test.ts`

Expected: FAIL because the action only checks authentication and does not scope record/update queries to the organization.

- [ ] **Step 3: Implement role and tenant validation**

Replace `getCurrentAuthUser` with `getCurrentUserContext` and add:

```ts
const MAINTENANCE_ROLES = [
  "super_admin", "admin", "operations", "warehouse", "employee",
] as const;

const context = await getCurrentUserContext();
if (!context) return { ok: false, error: "Não autenticado" };
if (!context.role || !MAINTENANCE_ROLES.includes(
  context.role as (typeof MAINTENANCE_ROLES)[number]
)) return { ok: false, error: "Sem permissão" };

const organizationId = context.primaryOrganization?.id;
if (!organizationId) return { ok: false, error: "Organização não encontrada" };
```

Select `id, organization_id, equipment_id, equipment_unit_id, status` with both ID and organization filters. Apply the same filters to the maintenance update and constrain the unit update by both unit ID and equipment ID. Set `resolved_by: context.userId`. Keep already-resolved records idempotent and revalidate `/maintenance` and `/inventory` after success.

- [ ] **Step 4: Run maintenance tests**

Run: `npm test -- tests/maintenance.actions.test.ts tests/page.maintenance.test.tsx`

Expected: PASS for the five allowed roles, denied roles, cross-organization denial, idempotency, update errors, and revalidation.

- [ ] **Step 5: Commit maintenance authorization hardening**

```bash
git add src/app/(dashboard)/maintenance/actions.ts tests/maintenance.actions.test.ts
git commit -m "fix: scope maintenance resolution by employee organization"
```

---

### Task 6: Full regression and acceptance verification

**Files:**
- Modify only if verification exposes a feature-owned defect: files already listed in Tasks 1–5.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–5.
- Produces: verified feature with no known role, navigation, event, maintenance, lint, or build regression.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all Vitest suites PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit code 0 with no new lint errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Next.js 16 production build exits 0 with all routes compiled.

- [ ] **Step 4: Inspect the final diff for scope and migration safety**

Run: `git diff --check HEAD~5..HEAD` and `git status --short`.

Expected: no whitespace errors; only feature files are in the five task commits; pre-existing `proposta.md` and `.claude/` state is unchanged.

- [ ] **Step 5: Perform the acceptance checklist against the spec**

Verify from tests and code that `employee` sees only Eventos & OS and Manutenção, can provision only through an administrator, can create/edit but not delete OS records, can resolve only its organization’s maintenance, lands on `/events`, and cannot gain Equipe, Inventário, Clientes, Sublocações, Scan, Dashboard, or Configurações permissions.

- [ ] **Step 6: Commit any verification-only fixes, if required**

If Steps 1–5 required no code changes, do not create an empty commit. If a feature-owned fix was needed:

```bash
git add src/lib/auth/roles.ts src/lib/auth/session.ts src/components/layout/Sidebar.tsx src/app/(dashboard)/dashboard/page.tsx src/app/(dashboard)/events src/app/(dashboard)/maintenance src/app/(dashboard)/team tests supabase/migrations/20260816_000024_employee_events_maintenance_access.sql
git commit -m "test: complete employee access verification"
```
