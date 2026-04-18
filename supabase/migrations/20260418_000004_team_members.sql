create type public.team_specialty as enum (
  'sound',
  'light',
  'image'
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  specialty public.team_specialty not null,
  role text not null,
  phone text,
  email text,
  available boolean not null default true,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index team_members_organization_id_idx
  on public.team_members (organization_id);

create index team_members_specialty_idx
  on public.team_members (specialty);

create trigger team_members_set_updated_at
before update on public.team_members
for each row
execute function public.set_updated_at();

alter table public.team_members enable row level security;

create policy "team_members_select_member_orgs"
on public.team_members
for select
to authenticated
using ((select public.is_member_of(organization_id)));
