-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 012: Datas múltiplas por OS + escala de equipe
--
-- A OS real tem N datas (não necessariamente consecutivas), cada uma
-- com seu horário de início/término e escala de equipe diferente.
-- Exemplo (Formatura Dom Manuel):
--   28/02 — 20:00  · Ismael (operador de áudio)
--   01/03 — 12:00  · Fabrício (operador de áudio) + Henry (banda)
--
-- Modelagem:
--   - `event_dates`: uma linha por data dentro do evento.
--   - `event_date_team_members`: escala por data (FK a `team_members`
--     OU nome livre; papel via enum + slot "outro" para casos custom).
--
-- O par `events.start_date` / `events.end_date` é mantido como CACHE
-- (min/max de event_dates.date) via trigger — preserva a lógica de
-- overlap em `getEquipmentAvailability` sem refatorar consumidores.
-- ──────────────────────────────────────────────────────────────────

-- ── Enum de papéis na escala ──────────────────────────────────────
create type public.event_team_role as enum (
  'tecnico_responsavel',
  'audio',
  'luz',
  'led',
  'auxiliar',
  'comercial',
  'outro'
);

-- ── Tabela: event_dates ───────────────────────────────────────────
create table public.event_dates (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  date              date not null,
  position          smallint not null default 0,
  event_start_time  time,
  event_end_time    time,
  notes             text,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now()),
  unique (event_id, date)
);

create index event_dates_event_id_idx on public.event_dates (event_id);
create index event_dates_date_idx on public.event_dates (date);

create trigger event_dates_set_updated_at
before update on public.event_dates
for each row
execute function public.set_updated_at();

-- ── Tabela: event_date_team_members ───────────────────────────────
create table public.event_date_team_members (
  id              uuid primary key default gen_random_uuid(),
  event_date_id   uuid not null references public.event_dates (id) on delete cascade,
  team_member_id  uuid references public.team_members (id) on delete set null,
  external_name   text,
  role            public.event_team_role not null,
  custom_role     text,
  notes           text,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now()),
  constraint event_date_team_members_has_identity
    check (team_member_id is not null or external_name is not null),
  constraint event_date_team_members_custom_role_when_outro
    check (role <> 'outro' or custom_role is not null)
);

create index event_date_team_members_event_date_id_idx
  on public.event_date_team_members (event_date_id);
create index event_date_team_members_team_member_id_idx
  on public.event_date_team_members (team_member_id);

create trigger event_date_team_members_set_updated_at
before update on public.event_date_team_members
for each row
execute function public.set_updated_at();

-- ── Trigger: cache start_date/end_date em events ──────────────────
create or replace function public.sync_event_date_range()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_min date;
  v_max date;
begin
  v_event_id := coalesce(new.event_id, old.event_id);
  if v_event_id is null then
    return coalesce(new, old);
  end if;

  select min(date), max(date)
    into v_min, v_max
    from public.event_dates
    where event_id = v_event_id;

  -- Só atualiza o cache quando ainda existe ao menos 1 event_date.
  -- Se todas foram apagadas, mantém o range anterior — caso contrário
  -- as colunas (NOT NULL) ficariam impossíveis de manter.
  if v_min is not null and v_max is not null then
    update public.events
      set start_date = v_min, end_date = v_max
      where id = v_event_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger event_dates_sync_range
after insert or update or delete on public.event_dates
for each row
execute function public.sync_event_date_range();

-- ── RLS ───────────────────────────────────────────────────────────
alter table public.event_dates enable row level security;
alter table public.event_date_team_members enable row level security;

-- event_dates
create policy "event_dates_select"
on public.event_dates for select to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.is_member_of(e.organization_id))
  )
);

create policy "event_dates_insert"
on public.event_dates for insert to authenticated
with check (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

create policy "event_dates_update"
on public.event_dates for update to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

create policy "event_dates_delete"
on public.event_dates for delete to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

-- event_date_team_members
create policy "event_date_team_members_select"
on public.event_date_team_members for select to authenticated
using (
  exists (
    select 1
      from public.event_dates ed
      join public.events e on e.id = ed.event_id
      where ed.id = event_date_id
        and (select public.is_member_of(e.organization_id))
  )
);

create policy "event_date_team_members_insert"
on public.event_date_team_members for insert to authenticated
with check (
  exists (
    select 1
      from public.event_dates ed
      join public.events e on e.id = ed.event_id
      where ed.id = event_date_id
        and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

create policy "event_date_team_members_update"
on public.event_date_team_members for update to authenticated
using (
  exists (
    select 1
      from public.event_dates ed
      join public.events e on e.id = ed.event_id
      where ed.id = event_date_id
        and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

create policy "event_date_team_members_delete"
on public.event_date_team_members for delete to authenticated
using (
  exists (
    select 1
      from public.event_dates ed
      join public.events e on e.id = ed.event_id
      where ed.id = event_date_id
        and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);
