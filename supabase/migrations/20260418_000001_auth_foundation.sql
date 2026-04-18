create extension if not exists pgcrypto;

create type public.app_role as enum (
  'super_admin',
  'admin',
  'operations',
  'warehouse',
  'finance',
  'client'
);

create type public.organization_type as enum (
  'internal',
  'client',
  'vendor'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.profiles is 'Application profile for each auth user.';

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  type public.organization_type not null default 'client',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.organizations is 'Tenant container for internal teams, clients, and vendors.';

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role public.app_role not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, organization_id)
);

comment on table public.organization_members is 'Role binding between a user and an organization.';

create unique index organization_members_one_primary_per_user_idx
  on public.organization_members (user_id)
  where is_primary;

create index organization_members_user_id_idx
  on public.organization_members (user_id);

create index organization_members_organization_id_idx
  on public.organization_members (organization_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

create or replace function public.current_primary_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select om.organization_id
  from public.organization_members om
  where om.user_id = auth.uid()
    and om.is_primary
  limit 1;
$$;

create or replace function public.current_primary_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select om.role
  from public.organization_members om
  where om.user_id = auth.uid()
    and om.is_primary
  limit 1;
$$;

create or replace function public.is_member_of(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = target_organization_id
  );
$$;

create or replace function public.has_org_role(
  target_organization_id uuid,
  allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = target_organization_id
      and om.role = any(allowed_roles)
  );
$$;

grant usage on schema public to authenticated;
grant usage on schema public to anon;

grant execute on function public.current_primary_organization_id() to authenticated;
grant execute on function public.current_primary_role() to authenticated;
grant execute on function public.is_member_of(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.app_role[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "organizations_select_member_orgs"
on public.organizations
for select
to authenticated
using ((select public.is_member_of(id)));

create policy "organization_members_select_own_or_admin"
on public.organization_members
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or
  (select public.has_org_role(
    organization_id,
    array['super_admin'::public.app_role, 'admin'::public.app_role]
  ))
);
