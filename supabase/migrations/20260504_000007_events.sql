-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 007: Eventos + Gate de Produção
-- ──────────────────────────────────────────────────────────────────

create type public.event_status as enum (
  'planning',
  'ready_to_load',
  'in_field',
  'completed',
  'cancelled'
);

-- Tabela de eventos / Ordens de Serviço
create table public.events (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  client_organization_id uuid references public.organizations (id) on delete set null,
  name                  text not null,
  venue                 text,
  city                  text,
  venue_notes           text,
  start_date            date not null,
  end_date              date not null,
  status                public.event_status not null default 'planning',
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now()),
  constraint events_end_date_gte_start_date check (end_date >= start_date)
);

create index events_organization_id_idx
  on public.events (organization_id);

create index events_status_idx
  on public.events (status);

create index events_start_date_idx
  on public.events (start_date);

create trigger events_set_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

-- Itens do checklist estratégico por evento
create table public.event_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  label      text not null,
  position   smallint not null default 0,
  done       boolean not null default false,
  done_at    timestamptz,
  done_by    uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index event_checklist_items_event_id_idx
  on public.event_checklist_items (event_id);

create trigger event_checklist_items_set_updated_at
before update on public.event_checklist_items
for each row
execute function public.set_updated_at();

-- Equipamentos vinculados ao evento
create table public.event_equipment (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  -- unit_id: preenchido apenas para itens serializados
  unit_id      uuid references public.equipment_units (id) on delete set null,
  qty          integer not null default 1 check (qty > 0),
  confirmed    boolean not null default false,
  notes        text,
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now())
);

create index event_equipment_event_id_idx
  on public.event_equipment (event_id);

create index event_equipment_equipment_id_idx
  on public.event_equipment (equipment_id);

create trigger event_equipment_set_updated_at
before update on public.event_equipment
for each row
execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────
-- TRIGGER: Gate de Produção
-- Bloqueia transição de status para 'ready_to_load' enquanto
-- existir qualquer item do checklist não concluído.
-- ──────────────────────────────────────────────────────────────────

create or replace function public.prevent_premature_ready_to_load()
returns trigger
language plpgsql
as $$
declare
  incomplete_count integer;
begin
  -- Só intercepta quando o status está sendo alterado PARA 'ready_to_load'
  if new.status = 'ready_to_load' and old.status <> 'ready_to_load' then
    select count(*)
    into incomplete_count
    from public.event_checklist_items
    where event_id = new.id
      and done = false;

    if incomplete_count > 0 then
      raise exception
        'GATE_BLOCKED: O checklist estratégico possui % item(s) pendente(s). Conclua todos antes de liberar para carga.',
        incomplete_count
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger events_gate_check
before update on public.events
for each row
execute function public.prevent_premature_ready_to_load();

-- ──────── RLS ────────

alter table public.events enable row level security;
alter table public.event_checklist_items enable row level security;
alter table public.event_equipment enable row level security;

create policy "events_select"
on public.events for select to authenticated
using ((select public.is_member_of(organization_id)));

create policy "events_insert"
on public.events for insert to authenticated
with check ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role])));

create policy "events_update"
on public.events for update to authenticated
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role])));

create policy "events_delete"
on public.events for delete to authenticated
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role])));

-- Checklist: leitura por todos, escrita por operações+
create policy "event_checklist_items_select"
on public.event_checklist_items for select to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.is_member_of(e.organization_id))
  )
);

create policy "event_checklist_items_update"
on public.event_checklist_items for update to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role]))
  )
);

create policy "event_checklist_items_insert"
on public.event_checklist_items for insert to authenticated
with check (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

-- Event equipment
create policy "event_equipment_select"
on public.event_equipment for select to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.is_member_of(e.organization_id))
  )
);

create policy "event_equipment_insert"
on public.event_equipment for insert to authenticated
with check (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role]))
  )
);

create policy "event_equipment_update"
on public.event_equipment for update to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role]))
  )
);

create policy "event_equipment_delete"
on public.event_equipment for delete to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);
