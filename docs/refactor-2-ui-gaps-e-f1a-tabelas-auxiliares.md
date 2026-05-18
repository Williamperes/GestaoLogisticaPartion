# Refactor 2 (UI gaps inventário/eventos) + F1a (tabelas auxiliares)

> Resolve gaps de UI que ficaram abertos depois do Refactor E (migration
> 013) e abre o Refactor F do `docs/projeto-contexto.md` §6.2 item 7
> com as duas tabelas auxiliares de maior dor operacional:
> `event_speakers` e `event_extras`.

## 1. Motivação

Após Refactor E (sub-buckets + variantes), o E2E geral identificou três
gaps de UI que travavam fluxos operacionais reais:

1. **Operador não conseguia cadastrar equipamento em lote pela UI.**
   `createEquipment` aceitava `type=bulk`, mas o `InventorySheet`
   forçava `type=serialized` num hidden input. Itens como "50m de cabo"
   precisavam ser cadastrados como serializado individual ou via SQL.

2. **OS oversold passava despercebida na lista `/events`.** Operador
   só descobria que pediu 5 unidades quando o estoque tem 2 ao tentar
   promover para `ready_to_load`. Sem visibilidade até o último minuto.

3. **Sem rastreabilidade reversa estoque→OS.** Vendo "Cabo XLR 5M:
   0/2 disponível" no inventário, operador não sabia quem prendeu as
   2 unidades sem abrir cada OS uma por uma.

Em paralelo, o `docs/projeto-contexto.md` §6.2 item 7 listava 10
tabelas auxiliares (palestrantes, extras, anexos, venue info etc.)
que hoje viram free-text no campo `events.notes`. Atacar todas seria
~2 semanas; triagem por valor selecionou duas para começar:

- **`event_speakers`** — palestrantes/artistas com demandas técnicas
  (microfone, notebook, adaptador, técnico dedicado). Toda OS
  corporativa/formatura tem. Esquecer mic do palestrante 3 é incidente
  de campo recorrente.

- **`event_extras`** — gerador, box truss, TV, projetor, palco e itens
  similares **contratados de terceiros** (não estão no inventário
  próprio). Inclui fornecedor e preço opcional para cobrança/custo.

Os outros itens (LED panel, venue info, lodging, meals, transport,
load_dock, critical points, attachments) ficaram para fases seguintes.
`event_attachments` está separado em F1b por exigir Supabase Storage
(bucket, signed URLs, upload flow), que tem complexidade própria.

---

## 2. Decisões

### 2.1. Bulk toggle no `InventorySheet` (Item 2a)

- **Radio bicolor** (`type=serialized | type=bulk`) com cards clicáveis
  ao invés de select — UX direta para uma escolha binária de alto impacto.
- **Campos condicionais por tipo:** serializado mostra `serial` (req),
  `patrimony`, `purchaseDate`, `purchaseValue`; bulk mostra `unit`
  (default `"unidades"`) e `totalQty` (req).
- **`hasVariants` desabilita campo de estoque inicial** em ambos os
  tipos. Razão: quando `has_variants=true`, o estoque é carregado
  POR variante via `VariantManager` depois — criar uma unidade/linha
  de bulk "raiz" inutilizada seria lixo de dados.
- **`disabled={hasVariants}` no input `totalQty`** + `required={!hasVariants}`
  no `serial` — feedback visual + bypass de required HTML5 quando o
  campo não faz sentido.

### 2.2. Card de estoque + ajuste no detail bulk (parte de 2a)

A página de detalhe `/inventory/<id>` não renderizava nada útil para
`type=bulk && !hasVariants`. Adicionado bloco que mostra
`availableQty/totalQty unit` e botão `BulkAdjustDialog` (componente
que já existia mas não estava wired). Fallback: caso bulk sem
`bulk_inventory` row, aviso amber "Este lote ainda não tem estoque
cadastrado." — pode acontecer se a UI/seed criar o equipamento sem o
estoque inicial.

### 2.3. Badge "Estoque Insuficiente" em `/events` (Item 2b)

- **Critério:** OS em status ativo
  (`planning|ready_to_load|in_field`) com pelo menos um
  `event_equipment.qty > availability.available` no período.
