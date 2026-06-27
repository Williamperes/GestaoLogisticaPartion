-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 020: Defeitos no retorno + fila de manutenção
--
-- Permite marcar a CONDIÇÃO de cada unidade no retorno (ok/danificado/
-- perdido). Itens com defeito saem de circulação automaticamente:
--   - danificado → equipment_units.status = 'maintenance'
--   - perdido    → equipment_units.status = 'inactive'
-- Ambos abrem um registro em equipment_maintenance (a "fila"), que é
-- resolvido manualmente (volta a unidade para 'available').
-- ──────────────────────────────────────────────────────────────────

create type public.unit_condition as enum ('ok', 'damaged', 'lost');

create type public.maintenance_status as enum ('open', 'resolved');

-- Condição registrada no retorno, por unidade vinculada à OS.
alter table public.event_equipment_units
  add column return_condition public.unit_condition not null default 'ok',
  add column defect_note text;

-- Fila de manutenção / ocorrências de defeito.
create table public.equipment_maintenance (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  equipment_id      uuid not null references public.equipment (id) on delete cascade,
  equipment_unit_id uuid not null references public.equipment_units (id) on delete cascade,
  event_id          uuid references public.events (id) on delete set null,
  condition         public.unit_condition not null,
  note              text,
  status            public.maintenance_status not null default 'open',
  opened_by         uuid references auth.users (id) on delete set null,
  resolved_by       uuid references auth.users (id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now())
);

create index equipment_maintenance_organization_id_idx
  on public.equipment_maintenance (organization_id);

create index equipment_maintenance_status_idx
  on public.equipment_maintenance (status);

create index equipment_maintenance_equipment_unit_id_idx
  on public.equipment_maintenance (equipment_unit_id);

create trigger equipment_maintenance_set_updated_at
before update on public.equipment_maintenance
for each row
execute function public.set_updated_at();

-- ──────── RLS ────────
alter table public.equipment_maintenance enable row level security;

create policy "equipment_maintenance_select"
on public.equipment_maintenance for select to authenticated
using ((select public.is_member_of(organization_id)));

create policy "equipment_maintenance_insert"
on public.equipment_maintenance for insert to authenticated
with check ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role])));

create policy "equipment_maintenance_update"
on public.equipment_maintenance for update to authenticated
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role])));

create policy "equipment_maintenance_delete"
on public.equipment_maintenance for delete to authenticated
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role])));
