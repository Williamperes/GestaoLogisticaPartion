-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 008: Checklist Dinâmico por Template
--
-- Substitui o checklist fixo de 5 itens por templates configuráveis
-- por organização. Cada item passa a ter section e required.
-- O gate de produção considera apenas itens required = true.
-- ──────────────────────────────────────────────────────────────────

-- Seções funcionais do checklist (mapeiam para os blocos do projeto)
create type public.checklist_section as enum (
  'strategic',
  'commercial',
  'operational'
);

-- Templates de checklist por organização
create table public.checklist_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  description     text,
  is_default      boolean not null default false,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now()),
  unique (organization_id, name)
);

create index checklist_templates_organization_id_idx
  on public.checklist_templates (organization_id);

-- Apenas um template default por organização
create unique index checklist_templates_one_default_per_org
  on public.checklist_templates (organization_id)
  where is_default = true;

create trigger checklist_templates_set_updated_at
before update on public.checklist_templates
for each row
execute function public.set_updated_at();

-- Itens do template
create table public.checklist_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates (id) on delete cascade,
  label       text not null,
  section     public.checklist_section not null default 'strategic',
  position    smallint not null default 0,
  required    boolean not null default true,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create index checklist_template_items_template_id_idx
  on public.checklist_template_items (template_id);

create trigger checklist_template_items_set_updated_at
before update on public.checklist_template_items
for each row
execute function public.set_updated_at();

-- Extensão de event_checklist_items para refletir o template aplicado
alter table public.event_checklist_items
  add column template_item_id uuid references public.checklist_template_items (id) on delete set null,
  add column section public.checklist_section not null default 'strategic',
  add column required boolean not null default true;

create index event_checklist_items_template_item_id_idx
  on public.event_checklist_items (template_item_id);

-- ──────────────────────────────────────────────────────────────────
-- Atualiza o trigger de gate: considera apenas itens required = true
-- ──────────────────────────────────────────────────────────────────
create or replace function public.prevent_premature_ready_to_load()
returns trigger
language plpgsql
as $$
declare
  incomplete_count integer;
begin
  if new.status = 'ready_to_load' and old.status <> 'ready_to_load' then
    select count(*)
    into incomplete_count
    from public.event_checklist_items
    where event_id = new.id
      and required = true
      and done = false;

    if incomplete_count > 0 then
      raise exception
        'GATE_BLOCKED: O checklist possui % item(s) obrigatório(s) pendente(s). Conclua todos antes de liberar para carga.',
        incomplete_count
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

-- ──────── RLS ────────

alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;

create policy "checklist_templates_select"
on public.checklist_templates for select to authenticated
using ((select public.is_member_of(organization_id)));

create policy "checklist_templates_insert"
on public.checklist_templates for insert to authenticated
with check (
  (select public.has_org_role(
    organization_id,
    array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]
  ))
);

create policy "checklist_templates_update"
on public.checklist_templates for update to authenticated
using (
  (select public.has_org_role(
    organization_id,
    array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]
  ))
);

create policy "checklist_templates_delete"
on public.checklist_templates for delete to authenticated
using (
  (select public.has_org_role(
    organization_id,
    array['super_admin'::public.app_role, 'admin'::public.app_role]
  ))
);

create policy "checklist_template_items_select"
on public.checklist_template_items for select to authenticated
using (
  exists (
    select 1 from public.checklist_templates t
    where t.id = template_id
      and (select public.is_member_of(t.organization_id))
  )
);

create policy "checklist_template_items_insert"
on public.checklist_template_items for insert to authenticated
with check (
  exists (
    select 1 from public.checklist_templates t
    where t.id = template_id
      and (select public.has_org_role(
        t.organization_id,
        array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]
      ))
  )
);

create policy "checklist_template_items_update"
on public.checklist_template_items for update to authenticated
using (
  exists (
    select 1 from public.checklist_templates t
    where t.id = template_id
      and (select public.has_org_role(
        t.organization_id,
        array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]
      ))
  )
);

create policy "checklist_template_items_delete"
on public.checklist_template_items for delete to authenticated
using (
  exists (
    select 1 from public.checklist_templates t
    where t.id = template_id
      and (select public.has_org_role(
        t.organization_id,
        array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]
      ))
  )
);
