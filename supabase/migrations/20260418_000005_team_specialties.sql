create table public.team_specialties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index team_specialties_organization_id_slug_key
  on public.team_specialties (organization_id, slug);

create index team_specialties_organization_id_idx
  on public.team_specialties (organization_id);

create trigger team_specialties_set_updated_at
before update on public.team_specialties
for each row
execute function public.set_updated_at();

alter table public.team_specialties enable row level security;

create policy "team_specialties_select_member_orgs"
on public.team_specialties
for select
to authenticated
using ((select public.is_member_of(organization_id)));

insert into public.team_specialties (organization_id, name, slug)
select distinct source.organization_id, source.name, source.slug
from (
  select tm.organization_id, 'Som'::text as name, 'sound'::text as slug
  from public.team_members tm

  union all

  select tm.organization_id, 'Iluminacao'::text as name, 'light'::text as slug
  from public.team_members tm

  union all

  select tm.organization_id, 'Imagem'::text as name, 'image'::text as slug
  from public.team_members tm

  union all

  select o.id as organization_id, 'Som'::text as name, 'sound'::text as slug
  from public.organizations o
  where o.type = 'internal'

  union all

  select o.id as organization_id, 'Iluminacao'::text as name, 'light'::text as slug
  from public.organizations o
  where o.type = 'internal'

  union all

  select o.id as organization_id, 'Imagem'::text as name, 'image'::text as slug
  from public.organizations o
  where o.type = 'internal'
) as source
on conflict (organization_id, slug) do nothing;

alter table public.team_members
  add column specialty_id uuid references public.team_specialties (id) on delete restrict;

update public.team_members tm
set specialty_id = ts.id
from public.team_specialties ts
where ts.organization_id = tm.organization_id
  and ts.slug = tm.specialty::text
  and tm.specialty_id is null;

alter table public.team_members
  alter column specialty_id set not null;

create index team_members_specialty_id_idx
  on public.team_members (specialty_id);

drop index if exists team_members_specialty_idx;

alter table public.team_members
  drop column specialty;

drop type if exists public.team_specialty;