- **Cálculo:** N chamadas paralelas a `getEquipmentAvailability`
  (uma por OS ativa) com `excludeEventId` — assim a função retorna
  o cap que esta OS poderia usar assumindo que **outras** OS
  concorrentes ficam fixas. Se a OS pede 5 e sobrariam 2 das outras,
  está oversold mesmo numa visão otimista.
- **Render:** chip vermelho inline ao lado do nome da OS, com
  `title` (tooltip nativo). Não bloqueia ação; só sinaliza.
- **Estrutura de dados:** `listEvents` agora popula
  `equipmentBrief: { equipmentId, variantId, qty }[]` por OS dentro
  do mesmo SELECT — evita N+1 só para descobrir o que cada OS pediu.

**Perf:** N chamadas paralelas ≈ 100 queries para 50 OS ativas.
Aceitável para MVP; otimização single-query fica como TODO se a
listagem ficar lenta.

### 2.4. Rastreabilidade reversa estoque→OS (Item 2c)

- **`getEquipmentAllocations(equipmentId, { includeInactive? })`** em
  `src/lib/inventory.ts`. Query reversa em `event_equipment` filtrando
  por `equipment_id`, com `events!inner` e `equipment_variants` joins.
- **Agrupamento por `(eventId, variantId)`** — se a mesma OS pegou 5M
  em duas linhas separadas (improvável mas possível), aparece como
  uma linha agregada com `qty` somado.
- **Filtro padrão:** apenas status ativos
  (`planning|ready_to_load|in_field`). `includeInactive=true` traz
  `completed|cancelled` também — útil para auditoria, mas a UI
  default mostra só o que está prendendo estoque AGORA.
- **Ordenação:** `startDate desc` (mais recente no topo). OS futuras
  imediatas ficam visíveis primeiro.
- **Render:** seção nova "Em uso por OS (N)" na página de detalhe do
  equipamento, com link para cada OS, chip de variante, qty, e
  `StatusBadge`.

### 2.5. Test fix `tests/team.actions.test.ts`

- Actions usam `encodeURIComponent("Técnico cadastrado.")` etc nos
  redirects de sucesso. Os testes esperavam string literal
  `Técnico cadastrado.` — falhavam contra
  `T%C3%A9cnico%20cadastrado.`.
- Trocado por `encodeURIComponent(...)` inline na expectativa do
  teste — robusto contra futuras mudanças de string.
- Sem mudança de produção. Suite: 66 → 69 PASS / 0 FAIL.

### 2.6. F1a — `event_speakers` + `event_extras`

#### Schema

`event_speakers`:
- Campos: `name` (req), `organization` (opcional), 4 booleans de
  demanda (`needs_mic`, `needs_notebook`, `needs_adapter`,
  `needs_dedicated_tech`), `notes`, `position`.
- FK `event_id → events.id ON DELETE CASCADE`.
- Index em `event_id`.

`event_extras`:
- Enum novo `event_extra_kind`:
  `generator|box_truss|tv|projector|stage|other`.
- Campos: `kind` (req), `description` (req), `qty` (default 1, check
  `qty > 0`), `supplier` (opcional), `unit_price_cents` (opcional),
  `notes`, `position`.
- FK `event_id → events.id ON DELETE CASCADE`.
- Index em `event_id`.

**Por quê `unit_price_cents` e não `unit_price_decimal`:** padrão
existente em `equipment.purchase_value_cents` — evita float imprecision
e simplifica soma agregada no front (mul/div por 100).

**Por quê CHECK qty > 0 e não > 0 + NOT NULL:** `qty` é `not null
default 1`, então `check (qty > 0)` é suficiente; `not null` está
implícito no `default 1`.

**Por quê enum no banco e não string livre:** garante consistência de
valores entre dashboards/relatórios futuros (ex.: agregar custo total
de "gerador" em todas OS do mês). Trade-off: adicionar novo kind
exige migration. Risco baixo — esses 6 valores cobrem ~95% dos casos;
"other" fica de escape válvula.

#### RLS

Espelha o pattern de `event_dates`:
- SELECT permitido a qualquer membro da org da OS
  (`is_member_of(e.organization_id)`).
- INSERT/UPDATE/DELETE permitido a `super_admin|admin|operations`
  (`has_org_role(..., array[...])`).

