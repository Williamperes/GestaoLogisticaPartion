-- Material acrescentado pelo almoxarifado depois da liberação da OS.
-- As RPCs abaixo mantêm autorização, disponibilidade, carga e auditoria
-- dentro da mesma transação PostgreSQL.

alter table public.event_equipment
  add column extra_qty integer not null default 0,
  add column extra_reason text,
  add column extra_added_by uuid references auth.users(id) on delete set null,
  add column extra_added_at timestamptz,
  add column bulk_loaded_qty integer not null default 0,
  add column bulk_returned_qty integer not null default 0,
  add constraint event_equipment_extra_qty_check check (extra_qty >= 0 and extra_qty <= qty),
  add constraint event_equipment_bulk_counts_check check (
    bulk_returned_qty >= 0 and
    bulk_returned_qty <= bulk_loaded_qty and
    bulk_loaded_qty <= qty
  );

create table public.event_equipment_extra_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_equipment_id uuid not null references public.event_equipment(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  variant_id uuid references public.equipment_variants(id) on delete restrict,
  equipment_unit_id uuid references public.equipment_units(id) on delete restrict,
  qty integer not null check (qty > 0),
  reason text not null check (length(btrim(reason)) > 0),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index event_equipment_extra_log_event_created_idx
  on public.event_equipment_extra_log (event_id, created_at desc);

create index event_equipment_extra_log_event_equipment_idx
  on public.event_equipment_extra_log (event_equipment_id);

alter table public.event_equipment_extra_log enable row level security;

create policy "event_equipment_extra_log_select"
on public.event_equipment_extra_log for select to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_id
      and (select public.is_member_of(e.organization_id))
  )
);

-- Exclusiva às RPCs desta migration. O lock da OS estabiliza status e
-- organização durante toda a operação.
create or replace function public.assert_warehouse_event_access(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org_id uuid;
  event_state public.event_status;
begin
  if auth.uid() is null then
    raise exception 'EXTRA_NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select e.organization_id, e.status
    into org_id, event_state
  from public.events e
  where e.id = target_event_id
  for update;

  if not found then
    raise exception 'EXTRA_FORBIDDEN' using errcode = 'P0001';
  end if;

  if not public.has_org_role(org_id, array['warehouse'::public.app_role]) then
    raise exception 'EXTRA_FORBIDDEN' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.team_members tm
    join public.event_date_team_members edtm on edtm.team_member_id = tm.id
    join public.event_dates ed on ed.id = edtm.event_date_id
    where tm.user_id = auth.uid()
      and tm.organization_id = org_id
      and ed.event_id = target_event_id
  ) then
    raise exception 'EXTRA_FORBIDDEN' using errcode = 'P0001';
  end if;

  if event_state not in (
    'ready_to_load'::public.event_status,
    'in_field'::public.event_status
  ) then
    raise exception 'EXTRA_EVENT_STATE' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.assert_warehouse_event_access(uuid) from public;

