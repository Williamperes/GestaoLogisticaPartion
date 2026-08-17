# Public Employee Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate employee portal to `/login` where employees freely create accounts and sign in, receiving immediate access as `employee` only to Eventos/OS and Manutenção.

**Architecture:** Keep `/login` as a React Server Component driven by `portal` and `mode` query parameters, with three distinct server actions for internal sign-in, employee sign-in, and employee registration. Centralize primary-role lookup in the auth session library and keep the fixed Partion organization UUID in a server-only environment getter. Registration uses the Supabase admin client for user/membership creation, compensates a failed membership insert by deleting the new Auth user, then establishes a normal cookie session.

**Tech Stack:** Next.js 16.2 App Router and Server Actions, React 19.2, TypeScript 5, Supabase Auth/Postgres, Tailwind CSS 4, Vitest 4, Testing Library.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/02-guides/authentication.md`, `node_modules/next/dist/docs/01-app/02-guides/forms.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md` before changing Next.js code.
- `EMPLOYEE_ORGANIZATION_ID` is server-only, contains the Partion organization UUID, and must never use a `NEXT_PUBLIC_` prefix.
- Public registration always assigns `role = "employee"`; no client-submitted role or organization is accepted.
- Employee accounts are accepted only in the Funcionários portal; every other role is accepted only in Equipe interna.
- Employees redirect to `/events`; existing role destinations remain unchanged.
- Passwords must never appear in URLs, logs, or error messages.
- The accepted public-registration risk remains unchanged: no approval, invitation, company code, domain restriction, CAPTCHA, or rate limit is added.
- Preserve unrelated working-tree changes, including `proposta.md` and `.claude/`.

## File Structure

- Modify `src/lib/env.ts`: expose the isolated server-only organization UUID getter.
- Modify `src/lib/auth/session.ts`: expose one primary-role query reused by portal checks and default-route selection.
- Modify `src/app/(auth)/actions.ts`: implement portal-aware sign-ins and public employee registration.
- Modify `src/app/(auth)/login/page.tsx`: render the single-card tabbed experience and role-aware existing-session redirect.
- Modify `tests/env.test.ts`, `tests/session.lib.test.ts`, `tests/login.actions.test.ts`, and `tests/page.login.test.tsx`: cover every new boundary and regression requirement.

---

### Task 1: Server-only employee organization configuration

**Files:**
- Modify: `src/lib/env.ts`
- Test: `tests/env.test.ts`

**Interfaces:**
- Produces: `getEmployeeOrganizationId(): string`, returning a validated UUID or throwing an internal configuration error.
- Consumes: only `process.env.EMPLOYEE_ORGANIZATION_ID`; it must not alter `getSupabasePublicEnv()` or `getSupabaseServerEnv()`.

- [ ] **Step 1: Add failing environment tests**

Add tests that reload the module and prove valid, missing, and malformed values:

```ts
describe("getEmployeeOrganizationId", () => {
  it("returns a valid organization UUID", async () => {
    const { getEmployeeOrganizationId } = await loadEnv({
      EMPLOYEE_ORGANIZATION_ID: "11111111-1111-4111-8111-111111111111",
    });
    expect(getEmployeeOrganizationId()).toBe("11111111-1111-4111-8111-111111111111");
  });

  it.each([undefined, "not-a-uuid"])("rejects missing or invalid values", async (value) => {
    const { getEmployeeOrganizationId } = await loadEnv({ EMPLOYEE_ORGANIZATION_ID: value });
    expect(() => getEmployeeOrganizationId()).toThrow(/EMPLOYEE_ORGANIZATION_ID/);
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- tests/env.test.ts`

Expected: FAIL because `getEmployeeOrganizationId` is not exported.

- [ ] **Step 3: Implement the isolated getter**

In `src/lib/env.ts`, capture the value independently from the existing Supabase settings and validate it with an anchored UUID expression:

```ts
const employeeOrganizationId = process.env.EMPLOYEE_ORGANIZATION_ID;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getEmployeeOrganizationId(): string {
  if (!employeeOrganizationId || !UUID_PATTERN.test(employeeOrganizationId)) {
    throw new Error("Missing or invalid EMPLOYEE_ORGANIZATION_ID");
  }
  return employeeOrganizationId;
}
```

- [ ] **Step 4: Verify the focused tests pass**

Run: `npm test -- tests/env.test.ts`

Expected: all environment tests PASS, including existing Supabase getters without the new variable.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts tests/env.test.ts
git commit -m "feat: validate employee organization config"
```

### Task 2: Reusable primary-role lookup

**Files:**
- Modify: `src/lib/auth/session.ts`
- Test: `tests/session.lib.test.ts`

**Interfaces:**
- Produces: `getPrimaryAppRoleForUser(userId: string): Promise<AppRole | null>`.
- Updates: `getDefaultAppPathForUser(userId: string): Promise<string>` to call the new helper.

- [ ] **Step 1: Add failing role-helper tests**

Extend the session tests to import `getPrimaryAppRoleForUser` and cover role, absent membership, and database error:

```ts
expect(await getPrimaryAppRoleForUser("u-1")).toBe("employee");
expect(await getPrimaryAppRoleForUser("u-2")).toBeNull();
await expect(getPrimaryAppRoleForUser("u-3")).rejects.toThrow("db fail");
```

Keep the existing default-path cases, which prove `/client`, `/scan`, `/events`, and `/dashboard` are preserved.

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- tests/session.lib.test.ts`

Expected: FAIL because `getPrimaryAppRoleForUser` does not exist.

- [ ] **Step 3: Extract the primary-role query**

Implement the helper with the existing admin query, then map the role in the route function:

```ts
export async function getPrimaryAppRoleForUser(userId: string): Promise<AppRole | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("organization_members")
    .select("role, is_primary")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

export async function getDefaultAppPathForUser(userId: string) {
  const role = await getPrimaryAppRoleForUser(userId);
  if (role === "client") return "/client";
  if (role === "warehouse") return "/scan";
  if (role === "employee") return "/events";
  return "/dashboard";
}
```

- [ ] **Step 4: Verify session behavior**

Run: `npm test -- tests/session.lib.test.ts`

Expected: all session tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts tests/session.lib.test.ts
git commit -m "refactor: expose primary app role lookup"
```

### Task 3: Portal-specific sign-in actions

**Files:**
- Modify: `src/app/(auth)/actions.ts`
- Test: `tests/login.actions.test.ts`

**Interfaces:**
- Preserves: `signInWithPassword(formData: FormData): Promise<never>` for Equipe interna.
- Produces: `signInEmployeeWithPassword(formData: FormData): Promise<never>` for Funcionários.
- Consumes: `getPrimaryAppRoleForUser()` and `getDefaultAppPathForUser()` from Task 2.

- [ ] **Step 1: Add failing portal-boundary tests**

Mock both session helpers. Add cases proving:

```ts
// Internal portal rejects employee and clears the cookie session.
expect(signOutMock).toHaveBeenCalledOnce();
expectRedirect("/login?portal=employee&error=Use%20o%20acesso%20de%20Funcionarios.");

// Employee portal accepts employee only.
expect(mocks.getPrimaryAppRoleForUser).toHaveBeenCalledWith("employee-1");
expectRedirect("/events");

// Employee portal rejects admin and clears the cookie session.
expect(signOutMock).toHaveBeenCalledOnce();
expectRedirect("/login?portal=internal&error=Use%20o%20acesso%20da%20Equipe%20interna.");
```

Also assert missing credentials and Supabase authentication errors return to the portal that submitted the form.

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- tests/login.actions.test.ts`

Expected: FAIL because employee sign-in and portal role checks are absent.

- [ ] **Step 3: Implement shared sign-in mechanics and strict portal checks**

Add a private helper whose portal determines the safe error URL. Normalize email to lowercase, authenticate, query the primary role, sign out on a role mismatch, and redirect:

```ts
type LoginPortal = "internal" | "employee";

async function signInForPortal(formData: FormData, portal: LoginPortal) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const returnPath = portal === "employee" ? "/login?portal=employee" : "/login?portal=internal";

  if (!email || !password) {
    redirect(`${returnPath}&error=${encodeURIComponent("Preencha email e senha.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    redirect(`${returnPath}&error=${encodeURIComponent(error?.message ?? "Nao foi possivel entrar.")}`);
  }

  const role = await getPrimaryAppRoleForUser(data.user.id);
  const isEmployee = role === "employee";
  if (portal === "employee" && !isEmployee) {
    await supabase.auth.signOut();
    redirect(`/login?portal=internal&error=${encodeURIComponent("Use o acesso da Equipe interna.")}`);
  }
  if (portal === "internal" && isEmployee) {
    await supabase.auth.signOut();
    redirect(`/login?portal=employee&error=${encodeURIComponent("Use o acesso de Funcionarios.")}`);
  }

  redirect(portal === "employee" ? "/events" : await getDefaultAppPathForUser(data.user.id));
}

export async function signInWithPassword(formData: FormData) {
  return signInForPortal(formData, "internal");
}

export async function signInEmployeeWithPassword(formData: FormData) {
  return signInForPortal(formData, "employee");
}
```

Do not include the password in any constructed URL or thrown message.

- [ ] **Step 4: Verify all login-action tests pass**

Run: `npm test -- tests/login.actions.test.ts`

Expected: all portal and existing sign-out tests PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(auth)/actions.ts' tests/login.actions.test.ts
git commit -m "feat: separate employee and internal sign in"
```

### Task 4: Transactionally safe public employee registration

**Files:**
- Modify: `src/app/(auth)/actions.ts`
- Test: `tests/login.actions.test.ts`

**Interfaces:**
- Produces: `registerEmployee(formData: FormData): Promise<never>`.
- Consumes: `getEmployeeOrganizationId()`, `createSupabaseAdminClient()`, and `createSupabaseServerClient()`.

- [ ] **Step 1: Add failing validation tests**

Use table-driven tests for blank full name, malformed email, password shorter than eight characters, and different confirmation. For every case assert neither Supabase client is created and the redirect retains `portal=employee&mode=register`.

```ts
expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
expect(redirectUrl).not.toContain("password");
```

Add a form field such as `role=admin` in the valid scenario and assert the persisted role is still exactly `employee`.

- [ ] **Step 2: Add failing orchestration and compensation tests**

Cover these exact branches with explicit Supabase mocks:

```ts
// Invalid/missing configuration -> generic unavailable message, no createUser.
// Organization missing, inactive, or query error -> generic unavailable message.
// createUser duplicate/error -> registration mode with a safe message.
// membership insert error -> auth.admin.deleteUser(createdId), no normal sign-in.
// success -> createUser(email_confirm: true, user_metadata.full_name), employee membership,
//            normal signInWithPassword, redirect /events.
// final sign-in error -> do not delete user; redirect employee login with account-created guidance.
```

- [ ] **Step 3: Verify registration tests fail**

Run: `npm test -- tests/login.actions.test.ts`

Expected: FAIL because `registerEmployee` is not exported.

- [ ] **Step 4: Implement server validation**

At the beginning of `registerEmployee`, extract only the four allowed fields and validate before creating clients:

```ts
const fullName = String(formData.get("full_name") ?? "").trim();
const email = String(formData.get("email") ?? "").trim().toLowerCase();
const password = String(formData.get("password") ?? "");
const passwordConfirmation = String(formData.get("password_confirmation") ?? "");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

Redirect validation failures to `/login?portal=employee&mode=register&error=<encoded Portuguese message>`. Resolve `getEmployeeOrganizationId()` inside `try/catch` and map its internal error to `Cadastro temporariamente indisponivel.`.

- [ ] **Step 5: Implement organization verification and compensated creation**

Use the admin client to select `id, is_active` by the configured UUID. Only after an active row is returned, execute:

```ts
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});

const { error: membershipError } = await admin.from("organization_members").insert({
  user_id: created.user.id,
  organization_id: organizationId,
  role: "employee",
  is_primary: true,
});

if (membershipError) {
  await admin.auth.admin.deleteUser(created.user.id);
  redirect(registrationError("Nao foi possivel concluir o cadastro."));
}
```

Ignore every unrecognized `FormData` entry. After membership succeeds, sign in through the normal server client. On success redirect `/events`; on failure preserve the account and redirect to employee login with `Conta criada. Entre com seu email e senha.`.

- [ ] **Step 6: Verify registration and login actions**

Run: `npm test -- tests/login.actions.test.ts`

Expected: all validation, compensation, success, role-boundary, and sign-out tests PASS.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(auth)/actions.ts' tests/login.actions.test.ts
git commit -m "feat: add public employee registration"
```

### Task 5: Single-card tabbed login interface

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Test: `tests/page.login.test.tsx`

**Interfaces:**
- Consumes: `signInWithPassword`, `signInEmployeeWithPassword`, `registerEmployee`, and `getDefaultAppPathForUser`.
- Query contract: `portal=internal|employee`, `mode=login|register`, and an optional encoded `error`.

- [ ] **Step 1: Add failing UI tests**

Mock all three actions and the role-aware default-route helper. Test:

```ts
// Default: both tab links visible, internal form active, internal action assigned.
// portal=employee: employee heading and login form/action visible.
// portal=employee&mode=register: full_name, email, password,
// password_confirmation inputs and Criar conta button visible; no role/org input.
// Error text appears in the selected portal/mode.
// Existing employee context redirects /events; existing admin redirects /dashboard.
```

Use accessible roles and labels so the tests also protect keyboard/screen-reader discoverability.

- [ ] **Step 2: Verify the UI tests fail**

Run: `npm test -- tests/page.login.test.tsx`

Expected: FAIL because the employee tab, registration mode, and role-aware redirect are absent.

- [ ] **Step 3: Implement role-aware existing-session redirect**

Replace the hard-coded authenticated redirect with:

```ts
if (context) {
  redirect(await getDefaultAppPathForUser(context.userId));
}
```

Normalize unknown or array query values to the safe defaults `internal` and `login`.

- [ ] **Step 4: Implement the responsive tabs and forms**

Keep one `Card`. Add horizontal links at its top:

```tsx
<Link href="/login?portal=internal" aria-current={portal === "internal" ? "page" : undefined}>
  Equipe interna
</Link>
<Link href="/login?portal=employee" aria-current={portal === "employee" ? "page" : undefined}>
  Funcionários
</Link>
```

Render the current two-field form with `signInWithPassword` for internal users. In the employee portal, render the same login fields with `signInEmployeeWithPassword` and a link to `?portal=employee&mode=register`. In registration mode render labeled `full_name`, `email`, `password`, and `password_confirmation` fields with `required`, `type="email"`, and `minLength={8}`, submit to `registerEmployee`, and link back to employee login. Do not render role or organization controls.

Preserve the existing centered `max-w-sm` card, rounded borders, full-width inputs/buttons, and mobile padding. Change the page subtitle to neutral copy suitable for both portals, such as `Acesso à plataforma Partion`.

- [ ] **Step 5: Verify UI and action suites together**

Run: `npm test -- tests/page.login.test.tsx tests/login.actions.test.ts`

Expected: all login UI and action tests PASS.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(auth)/login/page.tsx' tests/page.login.test.tsx
git commit -m "feat: add employee login and signup tabs"
```

### Task 6: Regression and production verification

**Files:**
- Modify only files required by failures directly caused by Tasks 1–5.

**Interfaces:**
- Verifies the complete public employee authentication feature and preserves the existing application behavior.

- [ ] **Step 1: Run focused authentication tests**

Run: `npm test -- tests/env.test.ts tests/session.lib.test.ts tests/login.actions.test.ts tests/page.login.test.tsx`

Expected: all focused tests PASS.

- [ ] **Step 2: Run static checks**

Run: `npm run lint`

Expected: exit code 0 with no new lint errors.

- [ ] **Step 3: Run the complete suite**

Run: `npm test`

Expected: exit code 0 and no regressions.

- [ ] **Step 4: Build the production application**

Run with valid server configuration: `$env:EMPLOYEE_ORGANIZATION_ID='11111111-1111-4111-8111-111111111111'; npm run build`

Expected: Next.js production build completes successfully.

- [ ] **Step 5: Inspect the final patch**

Run: `git diff --check` and `git status --short`

Expected: no whitespace errors; only the planned feature files plus the user's pre-existing unrelated changes are present.

- [ ] **Step 6: Commit any verification-only corrections**

If and only if Task 6 required corrections, stage only those planned files and commit:

```bash
git add src/lib/env.ts src/lib/auth/session.ts 'src/app/(auth)/actions.ts' 'src/app/(auth)/login/page.tsx' tests/env.test.ts tests/session.lib.test.ts tests/login.actions.test.ts tests/page.login.test.tsx
git commit -m "fix: complete employee authentication verification"
```
