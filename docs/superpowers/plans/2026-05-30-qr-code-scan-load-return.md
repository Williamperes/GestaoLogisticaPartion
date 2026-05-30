# QR Code Scan — Load/Return Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o técnico bipe um QR code colado em cada unidade serializada para marcar carregamento (ida) e retorno (volta) de equipamentos em uma OS, atualizando estado e disponibilidade automaticamente.

**Architecture:**
- Empresa gera adesivos QR fora do app. Operador cadastra o `qr_code` de cada unidade no momento do cadastro (campo opcional no `InventorySheet`).
- Per-unit tracking via nova tabela `event_equipment_units` (FK para `event_equipment` + `equipment_units`) com `loaded_at` / `returned_at`. Mantém compatível com `event_equipment.qty` agregada existente.
- `event_equipment.returned_at` (timestamp único, derivado) é setado quando todas as units físicas vinculadas foram retornadas. Usado pelo `getEquipmentAvailability` para liberar capacidade.
- Scanner via `@zxing/browser` em rotas `/scan/load/[eventId]` e `/scan/return/[eventId]` (mobile/Safari/Chrome — sem PWA/offline na fase 1).
- Display do QR via `qrcode` (npm) renderiza SVG na página de detalhe do equipamento.

**Tech Stack:** Next.js 16.2.1, React 19, Supabase SSR, `@zxing/browser` (^0.1.5), `qrcode` (^1.5.4), Tailwind 4, shadcn/ui, vitest.

---

## File Structure

**Migrations (new):**
- `supabase/migrations/20260530_000015_event_equipment_units.sql` — Tabela `event_equipment_units` + coluna `event_equipment.returned_at` + index. RLS herdada via `event_equipment`.
- `supabase/migrations/20260530_000016_equipment_units_qr_unique.sql` — Índice único parcial em `equipment_units.qr_code` (somente onde `qr_code IS NOT NULL`).

**Lib (modify):**
- `src/lib/inventory.ts` — Função `getEquipmentUnitByQrCode(qrCode)` que resolve QR → unit (com equipment_id, organization_id, variant_id, status). Sem alterar shapes de equipment.
- `src/lib/events.ts` — Tipo `EventEquipmentUnit`, helper interno `recomputeReturnedAt(eventEquipmentId)`, atualização do select de `event_equipment` para incluir `returned_at`.
- `src/lib/inventory.ts` — Modificar query do `getEquipmentAvailability` para filtrar `event_equipment.returned_at IS NULL` (não conta linhas integralmente devolvidas).

**Server actions (new + modify):**
- `src/app/(dashboard)/scan/actions.ts` (novo) — `scanLoadUnit(eventId, qrCode)`, `scanReturnUnit(eventId, qrCode)`.
- `src/app/(dashboard)/inventory/actions.ts` — `createEquipment` recebe `qrCode` opcional (somente quando `type=serialized` e `!hasVariants`); nova action `setUnitQrCode(unitId, qrCode)` para vincular QR em unidade existente.

**UI (new):**
- `src/components/inventory/QrCodeDisplay.tsx` (novo) — Render server-side de QR SVG via `qrcode`. Props: `value: string`, `size?: number`.
- `src/components/inventory/QrScanner.tsx` (novo, client) — Câmera via `@zxing/browser`. Props: `onResult: (text: string) => void`, `onError?: (err: Error) => void`.
- `src/app/(dashboard)/scan/layout.tsx` (novo) — Layout simples mobile.
- `src/app/(dashboard)/scan/load/[eventId]/page.tsx` (novo) — Tela "Carregar OS X" — câmera + lista de equipamentos pendentes + contador "loaded / qty".
- `src/app/(dashboard)/scan/return/[eventId]/page.tsx` (novo) — Tela "Retornar OS X" — câmera + lista de equipamentos carregados pendentes de retorno.

**UI (modify):**
- `src/app/(dashboard)/inventory/InventorySheet.tsx` — Adicionar campo opcional `qrCode` no bloco "Identificação da unidade" (visível só com `type=serialized && !hasVariants`).
- `src/app/(dashboard)/inventory/[id]/page.tsx` — Exibir `<QrCodeDisplay>` ao lado de cada unidade serializada que tem `qr_code`; botão "Vincular QR" para units sem código.

**Tests (new + modify):**
- `tests/inventory.qrcode.test.ts` (novo) — `getEquipmentUnitByQrCode` resolve corretamente, retorna null para QR inexistente, escopo por org.
- `tests/scan.actions.test.ts` (novo) — `scanLoadUnit`/`scanReturnUnit` happy path, rejeita QR não-vinculado a OS, idempotência (rescan).
- `tests/inventory.availability.test.ts` (modify) — Cenário extra: OS com `event_equipment.returned_at` setado NÃO conta como alocado.

**Deps (modify):**
- `package.json` — adicionar `@zxing/browser` e `qrcode` em `dependencies`; `@types/qrcode` em `devDependencies`.

---

