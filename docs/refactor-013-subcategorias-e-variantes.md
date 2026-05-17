# Refactor 013 — Sub-buckets de categoria + variantes de tamanho

> Branch: `feat/equipment-registration` · Migration: `supabase/migrations/20260517_000013_equipment_subcategories_and_variants.sql`
>
> Resolve `docs/projeto-contexto.md` §6.2 itens 4 e 5.

---

## 1. Motivação

A OS impressa de referência (Formatura Dom Manuel 28/02–01/03) lista equipamentos em dois padrões que o schema atual não conseguia representar:

1. **Sub-buckets de categoria.** A categoria `Sonorização` contém um sub-bucket nominal `Gaveteiro` (caixa/maleta com acessórios pequenos). Antes, `equipment_categories` era plana — não havia como agrupar `Sonorização › Gaveteiro › Cabo XLR`. A operação precisava replicar nomes ou criar categorias sintéticas tipo `Sonorização - Gaveteiro`.

2. **Variantes de tamanho.** Cabeamento é listado por tamanho (`XLR 5M`, `XLR 10M`, `XLR 20M`). Antes, cada tamanho exigia um cadastro de equipamento separado — explodia o inventário, quebrava reports por modelo, e não permitia consolidar "Cabo XLR" como um conceito único com estoque desagregado.

Sem isso, a tela de equipamentos da OS (§5.3) não consegue espelhar o documento impresso.

---

## 2. Decisões de design

### 2.1. Sub-buckets — 1 nível, enforced em app

- `equipment_categories.parent_category_id uuid references equipment_categories(id) on delete restrict`.
- **Profundidade máxima = 1 nível**, validada no servidor (`validateCategoryParent` em `src/app/(dashboard)/inventory/actions.ts`).
- Schema não impõe a profundidade — fica livre. UI filtra o dropdown de pai para listar só raízes; servidor rejeita se o `parent_category_id` apontar para uma categoria que já tem pai.
- **Por quê 1 nível:** a OS real não tem hierarquia mais profunda. Permitir N níveis abriria caminho pra UX confusa (breadcrumbs longos, filtros recursivos) sem benefício operacional.
- `on delete restrict` na FK — apagar pai com filhos é bloqueado pelo banco.

### 2.2. Variantes — estoque próprio, opt-in por equipamento

- Nova tabela `equipment_variants (id, equipment_id, label, sort_value, position, notes)`.
- Flag `equipment.has_variants boolean default false` — equipamentos antigos continuam funcionando exatamente como hoje (sem variantes).
- `variant_id uuid` adicionado a três tabelas dependentes — **sempre nullable**:
  - `equipment_units.variant_id` — para serializado, cada unidade aponta para sua variante.
  - `bulk_inventory.variant_id` — para bulk, **uma row por variante** (estoque desagregado).
  - `event_equipment.variant_id` — alocação por OS guarda a variante escolhida.
- `bulk_inventory`: o `unique (equipment_id)` antigo foi substituído por **dois unique parciais**:
  - `where variant_id is null` — equipamentos sem variantes mantêm 1 row.
  - `where variant_id is not null` em `(equipment_id, variant_id)` — equipamentos com variantes têm N rows.
  - Permite o mesmo `equipment_id` ter modos diferentes sem conflito.

**Por quê estoque próprio (e não % de um total):**
- XLR 5M esgotar não significa XLR 10M esgotou.
- Operação real conta fisicamente por tamanho, não por agregado.
- Mantém a math de disponibilidade simples (`available_qty = total_qty - alocado nessa variante`).

**Por quê opt-in (`has_variants` flag):**
- 90% do inventário não precisa de variantes (mixer, mesa, TV).
- Sem flag, a UI teria que checar "tem variantes?" em todos os fluxos. Com flag, o caminho default permanece intocado.

### 2.3. Composite key encoding

Frontend e server precisam falar a mesma língua sobre "(equipamento, variante)" como unidade lógica de disponibilidade:

```ts
// src/lib/inventory.ts
export function availabilityKey(equipmentId, variantId) {
  return variantId ? `${equipmentId}:${variantId}` : equipmentId;
}
```

- Maps de disponibilidade são indexados por `availabilityKey(...)`.
- FormData encoding: `qty_<equipmentId>` (sem variante) ou `qty_<equipmentId>__<variantId>` (com variante) — **double underscore** evita conflito com UUID hífens.

---

## 3. Mudanças por arquivo

### Banco (`supabase/migrations/20260517_000013_*.sql`)

