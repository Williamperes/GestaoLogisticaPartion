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
