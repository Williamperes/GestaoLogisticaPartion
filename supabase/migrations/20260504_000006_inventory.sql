-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 006: Inventário Híbrido
-- ──────────────────────────────────────────────────────────────────

create type public.equipment_type as enum ('serialized', 'bulk');

create type public.equipment_status as enum (
  'available',
  'reserved',
  'in_field',
  'maintenance',
  'inactive'
);

-- Categorias de equipamento por organização
create table public.equipment_categories (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name           text not null,
  created_at     timestamptz not null default timezone('utc', now()),
  updated_at     timestamptz not null default timezone('utc', now()),
  unique (organization_id, name)
);

create index equipment_categories_organization_id_idx
  on public.equipment_categories (organization_id);

create trigger equipment_categories_set_updated_at
before update on public.equipment_categories
for each row
execute function public.set_updated_at();

-- Definição do equipamento (serializado ou lote)
create table public.equipment (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  category_id      uuid references public.equipment_categories (id) on delete set null,
  name             text not null,
  brand            text,
  model            text,
  type             public.equipment_type not null,
  -- Para serializados: status é derivado das units; para lote: status do lote inteiro
  status           public.equipment_status not null default 'available',
  -- Metadados compartilhados
  notes            text,
  -- Para serializado: serial da definição (ex: modelo base); null para lote
  serial           text,
  patrimony        text,
  purchase_date    date,
  purchase_value_cents integer,
  -- QR code gerado (URL ou token)
  qr_code          text,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now())
);

create index equipment_organization_id_idx
  on public.equipment (organization_id);

create index equipment_type_idx
  on public.equipment (type);

create index equipment_status_idx
  on public.equipment (status);

create trigger equipment_set_updated_at
before update on public.equipment
for each row
execute function public.set_updated_at();

-- Unidades individuais (apenas para equipment.type = 'serialized')
create table public.equipment_units (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  serial       text not null,
  patrimony    text,
  status       public.equipment_status not null default 'available',
  qr_code      text,
  notes        text,
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now())
);

create index equipment_units_equipment_id_idx
  on public.equipment_units (equipment_id);

create index equipment_units_status_idx
  on public.equipment_units (status);

create trigger equipment_units_set_updated_at
before update on public.equipment_units
for each row
execute function public.set_updated_at();

-- Controle de lote (apenas para equipment.type = 'bulk')
create table public.bulk_inventory (
  id            uuid primary key default gen_random_uuid(),
  equipment_id  uuid not null unique references public.equipment (id) on delete cascade,
  unit          text not null default 'unidades',  -- 'metros', 'peças', etc.
  total_qty     integer not null default 0 check (total_qty >= 0),
  available_qty integer not null default 0 check (available_qty >= 0),
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now()),
  constraint bulk_inventory_available_lte_total check (available_qty <= total_qty)
);

create trigger bulk_inventory_set_updated_at
before update on public.bulk_inventory
for each row
execute function public.set_updated_at();

-- ──────── RLS ────────

alter table public.equipment_categories enable row level security;
alter table public.equipment enable row level security;
alter table public.equipment_units enable row level security;
alter table public.bulk_inventory enable row level security;

-- Categorias: leitura por membros, escrita por operações+
create policy "equipment_categories_select"
on public.equipment_categories for select to authenticated
using ((select public.is_member_of(organization_id)));

create policy "equipment_categories_insert"
on public.equipment_categories for insert to authenticated
with check ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role])));

create policy "equipment_categories_update"
on public.equipment_categories for update to authenticated
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role])));

-- Equipment
create policy "equipment_select"
on public.equipment for select to authenticated
using ((select public.is_member_of(organization_id)));

create policy "equipment_insert"
on public.equipment for insert to authenticated
with check ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role])));

create policy "equipment_update"
on public.equipment for update to authenticated
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role])));

create policy "equipment_delete"
on public.equipment for delete to authenticated
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role])));

-- Equipment units — herda permissão via equipment (join)
create policy "equipment_units_select"
on public.equipment_units for select to authenticated
using (
  exists (
    select 1 from public.equipment e
    where e.id = equipment_id
      and (select public.is_member_of(e.organization_id))
  )
);

create policy "equipment_units_insert"
on public.equipment_units for insert to authenticated
with check (
  exists (
    select 1 from public.equipment e
    where e.id = equipment_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role]))
  )
);

create policy "equipment_units_update"
on public.equipment_units for update to authenticated
using (
  exists (
    select 1 from public.equipment e
    where e.id = equipment_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role]))
  )
);

-- Bulk inventory — herda via equipment
create policy "bulk_inventory_select"
on public.bulk_inventory for select to authenticated
using (
  exists (
    select 1 from public.equipment e
    where e.id = equipment_id
      and (select public.is_member_of(e.organization_id))
  )
);

create policy "bulk_inventory_insert"
on public.bulk_inventory for insert to authenticated
with check (
  exists (
    select 1 from public.equipment e
    where e.id = equipment_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role]))
  )
);

create policy "bulk_inventory_update"
on public.bulk_inventory for update to authenticated
using (
  exists (
    select 1 from public.equipment e
    where e.id = equipment_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role]))
  )
);

-- ──────── Seed de categorias padrão ────────
-- Inserido para todas as organizações internas já existentes
insert into public.equipment_categories (organization_id, name)
select o.id, cat.name
from public.organizations o
cross join (
  values ('Áudio'), ('Iluminação'), ('Imagem'), ('Cabeamento'), ('Hardware'), ('Estrutura')
) as cat(name)
where o.type = 'internal'
on conflict (organization_id, name) do nothing;