- `equipment_categories.parent_category_id` + index.
- `equipment_variants` table + trigger `set_updated_at` + RLS (4 policies via `has_org_role`).
- `equipment.has_variants` + partial index.
- `variant_id` em `equipment_units`, `bulk_inventory`, `event_equipment` + indexes.
- `bulk_inventory`: drop unique `equipment_id` → 2 partial uniques.

### Tipos e fetchers (`src/lib/inventory.ts`)

- `EquipmentVariant`, `Equipment.hasVariants`, `Equipment.variants`, `Equipment.parentCategoryId/Name`.
- `availabilityKey` helper (exportado — usado em actions e tests).
- `getEquipmentAvailability` recalcula totais por `(equipment, variant)` e indexa alocação no mesmo key.
- Joins de parent_category usam **hint por coluna** (`parent:parent_category_id (id, name)`) em vez de FK name. Mais robusto contra schema cache stale do PostgREST.

### Actions de inventário (`src/app/(dashboard)/inventory/actions.ts`)

- `createEquipment`/`updateEquipment` aceitam `hasVariants`.
- `createEquipment` com `hasVariants=true` **não** auto-cria unidade nem bulk row — usuário configura variantes depois.
- `validateCategoryParent` — valida 1 nível e rejeita "pai" que já é filho ou ciclos.
- `createCategory`/`renameCategory` aceitam `parentCategoryId`.
- `addEquipmentUnit` aceita `variantId` (nullable).
- `updateBulkInventory` escopado com `.is("variant_id", null)` — só edita estoque do "sem variante".
- **Novos:** `createEquipmentVariant` (auto-flipa `has_variants=true` na primeira; para bulk, cria a row de inventário), `updateEquipmentVariant`, `deleteEquipmentVariant` (bloqueia se `event_equipment` aponta para ela), `updateBulkInventoryVariant` (upsert).

### Actions de eventos (`src/app/(dashboard)/events/actions.ts`)

- `setEventEquipmentBatch` parseia ambos os formatos de chave (`qty_<eq>` e `qty_<eq>__<v>`), persiste `variant_id` na linha de `event_equipment`.
- `promoteToReadyToLoad` valida estoque por `availabilityKey` — mensagens de "sem estoque" incluem rótulo da variante.

### UI

- **`CategoryManager.tsx`** — select de pai no form de criação + edição (excluindo self e nodes que já são filhos), chip de pai na tabela.
- **`InventorySheet.tsx`** — checkbox `Tem variantes de tamanho`. Categorias renderizam como `Pai › Filho`.
- **`EditEquipmentSheet.tsx`** — checkbox `has_variants` para retroativamente ativar variantes.
- **`VariantManager.tsx` (novo)** — CRUD inline de variantes na página de detalhe do equipamento. Para bulk, inclui editor de estoque por variante. Delete usa `DeleteConfirmDialog` com aviso explícito sobre unidades/estoque.
- **`AddUnitSheet.tsx`** — quando `has_variants=true`, expõe select de variante (obrigatório).
- **`inventory/[id]/page.tsx`** — renderiza `<VariantManager>` condicionalmente. Substitui `new Date(purchaseDate).toLocaleDateString` por `formatDateBR` (corrige bug de TZ).
- **`AddEquipmentSheet.tsx` (events)** — rewrite. Para itens com variantes renderiza **cabeçalho cinza** + sub-rows indentadas, cada uma com stepper e badge de disponibilidade própria. `currentQtyByKey` recebido como prop. Hidden inputs cobrem todo o universo (eq+variantes) — sem essa cobertura, variantes que voltam pra 0 não seriam persistidas.
- **`events/[id]/page.tsx`** — coluna de equipamento mostra chip da variante. `availability` lookup pelo composite key.
- **`checkout/page.tsx` + `checkin/page.tsx`** — chip de variante ao lado de `equipmentName`.

### Tests (`tests/inventory.actions.test.ts`, `tests/events.actions.test.ts`)

- Suíte de inventário ajustada para os campos novos (`has_variants` em update, `parent_category_id: null` em insert, `.is("variant_id", null)` nos asserts de chain, mensagem `"Categoria atualizada"`).
- Novos: rejeição de pai-de-pai, happy path de `createEquipmentVariant`, delete bloqueado quando vinculado a OS.
- Suíte de eventos: mock de `@/lib/inventory` expõe `availabilityKey` (não só `getEquipmentAvailability`). Teste novo cobre `setEventEquipmentBatch` persistindo `variant_id: null` e `variant_id: "var-A"` no mesmo batch.

---

## 4. Por quê do código

### Por quê hint `parent:parent_category_id (id, name)` em vez de hint por FK name