create or replace function public.register_extra_serialized_material(
  p_event_id uuid,
  p_equipment_unit_id uuid,
  p_reason text
)
returns table (
  event_equipment_id uuid,
  equipment_id uuid,
  equipment_unit_id uuid,
  qty integer,
  extra_qty integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_reason text := btrim(p_reason);
  org_id uuid;
  unit_equipment_id uuid;
  unit_variant_id uuid;
  unit_status public.equipment_status;
  equipment_status public.equipment_status;
  ee_id uuid;
  current_qty integer;
  current_extra_qty integer;
  loaded_count integer;
begin
  perform public.assert_warehouse_event_access(p_event_id);

  if clean_reason is null or clean_reason = '' then
    raise exception 'EXTRA_REASON_REQUIRED' using errcode = 'P0001';
  end if;

  select e.organization_id
    into org_id
  from public.events e
  where e.id = p_event_id;

  select u.equipment_id, u.variant_id, u.status, e.status
    into unit_equipment_id, unit_variant_id, unit_status, equipment_status
  from public.equipment_units u
  join public.equipment e on e.id = u.equipment_id
  where u.id = p_equipment_unit_id
    and e.organization_id = org_id
    and e.type = 'serialized'::public.equipment_type
  for update of u;

  if not found
     or unit_status in ('maintenance'::public.equipment_status, 'inactive'::public.equipment_status)
     or equipment_status in ('maintenance'::public.equipment_status, 'inactive'::public.equipment_status) then
    raise exception 'EXTRA_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- Repetir o mesmo QR na mesma OS é idempotente.
  select ee.id, ee.qty, ee.extra_qty
    into ee_id, current_qty, current_extra_qty
  from public.event_equipment_units eeu
  join public.event_equipment ee on ee.id = eeu.event_equipment_id
  where ee.event_id = p_event_id
    and eeu.equipment_unit_id = p_equipment_unit_id
    and eeu.loaded_at is not null
  order by ee.created_at
  limit 1;

  if found then
    return query
    select ee_id, unit_equipment_id, p_equipment_unit_id, current_qty, current_extra_qty;
    return;
  end if;

  if exists (
    select 1
    from public.event_equipment_units eeu
    join public.event_equipment ee on ee.id = eeu.event_equipment_id
    join public.events other_event on other_event.id = ee.event_id
    where eeu.equipment_unit_id = p_equipment_unit_id
      and other_event.id <> p_event_id
      and other_event.status not in (
        'cancelled'::public.event_status,
        'completed'::public.event_status
      )
      and eeu.loaded_at is not null
      and eeu.returned_at is null
  ) then
    raise exception 'EXTRA_UNIT_CONFLICT' using errcode = 'P0001';
  end if;

  select ee.id, ee.qty, ee.extra_qty
    into ee_id, current_qty, current_extra_qty
  from public.event_equipment ee
  where ee.event_id = p_event_id
    and ee.equipment_id = unit_equipment_id
    and ee.variant_id is not distinct from unit_variant_id
  order by ee.created_at
  limit 1
  for update;

  if found then
    update public.event_equipment ee
    set qty = ee.qty + 1,
        extra_qty = ee.extra_qty + 1,
        extra_reason = clean_reason,
        extra_added_by = auth.uid(),
        extra_added_at = timezone('utc', now())
    where ee.id = ee_id
    returning ee.qty, ee.extra_qty
      into current_qty, current_extra_qty;
  else
    insert into public.event_equipment as inserted_ee (
      event_id,
      equipment_id,
      variant_id,
      qty,
      extra_qty,
      extra_reason,
      extra_added_by,
      extra_added_at,
      separated,
      separated_at,
      separated_by,
      loaded,
      loaded_at,
      loaded_by
    ) values (
      p_event_id,
      unit_equipment_id,
      unit_variant_id,
      1,
      1,
      clean_reason,
      auth.uid(),
      timezone('utc', now()),
      true,
      timezone('utc', now()),
      auth.uid(),
      true,
      timezone('utc', now()),
      auth.uid()
    )
    returning inserted_ee.id, inserted_ee.qty, inserted_ee.extra_qty
      into ee_id, current_qty, current_extra_qty;
  end if;

  insert into public.event_equipment_units (
    event_equipment_id,
    equipment_unit_id,
    loaded_at,
    loaded_by,
    returned_at,
    returned_by
  ) values (
    ee_id,
    p_equipment_unit_id,
    timezone('utc', now()),
    auth.uid(),
    null,
    null
  )
  on conflict (event_equipment_id, equipment_unit_id)
  do update set
    loaded_at = excluded.loaded_at,
    loaded_by = excluded.loaded_by,
    returned_at = null,
    returned_by = null;

  insert into public.event_equipment_extra_log (
    event_id,
    event_equipment_id,
    equipment_id,
    variant_id,
    equipment_unit_id,
    qty,
    reason,
    added_by
  ) values (
    p_event_id,
    ee_id,
    unit_equipment_id,
    unit_variant_id,
    p_equipment_unit_id,
    1,
    clean_reason,
    auth.uid()
  );

  select count(*)::integer
    into loaded_count
  from public.event_equipment_units eeu
  where eeu.event_equipment_id = ee_id
    and eeu.loaded_at is not null;

  update public.event_equipment ee
  set separated = loaded_count >= ee.qty,
      separated_at = case when loaded_count >= ee.qty then coalesce(ee.separated_at, timezone('utc', now())) else null end,
      separated_by = case when loaded_count >= ee.qty then coalesce(ee.separated_by, auth.uid()) else null end,
      loaded = loaded_count >= ee.qty,
      loaded_at = case when loaded_count >= ee.qty then coalesce(ee.loaded_at, timezone('utc', now())) else null end,
      loaded_by = case when loaded_count >= ee.qty then coalesce(ee.loaded_by, auth.uid()) else null end
  where ee.id = ee_id
  returning ee.qty, ee.extra_qty
    into current_qty, current_extra_qty;

  return query
  select ee_id, unit_equipment_id, p_equipment_unit_id, current_qty, current_extra_qty;
end;
$$;

revoke execute on function public.register_extra_serialized_material(uuid, uuid, text) from public;
grant execute on function public.register_extra_serialized_material(uuid, uuid, text) to authenticated;

create or replace function public.register_extra_bulk_material(
  p_event_id uuid,
  p_equipment_id uuid,
  p_variant_id uuid,
  p_qty integer,
  p_reason text
)
returns table (
  event_equipment_id uuid,
  equipment_id uuid,
  qty integer,
  extra_qty integer,
  bulk_loaded_qty integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_reason text := btrim(p_reason);
  org_id uuid;
  inventory_total integer;
  equipment_org_id uuid;
  equipment_kind public.equipment_type;
  allocated_qty integer;
  ee_id uuid;
  current_qty integer;
  current_extra_qty integer;
  current_bulk_loaded_qty integer;
begin
  perform public.assert_warehouse_event_access(p_event_id);

  if clean_reason is null or clean_reason = '' then
    raise exception 'EXTRA_REASON_REQUIRED' using errcode = 'P0001';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'EXTRA_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select e.organization_id
    into org_id
  from public.events e
  where e.id = p_event_id;

  select bi.total_qty, e.organization_id, e.type
    into inventory_total, equipment_org_id, equipment_kind
  from public.bulk_inventory bi
  join public.equipment e on e.id = bi.equipment_id
  where bi.equipment_id = p_equipment_id
    and bi.variant_id is not distinct from p_variant_id
  for update of bi;

  if not found
     or equipment_kind <> 'bulk'::public.equipment_type
     or equipment_org_id <> org_id then
    raise exception 'EXTRA_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select coalesce(
    sum(
      case
        when ee.returned_at is not null then 0
        else ee.qty - ee.bulk_returned_qty
      end
    ),
    0
  )::integer
    into allocated_qty
  from public.event_equipment ee
  join public.events active_event on active_event.id = ee.event_id
  where ee.equipment_id = p_equipment_id
    and ee.variant_id is not distinct from p_variant_id
    and active_event.organization_id = org_id
    and active_event.status in (
      'planning'::public.event_status,
      'ready_to_load'::public.event_status,
      'in_field'::public.event_status
    )
    and exists (
      select 1
      from public.event_dates target_date
      join public.event_dates active_date on active_date.date = target_date.date
      where target_date.event_id = p_event_id
        and active_date.event_id = active_event.id
    );

  if allocated_qty + p_qty > inventory_total then
    raise exception 'EXTRA_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select ee.id, ee.qty, ee.extra_qty, ee.bulk_loaded_qty
    into ee_id, current_qty, current_extra_qty, current_bulk_loaded_qty
  from public.event_equipment ee
  where ee.event_id = p_event_id
    and ee.equipment_id = p_equipment_id
    and ee.variant_id is not distinct from p_variant_id
  order by ee.created_at
  limit 1
  for update;

  if found then
    update public.event_equipment ee
    set qty = ee.qty + p_qty,
        extra_qty = ee.extra_qty + p_qty,
        bulk_loaded_qty = ee.bulk_loaded_qty + p_qty,
        extra_reason = clean_reason,
        extra_added_by = auth.uid(),
        extra_added_at = timezone('utc', now())
    where ee.id = ee_id
    returning ee.qty, ee.extra_qty, ee.bulk_loaded_qty
      into current_qty, current_extra_qty, current_bulk_loaded_qty;
  else
    insert into public.event_equipment as inserted_ee (
      event_id,
      equipment_id,
      variant_id,
      qty,
      extra_qty,
      extra_reason,
      extra_added_by,
      extra_added_at,
      bulk_loaded_qty,
      separated,
      separated_at,
      separated_by,
      loaded,
      loaded_at,
      loaded_by
    ) values (
      p_event_id,
      p_equipment_id,
      p_variant_id,
      p_qty,
      p_qty,
      clean_reason,
      auth.uid(),
      timezone('utc', now()),
      p_qty,
      true,
      timezone('utc', now()),
      auth.uid(),
      true,
      timezone('utc', now()),
      auth.uid()
    )
    returning inserted_ee.id, inserted_ee.qty, inserted_ee.extra_qty,
              inserted_ee.bulk_loaded_qty
      into ee_id, current_qty, current_extra_qty, current_bulk_loaded_qty;
  end if;

  insert into public.event_equipment_extra_log (
    event_id,
    event_equipment_id,
    equipment_id,
    variant_id,
    qty,
    reason,
    added_by
  ) values (
    p_event_id,
    ee_id,
    p_equipment_id,
    p_variant_id,
    p_qty,
    clean_reason,
    auth.uid()
  );

  return query
  select ee_id, p_equipment_id, current_qty, current_extra_qty, current_bulk_loaded_qty;
end;
$$;

revoke execute on function public.register_extra_bulk_material(uuid, uuid, uuid, integer, text) from public;
grant execute on function public.register_extra_bulk_material(uuid, uuid, uuid, integer, text) to authenticated;

create or replace function public.return_bulk_material(
  p_event_id uuid,
  p_event_equipment_id uuid,
  p_qty integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  loaded_qty integer;
  returned_qty integer;
  new_returned_qty integer;
begin
  perform public.assert_warehouse_event_access(p_event_id);

  if p_qty is null or p_qty <= 0 then
    raise exception 'EXTRA_RETURN_RANGE' using errcode = 'P0001';
  end if;

  select ee.bulk_loaded_qty, ee.bulk_returned_qty
    into loaded_qty, returned_qty
  from public.event_equipment ee
  join public.equipment e on e.id = ee.equipment_id
  where ee.id = p_event_equipment_id
    and ee.event_id = p_event_id
    and e.type = 'bulk'::public.equipment_type
  for update of ee;

  if not found then
    raise exception 'EXTRA_RETURN_RANGE' using errcode = 'P0001';
  end if;

  new_returned_qty := returned_qty + p_qty;
  if new_returned_qty < 0 or new_returned_qty > loaded_qty then
    raise exception 'EXTRA_RETURN_RANGE' using errcode = 'P0001';
  end if;

  update public.event_equipment ee
  set bulk_returned_qty = new_returned_qty
  where ee.id = p_event_equipment_id;

  return new_returned_qty;
end;
$$;

revoke execute on function public.return_bulk_material(uuid, uuid, integer) from public;
grant execute on function public.return_bulk_material(uuid, uuid, integer) to authenticated;

create or replace function public.unreturn_bulk_material(
  p_event_id uuid,
  p_event_equipment_id uuid,
  p_qty integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  loaded_qty integer;
  returned_qty integer;
  new_returned_qty integer;
begin
  perform public.assert_warehouse_event_access(p_event_id);

  if p_qty is null or p_qty <= 0 then
    raise exception 'EXTRA_RETURN_RANGE' using errcode = 'P0001';
  end if;

  select ee.bulk_loaded_qty, ee.bulk_returned_qty
    into loaded_qty, returned_qty
  from public.event_equipment ee
  join public.equipment e on e.id = ee.equipment_id
  where ee.id = p_event_equipment_id
    and ee.event_id = p_event_id
    and e.type = 'bulk'::public.equipment_type
  for update of ee;

  if not found then
    raise exception 'EXTRA_RETURN_RANGE' using errcode = 'P0001';
  end if;

  new_returned_qty := returned_qty - p_qty;
  if new_returned_qty < 0 or new_returned_qty > loaded_qty then
    raise exception 'EXTRA_RETURN_RANGE' using errcode = 'P0001';
  end if;

  update public.event_equipment ee
  set bulk_returned_qty = new_returned_qty
  where ee.id = p_event_equipment_id;

  return new_returned_qty;
end;
$$;

revoke execute on function public.unreturn_bulk_material(uuid, uuid, integer) from public;
grant execute on function public.unreturn_bulk_material(uuid, uuid, integer) to authenticated;
