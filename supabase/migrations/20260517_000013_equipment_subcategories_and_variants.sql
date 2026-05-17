-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 013: Sub-buckets de categoria + variantes por tamanho
--
-- Dois recursos derivados da OS impressa real:
--
-- 1) Sub-buckets — uma categoria pode ter UMA categoria-pai. Ex: "Gaveteiro"
--    aparece dentro de "Sonorização". UI agrupa: pai → filho → equipamento.
--    Profundidade enforced em app-level (UI só permite pai sem pai), schema
--    é livre.
--
-- 2) Variantes — um equipamento pode ter N variantes (XLR 5M ≠ XLR 10M).
--    Cada variante tem estoque PRÓPRIO: serializado aponta unidades para
--    a variante via equipment_units.variant_id; bulk tem uma row em
--    bulk_inventory por variante.
--
-- Equipamentos antigos sem variantes mantêm comportamento atual via flag
-- has_variants = false (default). variant_id em equipment_units,
-- bulk_inventory e event_equipment fica NULL nestes casos.
-- ──────────────────────────────────────────────────────────────────

-- ── 1. Categorias com pai opcional ────────────────────────────────
alter table public.equipment_categories
  add column parent_category_id uuid references public.equipment_categories (id) on delete restrict;

create index equipment_categories_parent_id_idx
  on public.equipment_categories (parent_category_id);

-- ── 2. Variantes ──────────────────────────────────────────────────
create table public.equipment_variants (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  label        text not null,
  sort_value   integer,
  position     smallint not null default 0,
  notes        text,
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now()),
  unique (equipment_id, label)
);

create index equipment_variants_equipment_id_idx
  on public.equipment_variants (equipment_id);

create trigger equipment_variants_set_updated_at
before update on public.equipment_variants
for each row
execute function public.set_updated_at();

-- ── 3. Flag has_variants no equipment ─────────────────────────────
alter table public.equipment
  add column has_variants boolean not null default false;

create index equipment_has_variants_idx
  on public.equipment (has_variants) where has_variants = true;

-- ── 4. variant_id nas tabelas dependentes ─────────────────────────
alter table public.equipment_units
  add column variant_id uuid references public.equipment_variants (id) on delete restrict;

create index equipment_units_variant_id_idx
  on public.equipment_units (variant_id);

-- bulk_inventory: substitui o unique(equipment_id) por dois unique parciais.
alter table public.bulk_inventory
  drop constraint bulk_inventory_equipment_id_key;

alter table public.bulk_inventory
  add column variant_id uuid references public.equipment_variants (id) on delete restrict;

create unique index bulk_inventory_equipment_no_variant_uq
  on public.bulk_inventory (equipment_id)
  where variant_id is null;

create unique index bulk_inventory_equipment_variant_uq
  on public.bulk_inventory (equipment_id, variant_id)
  where variant_id is not null;

create index bulk_inventory_variant_id_idx
  on public.bulk_inventory (variant_id);

alter table public.event_equipment
  add column variant_id uuid references public.equipment_variants (id) on delete restrict;

create index event_equipment_variant_id_idx
  on public.event_equipment (variant_id);

-- ── 5. RLS para equipment_variants ────────────────────────────────
alter table public.equipment_variants enable row level security;

create policy "equipment_variants_select"
on public.equipment_variants for select to authenticated
using (
  exists (
    select 1 from public.equipment e
    where e.id = equipment_id
      and (select public.is_member_of(e.organization_id))
  )
);

create policy "equipment_variants_insert"
on public.equipment_variants for insert to authenticated
with check (
  exists (
    select 1 from public.equipment e
    where e.id = equipment_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

create policy "equipment_variants_update"
on public.equipment_variants for update to authenticated
using (
  exists (
    select 1 from public.equipment e
    where e.id = equipment_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

create policy "equipment_variants_delete"
on public.equipment_variants for delete to authenticated
using (
  exists (
    select 1 from public.equipment e
    where e.id = equipment_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role]))
  )
);