A primeira versão usou `parent:equipment_categories!equipment_categories_parent_category_id_fkey (id, name)`. Funciona quando o cache de schema do PostgREST está atualizado, mas após migration parcial via SQL editor do Supabase o cache não pegou a self-FK e quebrou com `PGRST200`. Hint por coluna não depende do cache de FK names — PostgREST resolve direto na coluna.

### Por quê `createEquipmentVariant` auto-flipa `has_variants=true`

Sem o flip automático, o usuário marca o checkbox, salva, depois adiciona variante — três passos. Com flip, o checkbox vira opcional na criação: marcar é "começo com variantes vazias"; adicionar a primeira variante a um item antigo já liga o modo. Reduz fricção sem perder o controle (UI ainda mostra o checkbox no edit).

### Por quê `deleteEquipmentVariant` checa `event_equipment` antes do delete

A FK é `on delete restrict`, então o banco bloquearia de qualquer jeito. Mas o usuário receberia um erro genérico de constraint. Check explícito permite mensagem amigável (`"Variante está vinculada a uma OS. Remova-a da OS antes de apagar."`) sem deixar o banco rejeitar.

### Por quê não usar PG `check constraint` para 1 nível

Seria possível: `check (parent_category_id is null or not exists (select 1 from equipment_categories p where p.id = parent_category_id and p.parent_category_id is not null))`. Mas:
- `check` constraints em Postgres não podem usar subqueries.
- Trigger funcionaria, mas duplica regra que já está no servidor.
- O ganho seria proteger contra inserts diretos por outros clientes — em prática, todas as escritas passam pelo nosso server.

### Por quê duas partial uniques em vez de uma com COALESCE

```sql
-- alternativa rejeitada:
create unique index on bulk_inventory (equipment_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
```
Funciona, mas:
- Inventa um UUID sentinel.
- Index não consegue ser usado pra queries `where variant_id is null` (precisa LIKE no expression).
- Partial uniques nomeiam intenção e o EXPLAIN fica legível.

---

## 5. Trade-offs e limitações

| Decisão | Trade-off |
|---|---|
| Sub-buckets 1 nível | OS com hierarquia mais funda (ex.: `Sonorização › Cabeamento › Gaveteiro`) força criar categoria sintética. Aceitável pelo doc impresso. |
| Variantes opt-in | UX assimétrica: equipamento normal tem auto-create de unit/bulk; com variantes, usuário precisa criar variantes E unidades depois. Mitigado pelo toast `"Configure as variantes na aba abaixo."` |
| FormData double underscore | Quebra se variant_id contiver `__` (UUIDs não contêm). Documentado como invariante implícito. |
| `bulk_inventory` mode-mix | Tecnicamente o mesmo `equipment_id` pode ter uma row sem variante E rows com variante. Schema permite, app usa `has_variants` pra decidir qual ler. Risk: bug onde o app lê do modo errado. Mitigado por testes e pelo helper `availabilityKey`. |

---

## 6. Pendências (não-bloqueantes)

Listadas em ordem de prioridade:

1. **UI de BULK ainda hardcoded em type=serialized.** O sheet de criação não expõe switch serial/bulk. Quando expor, BULK com variantes "just works" (server e schema prontos).
2. **Badge "estoque insuficiente" em `/events` list** quando alguma variante alocada estourou estoque.
3. **OSes que estão alocando cada equipamento** na página de detalhe do inventário (para entender por que algo está com `available=0`).
4. **Auxiliary tables** do §6.2 item 7 (`event_speakers`, `event_led_panel`, etc.) — não relacionados a esse refactor.

---

## 7. Como aplicar e testar

```bash
# 1. Migration
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260517_000013_equipment_subcategories_and_variants.sql
# (ou SQL editor do Supabase Dashboard)

# 2. Reload schema cache se houve aplicação parcial via SQL editor:
# notify pgrst, 'reload schema';

# 3. Tipos e tests
npx tsc --noEmit
npx vitest run

# 4. App
npm run dev
```

Roteiro de teste E2E em conversa anterior: criar `Sonorização › Gaveteiro`, depois `Cabo XLR` com variantes `5M` e `10M`, depois adicionar à OS, verificar chip de variante em checkout/checkin, verificar isolation de estoque entre variantes.

---

## 8. Histórico

- **2026-05-17** — primeira versão. Aplicada e testada (E2E PASS em 8/10 cenários, 1 SKIP de BULK UI, 1 PARCIAL coberto pelo patch que expôs `variant_id` no `AddUnitSheet`).