Não há policy de `warehouse|client` — esses roles são read-only nos
auxiliares.

#### Separação client-safe (`src/lib/event-aux.ts`)

**Problema:** `SpeakersPanel` e `ExtrasPanel` são
`"use client"`. Inicialmente importavam types (e
`EVENT_EXTRA_KIND_LABELS`, runtime) de `@/lib/events.ts`. Mas
`events.ts` importa `createSupabaseAdminClient` de `@/lib/supabase/server`,
que importa `next/headers`. Bundler arrastava o módulo inteiro para
o bundle do cliente, causando o erro:

```
You're importing a module that depends on "next/headers". This API
is only available in Server Components in the App Router, but you
are using it in the Pages Router.
```

**Fix:** Extraído types e labels para `src/lib/event-aux.ts` (pure,
zero imports de server-only). `events.ts` re-exporta tudo para
compatibilidade. Mirrors do pattern já existente em
`src/lib/event-dates.ts` (types) vs `event-dates.server.ts` (queries).

#### Actions

6 server actions em `src/app/(dashboard)/events/actions.ts`:
- `addEventSpeaker`, `updateEventSpeaker`, `removeEventSpeaker`
- `addEventExtra`, `updateEventExtra`, `removeEventExtra`

Todas:
- Chamam `requireWriteRole()` no início.
- Resolvem propriedade da OS via `assertEventInOrg` (create) ou
  `resolveSpeaker`/`resolveExtra` (edit/delete) — evita usuário
  atualizar registro de OS de outra organização passando ID válido.
- `revalidatePath` + `redirect` ao final com mensagem em
  `?success=` ou `?error=` (encodeURIComponent).

**`parseExtraKind` e `parseUnitPriceCents` como helpers:** isolam
validação de enum (rejeita string fora dos 6 valores → redirect com
erro) e parsing decimal→cents (aceita vírgula brasileira,
`"1500,00" → 150000`).

#### UI

**Tab nova "Convidados & Extras"** na página `/events/<id>`, 5ª
posição após "Equipamentos". Badge mostra
`speakers.length + extras.length` quando > 0.

**`SpeakersPanel`:**
- Sheet à direita para create/edit (form com 4 checkboxes de
  demanda + nome/org/notas).
- Linha mostra nome + organização inline, chips coloridos por
  demanda ativa, notas embaixo.
- Delete via `DeleteConfirmDialog` (igual unidades de inventário).
- `position` preservado em hidden input no edit — evita reset para 0.

**`ExtrasPanel`:**
- Tabela com colunas: Tipo (chip), Descrição (+notas inline),
  Fornecedor (md+), Qtd, Valor un. (sm+), ações.
- Header mostra `Extras / Terceirizados (N) · Total R$ X` quando
  há pelo menos um item com preço. Total = `sum(qty × unitPriceCents)
  / 100` formatado em pt-BR. Itens sem preço são ignorados.
- `KIND_ORDER` define ordem fixa do select de tipo (gerador
  primeiro, "outro" último) — espelha frequência de uso esperada.

---

## 3. Mudanças por arquivo

### Migration
- `supabase/migrations/20260518_000014_event_speakers_and_extras.sql`
  (novo) — enum + 2 tabelas + indexes + triggers `set_updated_at` + RLS.

### Bibliotecas
- `src/lib/event-aux.ts` (novo) — types/labels puros, client-safe.
- `src/lib/events.ts` — re-exporta de `event-aux`, adiciona
  `speakers[]`/`extras[]` em `EventDetail`, novo `EventEquipmentBrief`
  e `getEventsWithInsufficientStock`, expande SELECT de `getEventById`
  e `listEvents`.
- `src/lib/inventory.ts` — novo `EquipmentAllocation` type +
  `getEquipmentAllocations()`.

### Actions
- `src/app/(dashboard)/events/actions.ts` — 6 actions novas (speakers
  + extras), helpers `resolveSpeaker`, `resolveExtra`,
  `parseExtraKind`, `parseUnitPriceCents`.

### UI
- `src/app/(dashboard)/inventory/InventorySheet.tsx` — toggle
  serializado/bulk + campos condicionais + hint de variantes.