## Task 1: Migration `event_equipment_units` + `returned_at`

**Files:**
- Create: `supabase/migrations/20260530_000015_event_equipment_units.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 015: event_equipment_units (scan por unidade)
--
-- Permite rastrear, por unidade física (equipment_units), a hora em
-- que foi CARREGADA e RETORNADA para uma OS. event_equipment.qty
-- continua agregada; a tabela aqui é o detalhamento individual.
--
-- event_equipment.returned_at (novo, nullable) é cache: vira NOT NULL
-- quando todas as units vinculadas àquela row têm returned_at != NULL.
-- Usado pelo getEquipmentAvailability para liberar capacidade.
-- ──────────────────────────────────────────────────────────────────

create table public.event_equipment_units (
  id                   uuid primary key default gen_random_uuid(),
  event_equipment_id   uuid not null references public.event_equipment (id) on delete cascade,
  equipment_unit_id    uuid not null references public.equipment_units (id) on delete restrict,
  loaded_at            timestamptz,
  loaded_by            uuid references auth.users (id) on delete set null,
  returned_at          timestamptz,
  returned_by          uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default timezone('utc', now()),
  updated_at           timestamptz not null default timezone('utc', now()),
  unique (event_equipment_id, equipment_unit_id)
);

create index event_equipment_units_event_equipment_id_idx
  on public.event_equipment_units (event_equipment_id);

create index event_equipment_units_equipment_unit_id_idx
  on public.event_equipment_units (equipment_unit_id);

create trigger event_equipment_units_set_updated_at
before update on public.event_equipment_units
for each row
execute function public.set_updated_at();

-- Cache derivado: returned_at na row agregada.
alter table public.event_equipment
  add column returned_at timestamptz;

create index event_equipment_returned_at_idx
  on public.event_equipment (returned_at)
  where returned_at is null;

-- ──────── RLS ────────
alter table public.event_equipment_units enable row level security;

create policy "event_equipment_units_select"
on public.event_equipment_units for select to authenticated
using (
  exists (
    select 1 from public.event_equipment ee
    join public.events e on e.id = ee.event_id
    where ee.id = event_equipment_id
      and (select public.is_member_of(e.organization_id))
  )
);

create policy "event_equipment_units_insert"
on public.event_equipment_units for insert to authenticated
with check (
  exists (
    select 1 from public.event_equipment ee
    join public.events e on e.id = ee.event_id
    where ee.id = event_equipment_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role]))
  )
);

create policy "event_equipment_units_update"
on public.event_equipment_units for update to authenticated
using (
  exists (
    select 1 from public.event_equipment ee
    join public.events e on e.id = ee.event_id
    where ee.id = event_equipment_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role]))
  )
);

create policy "event_equipment_units_delete"
on public.event_equipment_units for delete to authenticated
using (
  exists (
    select 1 from public.event_equipment ee
    join public.events e on e.id = ee.event_id
    where ee.id = event_equipment_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);
```

- [ ] **Step 2: Verificar schema local não quebrou**

Run: `ls supabase/migrations/20260530_000015_event_equipment_units.sql`
Expected: arquivo listado.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260530_000015_event_equipment_units.sql
git commit -m "feat(events): migration 015 — event_equipment_units + returned_at cache"
```

---

## Task 2: Migration unique parcial em `equipment_units.qr_code`

**Files:**
- Create: `supabase/migrations/20260530_000016_equipment_units_qr_unique.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 016: QR code único por unidade
--
-- equipment_units.qr_code existe desde a 006 mas sem constraint.
-- Para o scan funcionar, cada código precisa resolver a UMA unidade.
-- Índice único parcial: ignora rows com qr_code NULL.
-- ──────────────────────────────────────────────────────────────────

create unique index equipment_units_qr_code_uq
  on public.equipment_units (qr_code)
  where qr_code is not null;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260530_000016_equipment_units_qr_unique.sql
git commit -m "feat(inventory): migration 016 — unique partial index em equipment_units.qr_code"
```

---

## Task 3: Adicionar dependências

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar libs**

Run:
```bash
npm install @zxing/browser@^0.1.5 qrcode@^1.5.4
npm install -D @types/qrcode@^1.5.5
```

- [ ] **Step 2: Verificar instalação**

Run: `node -e "require('@zxing/browser'); require('qrcode'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add @zxing/browser + qrcode for QR scan workflow"
```

---

## Task 4: `getEquipmentUnitByQrCode` em `src/lib/inventory.ts`

**Files:**
- Modify: `src/lib/inventory.ts` (ao final do arquivo, depois da seção de availability)
- Create: `tests/inventory.qrcode.test.ts`

- [ ] **Step 1: Escrever teste falhando**

Arquivo: `tests/inventory.qrcode.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { getEquipmentUnitByQrCode } from "@/lib/inventory";

function fakeSupabase(unit: unknown) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: unit, error: null })),
        })),
      })),
    })),
  };
}

