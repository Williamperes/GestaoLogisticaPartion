alter table public.organizations
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists city text,
  add column if not exists state text;

comment on column public.organizations.contact_name is 'Primary contact name for client/vendor organizations.';
comment on column public.organizations.contact_email is 'Primary contact email for client/vendor organizations.';
comment on column public.organizations.contact_phone is 'Primary contact phone for client/vendor organizations.';
comment on column public.organizations.city is 'City for the organization.';
comment on column public.organizations.state is 'State/region for the organization.';
