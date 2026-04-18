alter table public.organizations
  add column if not exists address text;

comment on column public.organizations.address is 'Street address for the organization.';