describe("getEquipmentUnitByQrCode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolve QR → unidade quando existe", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        id: "u1",
        equipment_id: "e1",
        variant_id: null,
        status: "available",
        equipment: { organization_id: "org1" },
      })
    );

    const result = await getEquipmentUnitByQrCode("QR-ABC");
    expect(result).toMatchObject({
      id: "u1",
      equipmentId: "e1",
      organizationId: "org1",
    });
  });

  it("retorna null quando QR não existe", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(fakeSupabase(null));
    const result = await getEquipmentUnitByQrCode("QR-MISSING");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `npm test -- tests/inventory.qrcode.test.ts`
Expected: FAIL — `getEquipmentUnitByQrCode is not a function` (ou similar).

- [ ] **Step 3: Implementar função**

Adicionar no final de `src/lib/inventory.ts`:

```ts
// ──────────────────────────────────────────────────────────────────
// QR Code resolution
// ──────────────────────────────────────────────────────────────────

export interface EquipmentUnitLookup {
  id: string;
  equipmentId: string;
  organizationId: string;
  variantId: string | null;
  status: EquipmentStatus;
}

export async function getEquipmentUnitByQrCode(
  qrCode: string
): Promise<EquipmentUnitLookup | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("equipment_units")
    .select(
      `id, equipment_id, variant_id, status,
       equipment (organization_id)`
    )
    .eq("qr_code", qrCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    equipment_id: string;
    variant_id: string | null;
    status: EquipmentStatus;
    equipment: { organization_id: string } | null;
  };

  if (!row.equipment) return null;
  return {
    id: row.id,
    equipmentId: row.equipment_id,
    organizationId: row.equipment.organization_id,
    variantId: row.variant_id,
    status: row.status,
  };
}
```

- [ ] **Step 4: Rodar teste — deve passar**

Run: `npm test -- tests/inventory.qrcode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory.ts tests/inventory.qrcode.test.ts
git commit -m "feat(inventory): getEquipmentUnitByQrCode resolve QR → unidade"
```

---

## Task 5: Tipo `EventEquipmentUnit` + `returned_at` em `events.ts`

**Files:**
- Modify: `src/lib/events.ts`

- [ ] **Step 1: Adicionar tipo e estender interface**

Localizar `EventEquipmentItem` (linha ~28-46) e adicionar:

```ts
export interface EventEquipmentUnit {
  id: string;
  eventEquipmentId: string;
  equipmentUnitId: string;
  loadedAt: string | null;
  loadedBy: string | null;
  returnedAt: string | null;
  returnedBy: string | null;
}

// dentro de EventEquipmentItem (depois de loadedBy):
//   returned: boolean;
//   returnedAt: string | null;
//   units?: EventEquipmentUnit[];
```

Aplicar edit ao interface `EventEquipmentItem`:

```ts
export interface EventEquipmentItem {
  id: string;
  eventId: string;
  equipmentId: string;
  equipmentName: string;
  variantId: string | null;
  variantLabel: string | null;
  unitId: string | null;
  unitSerial: string | null;
  unitStatus: string | null;
  qty: number;
  separated: boolean;
  separatedAt: string | null;
  separatedBy: string | null;
  loaded: boolean;
  loadedAt: string | null;
  loadedBy: string | null;
  returnedAt: string | null;
  loadedUnitsCount: number;
  returnedUnitsCount: number;
  notes: string | null;
}
```

- [ ] **Step 2: Atualizar select do `getEventDetail` (linha ~260 — bloco que faz `from("event_equipment")`)**

Localizar o select existente e adicionar `returned_at` na lista de colunas + subquery contando units:

```ts
const { data: equipmentRows, error: equipErr } = await supabase
  .from("event_equipment")
  .select(
    `id, event_id, equipment_id, variant_id, unit_id, qty,
     separated, separated_at, separated_by,
     loaded, loaded_at, loaded_by,
     returned_at, notes,
     equipment ( name ),
     equipment_variants ( label ),
     equipment_units ( serial, status ),
     event_equipment_units ( id, loaded_at, returned_at )`
  )
  .eq("event_id", eventId);
```

- [ ] **Step 3: Atualizar mapping para preencher novos campos**

Localizar o `.map` que constrói `EventEquipmentItem[]` (linha ~370) e ajustar:

```ts
return (equipmentRows ?? []).map((e) => {
  const eeUnits = (e.event_equipment_units as unknown as { loaded_at: string | null; returned_at: string | null }[]) ?? [];
  return {
    id: e.id,
    eventId: e.event_id,
    equipmentId: e.equipment_id,
    equipmentName: /* preservar lógica existente */,
    // ... (manter campos existentes)
    separated: e.separated,
    separatedAt: e.separated_at,
    separatedBy: e.separated_by,
    loaded: e.loaded,
    loadedAt: e.loaded_at,
    loadedBy: e.loaded_by,
    returnedAt: e.returned_at,
    loadedUnitsCount: eeUnits.filter((u) => u.loaded_at !== null).length,
    returnedUnitsCount: eeUnits.filter((u) => u.returned_at !== null).length,
    notes: e.notes,
  };
});
```

- [ ] **Step 4: Verificar TypeScript compila**

Run: `npx tsc --noEmit`
Expected: zero erros (ou apenas erros pré-existentes não relacionados — comparar com `git stash && npx tsc --noEmit && git stash pop`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/events.ts
git commit -m "feat(events): expor returned_at + contagens de event_equipment_units"
```

---

## Task 6: Availability filtra `returned_at IS NULL`

**Files:**
- Modify: `src/lib/inventory.ts:430-485` (bloco do `getEquipmentAvailability`)
- Modify: `tests/inventory.availability.test.ts`

- [ ] **Step 1: Adicionar teste novo**

Inserir no `tests/inventory.availability.test.ts`, dentro do `describe`:

```ts
it("não conta event_equipment com returned_at setado", async () => {
  const supabase = fakeSupabase({
    equipment: () => ({
      data: [
        {
          id: "eq-1",
          type: "serialized",
          has_variants: false,
          equipment_units: [
            { id: "u1", variant_id: null, status: "available" },
            { id: "u2", variant_id: null, status: "available" },
          ],
          bulk_inventory: [],
          equipment_variants: [],
        },
      ],
    }),
    event_dates: () => ({
      data: [{ event_id: "evt-A" }],
    }),
    event_equipment: () => ({
      // OS A tinha 2 unidades alocadas, mas já foi totalmente devolvida.
      // Query agora filtra returned_at IS NULL → zero rows → allocated=0.
      data: [],
    }),
  });

  mocks.createSupabaseAdminClient.mockReturnValue(supabase);
  const result = await getEquipmentAvailability("org-1", ["2026-08-08"]);
  const av = result.get(availabilityKey("eq-1", null));
  expect(av?.allocated).toBe(0);
  expect(av?.available).toBe(2);
});
```

- [ ] **Step 2: Rodar teste — deve passar trivialmente OU falhar se ainda não há filtro**

Run: `npm test -- tests/inventory.availability.test.ts`

Como o mock só devolve rows que ele entrega, o teste passa sem mudança de produção. **Para garantir que a produção realmente filtra**, prosseguir com Step 3.

- [ ] **Step 3: Modificar a query em `src/lib/inventory.ts`**

Localizar o bloco do `event_equipment` na linha ~470:

```ts
const { data: allocData, error: allocErr } = await supabase
  .from("event_equipment")
  .select("equipment_id, variant_id, qty")
  .in("event_id", Array.from(overlappingEventIds));
```

Substituir por:

```ts
const { data: allocData, error: allocErr } = await supabase
  .from("event_equipment")
  .select("equipment_id, variant_id, qty, returned_at")
  .in("event_id", Array.from(overlappingEventIds))
  .is("returned_at", null);
```

- [ ] **Step 4: Rodar suite inteira**

Run: `npm test`
Expected: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory.ts tests/inventory.availability.test.ts
git commit -m "fix(availability): exclui event_equipment com returned_at setado"
```

---

## Task 7: Server actions `scanLoadUnit` + `scanReturnUnit`

**Files:**
- Create: `src/app/(dashboard)/scan/actions.ts`
- Create: `tests/scan.actions.test.ts`

- [ ] **Step 1: Escrever testes falhando**

Arquivo: `tests/scan.actions.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEquipmentUnitByQrCode: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/inventory", async () => {
  const actual = await vi.importActual<typeof import("@/lib/inventory")>("@/lib/inventory");
  return { ...actual, getEquipmentUnitByQrCode: mocks.getEquipmentUnitByQrCode };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseAdminClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/auth/session", () => ({
  getUser: mocks.getUser,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { scanLoadUnit, scanReturnUnit } from "@/app/(dashboard)/scan/actions";

describe("scan actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scanLoadUnit: rejeita QR não cadastrado", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue(null);
    mocks.getUser.mockResolvedValue({ id: "u1" });
    const result = await scanLoadUnit("evt-1", "QR-MISSING");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não encontrado|not found/i);
  });

  it("scanLoadUnit: rejeita QR cadastrado mas não vinculado à OS", async () => {
    mocks.getEquipmentUnitByQrCode.mockResolvedValue({
      id: "unit-1",
      equipmentId: "eq-A",
      organizationId: "org-1",
      variantId: null,
      status: "available",
    });
    mocks.getUser.mockResolvedValue({ id: "u1" });
    const fakeQuery = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mocks.createSupabaseServerClient.mockReturnValue(fakeQuery);

    const result = await scanLoadUnit("evt-1", "QR-OTHER-EQUIP");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/não está/i);
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar (módulo não existe)**

Run: `npm test -- tests/scan.actions.test.ts`
Expected: FAIL — `Cannot find module '@/app/(dashboard)/scan/actions'`.

- [ ] **Step 3: Implementar server actions**

Arquivo: `src/app/(dashboard)/scan/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/session";
import { getEquipmentUnitByQrCode } from "@/lib/inventory";

export interface ScanResult {
  ok: boolean;
  error?: string;
  unitId?: string;
  equipmentId?: string;
  eventEquipmentId?: string;
}

export async function scanLoadUnit(
  eventId: string,
  qrCode: string
): Promise<ScanResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };

  const unit = await getEquipmentUnitByQrCode(trimmed);
  if (!unit) return { ok: false, error: "QR não encontrado" };

  const supabase = createSupabaseAdminClient();

  // Achar a row de event_equipment correspondente
  const { data: eeRow, error: eeErr } = await supabase
    .from("event_equipment")
    .select("id, qty")
    .eq("event_id", eventId)
    .eq("equipment_id", unit.equipmentId)
    .is("variant_id", unit.variantId)
    .maybeSingle();
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!eeRow) return { ok: false, error: "Este equipamento não está vinculado à OS" };

  // Upsert na event_equipment_units
  const { error: upsertErr } = await supabase
    .from("event_equipment_units")
    .upsert(
      {
        event_equipment_id: eeRow.id,
        equipment_unit_id: unit.id,
        loaded_at: new Date().toISOString(),
        loaded_by: user.id,
      },
      { onConflict: "event_equipment_id,equipment_unit_id" }
    );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  // Quando o nº de units carregadas == qty, marca event_equipment.loaded
  const { data: loadedCount } = await supabase
    .from("event_equipment_units")
    .select("id", { count: "exact", head: true })
    .eq("event_equipment_id", eeRow.id)
    .not("loaded_at", "is", null);

  // Nota: usar count via head:true ou listar e medir; manter explícito.
  const { count } = await supabase
    .from("event_equipment_units")
    .select("*", { count: "exact", head: true })
    .eq("event_equipment_id", eeRow.id)
    .not("loaded_at", "is", null);

  if ((count ?? 0) >= eeRow.qty) {
    await supabase
      .from("event_equipment")
      .update({
        separated: true,
        loaded: true,
        loaded_at: new Date().toISOString(),
        loaded_by: user.id,
      })
      .eq("id", eeRow.id);
  }

  revalidatePath(`/scan/load/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return {
    ok: true,
    unitId: unit.id,
    equipmentId: unit.equipmentId,
    eventEquipmentId: eeRow.id,
  };
}

export async function scanReturnUnit(
  eventId: string,
  qrCode: string
): Promise<ScanResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const trimmed = qrCode.trim();
  if (!trimmed) return { ok: false, error: "QR vazio" };

  const unit = await getEquipmentUnitByQrCode(trimmed);
  if (!unit) return { ok: false, error: "QR não encontrado" };

  const supabase = createSupabaseAdminClient();

  const { data: eeRow, error: eeErr } = await supabase
    .from("event_equipment")
    .select("id, qty")
    .eq("event_id", eventId)
    .eq("equipment_id", unit.equipmentId)
    .is("variant_id", unit.variantId)
    .maybeSingle();
  if (eeErr) return { ok: false, error: eeErr.message };
  if (!eeRow) return { ok: false, error: "Este equipamento não está vinculado à OS" };

  // Atualizar a unit (ela precisa já ter sido carregada)
  const { data: euRow, error: euErr } = await supabase
    .from("event_equipment_units")
    .update({
      returned_at: new Date().toISOString(),
      returned_by: user.id,
    })
    .eq("event_equipment_id", eeRow.id)
    .eq("equipment_unit_id", unit.id)
    .not("loaded_at", "is", null)
    .is("returned_at", null)
    .select("id")
    .maybeSingle();
  if (euErr) return { ok: false, error: euErr.message };
  if (!euRow) return { ok: false, error: "Unidade não carregada ou já retornada" };

  // Se TODAS as units desta row foram retornadas, marcar event_equipment.returned_at
  const { count: returnedCount } = await supabase
    .from("event_equipment_units")
    .select("*", { count: "exact", head: true })
    .eq("event_equipment_id", eeRow.id)
    .not("returned_at", "is", null);

  if ((returnedCount ?? 0) >= eeRow.qty) {
    await supabase
      .from("event_equipment")
      .update({ returned_at: new Date().toISOString() })
      .eq("id", eeRow.id);
  }

  revalidatePath(`/scan/return/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  return {
    ok: true,
    unitId: unit.id,
    equipmentId: unit.equipmentId,
    eventEquipmentId: eeRow.id,
  };
}
```

- [ ] **Step 4: Rodar teste — deve passar**

Run: `npm test -- tests/scan.actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/scan/actions.ts tests/scan.actions.test.ts
git commit -m "feat(scan): server actions scanLoadUnit + scanReturnUnit"
```

---

## Task 8: Componente `QrCodeDisplay` (server)

**Files:**
- Create: `src/components/inventory/QrCodeDisplay.tsx`

- [ ] **Step 1: Escrever componente**

```tsx
import QRCode from "qrcode";