- `src/app/(dashboard)/inventory/[id]/page.tsx` — bloco bulk
  (`BulkAdjustDialog` wired) + seção "Em uso por OS".
- `src/app/(dashboard)/events/page.tsx` — badge "Estoque
  Insuficiente" inline com `AlertTriangle`.
- `src/app/(dashboard)/events/[id]/page.tsx` — tab nova + render
  dos painéis.
- `src/app/(dashboard)/events/[id]/SpeakersPanel.tsx` (novo).
- `src/app/(dashboard)/events/[id]/ExtrasPanel.tsx` (novo).

### Testes
- `tests/team.actions.test.ts` — fix de 3 testes que esperavam
  strings não-encoded.

---

## 4. Por quê do código (decisões não-óbvias)

### 4.1. `getEventsWithInsufficientStock` itera por OS em paralelo

A função foi modelada com N chamadas paralelas a `getEquipmentAvailability`
ao invés de uma query batch única. Por quê:

- `getEquipmentAvailability` exclui o evento sendo avaliado para mostrar
  o que **outras** OS já reservaram. Numa query batch global, calcular
  isso para cada OS exigiria subtrair o `qty` da OS atual do `allocated`
  agregado — complexidade extra com risco de off-by-one.
- A função existente já é coberta por testes; reutilizá-la garante
  consistência da definição de "available" entre listagem e gate de
  promoção.
- Trade-off explicito: O(N) DB calls. Aceitável MVP. Otimizar quando
  >100 OS ativas simultaneamente.

### 4.2. `EVENT_EXTRA_KIND_LABELS` em `event-aux.ts`, não em `events.ts`

Não é apenas types — é um `const` em runtime usado por `ExtrasPanel`.
Se ficasse em `events.ts`, importar essa constante puxa o módulo
inteiro pro bundle client → `next/headers` error em prod build (mesmo
que dev funcione). Pattern de safety: tudo que client component
importa fica em arquivo sem imports server-only.

### 4.3. `position` preservado em hidden inputs ao editar

Igual ao que foi feito com `sortValue` e `position` no `VariantManager`
(refactor E): edit form não expõe `position` para o usuário, mas
preserva o valor existente em hidden input. Sem isso, o update
sobrescreveria com `0` (default do `parseInt("")`).

### 4.4. `assertEventInOrg` vs `resolveSpeaker`/`resolveExtra`

Funções separadas por motivo: `assertEventInOrg` toma `eventId` já
conhecido (caminho create). `resolveSpeaker` toma `speakerId` e
descobre o `eventId` via FK reversa + verifica org. Resultado de
`resolveSpeaker` é o `eventId` necessário para o `revalidatePath` e
`redirect`. Mesma forma do `resolveEventDate` já existente.

### 4.5. `KIND_ORDER` no `ExtrasPanel`, não no DB

A ordem em que os tipos aparecem no select é uma decisão de UX
(gerador é o mais frequente; "outro" último como fallback). Não é
um atributo do dado — está hardcoded no componente cliente. Se a
ordem mudar amanhã, é troca de 1 array, sem migration.

### 4.6. Total monetário soma só itens com preço

`extras.reduce((sum, x) => x.unitPriceCents == null ? sum : sum +
x.unitPriceCents * x.qty, 0)` — ignora itens sem preço ao invés de
tratá-los como zero. Razão: preço opcional significa "ainda não
cotado/negociado", não "grátis". Mostrar `R$ 0,00` num item sem
cotação induziria a erro de orçamento. Total no header só aparece
quando pelo menos um item tem preço.

---

## 5. Trade-offs e limitações

1. **Performance da listagem `/events` com muitas OS oversold ativas:**
   Hoje O(N) queries. Mitigar com batch single-query quando ficar
   relevante.

2. **`event_extras.unit_price_cents` é `bigint`:** suporta valores
   absurdos mas não converte para BRL no banco. Frontend assume cents
   e divide por 100. Sem moeda explícita (todo o app é BRL hoje).

3. **CASCADE delete dos auxiliares:** apagar OS apaga speakers + extras
   sem aviso. Não há lixeira nem soft delete. Decisão deliberada:
   estes dados não fazem sentido sem a OS pai.