interface QrCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
}

export async function QrCodeDisplay({ value, size = 128, className }: QrCodeDisplayProps) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    margin: 1,
    width: size,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <div
      aria-label={`QR code: ${value}`}
      className={className}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
```

- [ ] **Step 2: Confirmar compila**

Run: `npx tsc --noEmit`
Expected: zero novos erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/inventory/QrCodeDisplay.tsx
git commit -m "feat(inventory): QrCodeDisplay server component renderiza SVG"
```

---

## Task 9: Componente `QrScanner` (client)

**Files:**
- Create: `src/components/inventory/QrScanner.tsx`

- [ ] **Step 1: Escrever scanner**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface QrScannerProps {
  onResult: (text: string) => void;
  onError?: (err: Error) => void;
  pauseAfterScanMs?: number;
}

export function QrScanner({ onResult, onError, pauseAfterScanMs = 1500 }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!active || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    let lastEmitAt = 0;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
        if (stopped) return;
        if (result) {
          const now = Date.now();
          if (now - lastEmitAt < pauseAfterScanMs) return;
          lastEmitAt = now;
          onResult(result.getText());
        } else if (err && err.name !== "NotFoundException") {
          onError?.(err);
        }
      })
      .catch((err: Error) => onError?.(err));

    return () => {
      stopped = true;
      // BrowserMultiFormatReader não expõe stop direto; deixamos GC e useEffect cleanup do video.
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [active, onResult, onError, pauseAfterScanMs]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      <video
        ref={videoRef}
        className="aspect-square w-full object-cover"
        muted
        playsInline
        autoPlay
      />
      <div className="flex justify-end p-2">
        <button
          type="button"
          onClick={() => setActive((v) => !v)}
          className="rounded-lg bg-white/10 px-3 py-1 text-xs text-white"
        >
          {active ? "Pausar" : "Retomar"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/inventory/QrScanner.tsx
git commit -m "feat(inventory): QrScanner client component (zxing + getUserMedia)"
```

---

## Task 10: Adicionar campo QR no `InventorySheet`

**Files:**
- Modify: `src/app/(dashboard)/inventory/InventorySheet.tsx` (entre os campos `patrimony` e `purchaseDate`, dentro do bloco `type === "serialized"`)
- Modify: `src/app/(dashboard)/inventory/actions.ts` (parseamento do FormData)

- [ ] **Step 1: Adicionar input no sheet**

Localizar (linha ~185-192 do `InventorySheet.tsx`, bloco com `patrimony`):

```tsx
<label className={LABEL_CLASS}>
  <span className={LABEL_TEXT_CLASS}>Nº Patrimônio</span>
  <input
    name="patrimony"
    placeholder="Ex.: PAT-2023-042"
    className={INPUT_CLASS}
  />
</label>
```

Adicionar logo após (no mesmo `grid sm:grid-cols-2`, ou novo grid abaixo):

```tsx
<label className={LABEL_CLASS}>
  <span className={LABEL_TEXT_CLASS}>QR Code (opcional)</span>
  <input
    name="qrCode"
    placeholder="Bipe ou digite o código"
    disabled={hasVariants}
    className={INPUT_CLASS}
  />
</label>
```

- [ ] **Step 2: Atualizar `createEquipment` em actions.ts**

Em `src/app/(dashboard)/inventory/actions.ts`, no parsing do FormData para o caso `serialized && !hasVariants` (procurar onde `equipment_units` é inserido), adicionar:

```ts
const qrCode = (form.get("qrCode") as string | null)?.trim() || null;

// no insert de equipment_units:
.insert({
  equipment_id: eqId,
  serial: serial!,
  patrimony: patrimony || null,
  qr_code: qrCode,
  // ...
})
```

Se o código de inserção `equipment_units` estiver isolado em outro helper, ajustar lá. Manter mesma estrutura dos campos existentes.

- [ ] **Step 3: Verificar criação em dev**

Run: `npm run dev`

Manualmente: criar equipamento serializado com QR `"TEST-QR-001"`. Verificar no Supabase Studio (ou via SQL) que `equipment_units.qr_code` foi gravado.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/inventory/InventorySheet.tsx src/app/\(dashboard\)/inventory/actions.ts
git commit -m "feat(inventory): campo QR Code no cadastro de unidade serializada"
```

---

## Task 11: Mostrar QR na página de detalhe

**Files:**
- Modify: `src/app/(dashboard)/inventory/[id]/page.tsx`

- [ ] **Step 1: Importar e renderizar `QrCodeDisplay`**

No início do arquivo:

```tsx
import { QrCodeDisplay } from "@/components/inventory/QrCodeDisplay";
```

Na seção que lista as `equipment_units` (procurar por `unit.serial` ou similar), adicionar bloco ao lado de cada unit:

```tsx
{unit.qrCode ? (
  <div className="flex items-center gap-3">
    <QrCodeDisplay value={unit.qrCode} size={64} />
    <code className="text-xs text-muted-foreground">{unit.qrCode}</code>
  </div>
) : (
  <span className="text-xs italic text-muted-foreground">Sem QR cadastrado</span>
)}
```

(Se o tipo `EquipmentUnit` em `src/lib/inventory.ts` não inclui `qrCode`, adicionar na interface e no mapping do `listEquipment` / `getEquipmentDetail`.)

- [ ] **Step 2: Confirmar `qr_code` está no tipo `EquipmentUnit`**

Em `src/lib/inventory.ts`, no tipo da unit serializada:

```ts
export interface EquipmentUnit {
  id: string;
  serial: string;
  patrimony: string | null;
  status: EquipmentStatus;
  qrCode: string | null;
  // ...
}
```

E no mapping (procurar `equipment_units` no select e no `.map`):

```ts
qrCode: u.qr_code,
```

- [ ] **Step 3: Verificar visualmente**

Run: `npm run dev`

Abrir `/inventory/<id>` de um equipamento serializado com QR cadastrado. Verificar QR SVG renderiza.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/inventory/\[id\]/page.tsx src/lib/inventory.ts
git commit -m "feat(inventory): exibir QrCodeDisplay por unidade no detail"
```

---

## Task 12: Página `/scan/load/[eventId]`

**Files:**
- Create: `src/app/(dashboard)/scan/layout.tsx`
- Create: `src/app/(dashboard)/scan/load/[eventId]/page.tsx`
- Create: `src/app/(dashboard)/scan/load/[eventId]/LoadScanClient.tsx`

- [ ] **Step 1: Layout mobile**

`src/app/(dashboard)/scan/layout.tsx`:

```tsx
export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background p-4">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Página server**

`src/app/(dashboard)/scan/load/[eventId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";

import { getEventDetail } from "@/lib/events";

import { LoadScanClient } from "./LoadScanClient";

export default async function ScanLoadPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getEventDetail(eventId);
  if (!event) notFound();

  const pending = event.equipment.filter((e) => (e.loadedUnitsCount ?? 0) < e.qty);

  return (
    <>
      <header className="mb-3">
        <h1 className="text-lg font-semibold">Carregar — {event.name}</h1>
        <p className="text-xs text-muted-foreground">Bipe cada equipamento ao carregar no veículo.</p>
      </header>

      <LoadScanClient eventId={eventId} initialPending={pending} />
    </>
  );
}
```

- [ ] **Step 3: Cliente com scanner + lista**

`src/app/(dashboard)/scan/load/[eventId]/LoadScanClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";

import { QrScanner } from "@/components/inventory/QrScanner";
import { scanLoadUnit } from "@/app/(dashboard)/scan/actions";

interface PendingItem {
  id: string;
  equipmentName: string;
  variantLabel: string | null;
  qty: number;
  loadedUnitsCount: number;
}

interface LoadScanClientProps {
  eventId: string;
  initialPending: PendingItem[];
}

export function LoadScanClient({ eventId, initialPending }: LoadScanClientProps) {
  const [pending, setPending] = useState(initialPending);

  async function handleScan(text: string) {
    const result = await scanLoadUnit(eventId, text);
    if (!result.ok) {
      toast.error(result.error ?? "Erro");
      return;
    }
    toast.success(`Carregado: ${text}`);
    setPending((p) =>
      p
        .map((item) =>
          item.id === result.eventEquipmentId
            ? { ...item, loadedUnitsCount: item.loadedUnitsCount + 1 }
            : item
        )
        .filter((item) => item.loadedUnitsCount < item.qty)
    );
  }

  return (
    <>
      <QrScanner onResult={handleScan} onError={(e) => toast.error(e.message)} />
      <ul className="mt-4 space-y-2">
        {pending.length === 0 ? (
          <li className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
            Tudo carregado.
          </li>
        ) : (
          pending.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
            >
              <span>
                {item.equipmentName}
                {item.variantLabel ? ` · ${item.variantLabel}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {item.loadedUnitsCount}/{item.qty}
              </span>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
```

- [ ] **Step 4: Verificar dev**

Run: `npm run dev`

Abrir `/scan/load/<eventId>` no celular (ou Chrome DevTools mobile). Permitir câmera. Bipar QR de uma unit cadastrada. Esperado: toast verde + contador 1/qty.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/scan
git commit -m "feat(scan): página /scan/load/[eventId] com câmera + lista pendente"
```

---

## Task 13: Página `/scan/return/[eventId]`

**Files:**
- Create: `src/app/(dashboard)/scan/return/[eventId]/page.tsx`
- Create: `src/app/(dashboard)/scan/return/[eventId]/ReturnScanClient.tsx`

- [ ] **Step 1: Página server**

`src/app/(dashboard)/scan/return/[eventId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";

import { getEventDetail } from "@/lib/events";

import { ReturnScanClient } from "./ReturnScanClient";

export default async function ScanReturnPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getEventDetail(eventId);
  if (!event) notFound();

  const pending = event.equipment
    .filter((e) => (e.loadedUnitsCount ?? 0) > (e.returnedUnitsCount ?? 0))
    .map((e) => ({
      id: e.id,
      equipmentName: e.equipmentName,
      variantLabel: e.variantLabel,
      loadedUnitsCount: e.loadedUnitsCount,
      returnedUnitsCount: e.returnedUnitsCount,
    }));

  return (
    <>
      <header className="mb-3">
        <h1 className="text-lg font-semibold">Retornar — {event.name}</h1>
        <p className="text-xs text-muted-foreground">Bipe cada equipamento ao devolver ao estoque.</p>
      </header>
      <ReturnScanClient eventId={eventId} initialPending={pending} />
    </>
  );
}
```

- [ ] **Step 2: Cliente**

`src/app/(dashboard)/scan/return/[eventId]/ReturnScanClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";

import { QrScanner } from "@/components/inventory/QrScanner";
import { scanReturnUnit } from "@/app/(dashboard)/scan/actions";

interface PendingItem {
  id: string;
  equipmentName: string;
  variantLabel: string | null;
  loadedUnitsCount: number;
  returnedUnitsCount: number;
}

interface ReturnScanClientProps {
  eventId: string;
  initialPending: PendingItem[];
}

export function ReturnScanClient({ eventId, initialPending }: ReturnScanClientProps) {
  const [pending, setPending] = useState(initialPending);

  async function handleScan(text: string) {
    const result = await scanReturnUnit(eventId, text);
    if (!result.ok) {
      toast.error(result.error ?? "Erro");
      return;
    }
    toast.success(`Retornado: ${text}`);
    setPending((p) =>
      p
        .map((item) =>
          item.id === result.eventEquipmentId
            ? { ...item, returnedUnitsCount: item.returnedUnitsCount + 1 }
            : item
        )
        .filter((item) => item.returnedUnitsCount < item.loadedUnitsCount)
    );
  }

  return (
    <>
      <QrScanner onResult={handleScan} onError={(e) => toast.error(e.message)} />
      <ul className="mt-4 space-y-2">
        {pending.length === 0 ? (
          <li className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
            Tudo retornado.
          </li>
        ) : (
          pending.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
            >
              <span>
                {item.equipmentName}
                {item.variantLabel ? ` · ${item.variantLabel}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {item.returnedUnitsCount}/{item.loadedUnitsCount}
              </span>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/scan/return
git commit -m "feat(scan): página /scan/return/[eventId] com câmera + lista pendente"
```

---

## Task 14: Links de scan no detalhe da OS

**Files:**
- Modify: `src/app/(dashboard)/events/[id]/page.tsx`

- [ ] **Step 1: Adicionar dois botões/links**

Em uma área visível no detail da OS (idealmente perto do header ou da lista de equipamentos), adicionar:

```tsx
<div className="flex flex-wrap gap-2">
  <Link
    href={`/scan/load/${event.id}`}
    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
  >
    Bipar carregamento
  </Link>
  <Link
    href={`/scan/return/${event.id}`}
    className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
  >
    Bipar retorno
  </Link>
</div>
```

- [ ] **Step 2: Verificar dev**

Run: `npm run dev`

Abrir `/events/<id>`. Confirmar que os dois botões aparecem e que clicar leva às rotas corretas.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/events/\[id\]/page.tsx
git commit -m "feat(events): botões de bipar carregamento/retorno no detail da OS"
```

---

## Self-Review Checklist

Antes de iniciar a execução:

- [ ] Cobertura do spec:
  - Cadastro de QR no equipamento → Task 10 ✓
  - Bipar no carregar → Task 12 ✓
  - Bipar no retornar → Task 13 ✓
  - Empresa gera QR (app só guarda texto) → confirmado, não há geração crypto ✓
  - Availability libera estoque ao retornar → Task 6 ✓
- [ ] Placeholders: nenhum bloco com `TODO`, `implement later`, `similar to task N` sem código.
- [ ] Consistência de nomes:
  - `getEquipmentUnitByQrCode` (Tasks 4, 7, 11) ✓
  - `scanLoadUnit` / `scanReturnUnit` (Tasks 7, 12, 13) ✓
  - `event_equipment_units` (Tasks 1, 5, 7) ✓
  - `loadedUnitsCount` / `returnedUnitsCount` (Tasks 5, 12, 13) ✓
- [ ] Migrations seguem padrão existente (RLS, índices, comentário-header) ✓

---

## Notes

- **Offline:** fora de escopo. Galpão precisa wifi/4G.
- **PWA:** fora de escopo. Roda em browser mobile (Safari iOS 14+, Chrome).
- **Geração de PDF de etiquetas:** fora de escopo. Empresa traz adesivos prontos.
- **Bulk com QR:** não suportado. Decisão: itens com QR físico devem ser cadastrados como serializados.
- **Variantes:** suportado via `equipment_units.variant_id`; o scan resolve a variante automaticamente.
- **Idempotência:** rescannear a mesma unit no carregamento é no-op (upsert com `onConflict`); no retorno, a query exige `loaded_at IS NOT NULL AND returned_at IS NULL`.