4. **Sem reordenação drag-and-drop:** `position` existe mas a UI
   apenas preserva — não há handle para reordenar. Inserção sequencial
   mantém ordem natural.

5. **`isChecklistComplete` não considera speakers/extras:** speakers
   e extras são informacionais, não fazem parte do gate de promoção
   para `ready_to_load`. Se virar requisito, adicionar manualmente ao
   `promoteToReadyToLoad`.

6. **Bulk toggle não cobre edit:** `EditEquipmentSheet` permite
   editar nome/marca/modelo/categoria/`has_variants`/notas, mas não
   permite trocar `type` entre serializado e bulk. Decisão correta —
   trocar tipo é destrutivo (unidades vs bulk_inventory).

7. **`InventorySheet` bulk + `has_variants=true` deixa `bulk_inventory`
   vazio:** o equipamento é criado sem nenhuma linha de estoque.
   Usuário deve cadastrar variantes em seguida (toast direciona).
   Página de detalhe mostra aviso "Este lote ainda não tem estoque
   cadastrado." quando bulk sem variantes nem bulk_inventory.

---

## 6. Pendências

1. **F1b — `event_attachments`:** layout LED, rider, mapa palco,
   cronograma. Precisa configurar bucket Supabase Storage + signed
   URLs. Custo separado.

2. **F2 — restante das tabelas auxiliares** (sob demanda):
   `event_led_panel`, `event_venue_info`, `event_critical_points`,
   `event_transport` (parcial — `events.vehicle` já existe),
   `event_lodging`, `event_meals`, `event_load_dock`.

3. **Refactor G — check-in por unidade:** o E2E do refactor E
   identificou SKIP no cenário 4.1 (avaria por unidade). A UI atual
   é batch toggle; não rastreia avaria individual. Discussão de UX
   pendente.

4. **Otimização single-query do `getEventsWithInsufficientStock`:**
   quando passar de ~100 OS ativas, refatorar para uma única query
   agregada.

5. **Reordenação drag-and-drop de speakers/extras:** se houver demanda.

6. **Permissão tests no E2E (cenários 2.6, 4.2):** ambiente atual não
   tem segundo usuário/org. Setup de fixtures multi-user fica como
   chore de QA.

---

## 7. Como aplicar e testar

### Migração

```bash
# Opção A — CLI
supabase db push

# Opção B — Studio
# Cole o conteúdo de supabase/migrations/20260518_000014_event_speakers_and_extras.sql
# no SQL Editor do Supabase Studio. Idempotência: NÃO. A migration
# cria tabelas e enum do zero. Se rodar duas vezes, erro de "already exists".
```

### Tests

```bash
npx vitest run        # 69 PASS / 1 SKIP / 0 FAIL
npx tsc --noEmit      # zero output (limpo)
```

### Smoke E2E manual (resumido)

1. `/inventory → Novo Item → toggle "Em lote"` → preenche `unit`/qty.
2. `/inventory/<id>` confirma card de estoque + `BulkAdjustDialog`.
3. Cria 2 OS competindo pelo mesmo equipamento → confirma badge
   "Estoque Insuficiente" em `/events`.
4. `/inventory/<id-do-equipamento-disputado>` mostra ambas OS na
   seção "Em uso por OS".
5. `/events/<id>` → tab "Convidados & Extras" → CRUD speakers e
   extras (full E2E em 17 PASS / 3 SKIP / 0 FAIL conforme reportado).

### E2E completo

Ver prompt original na conversa de teste — 27 cenários cobrindo refactors
B, D, E + os ajustes deste docs.

---

## 8. Histórico

| Commit | Escopo |
|---|---|
| `56a2673` | feat(inventory): expose bulk type toggle in InventorySheet + bulk stock card on detail page |
| `3d8b078` | feat(events): badge 'Estoque insuficiente' inline na listagem de OS |
| `69a132e` | feat(inventory): rastreabilidade reversa — OSes alocando equipamento no detail |
| `31a0aeb` | test(team): match URL-encoded redirect strings emitted by actions |
| `c366b85` | feat(events): refactor F1a — event_speakers + event_extras |

Branch: `main` (já em `origin/main`).
Migration: `20260518_000014_event_speakers_and_extras.sql`.
