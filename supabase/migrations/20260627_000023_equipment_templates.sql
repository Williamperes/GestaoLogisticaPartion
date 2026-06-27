-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 023: Templates de equipamento (geração de OS)
--
-- Presets de equipamento por tipo de evento. Aplicar um template a uma OS
-- popula automaticamente event_equipment, pronto para conferência.
-- ──────────────────────────────────────────────────────────────────

create table public.equipment_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  notes           text,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now()),
  unique (organization_id, name)
);

create index equipment_templates_organization_id_idx
  on public.equipment_templates (organization_id);

create trigger equipment_templates_set_updated_at
before update on public.equipment_templates
for each row
execute function public.set_updated_at();

create table public.equipment_template_items (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.equipment_templates (id) on delete cascade,
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  variant_id   uuid references public.equipment_variants (id) on delete set null,
  qty          integer not null default 1 check (qty > 0),
  created_at   timestamptz not null default timezone('utc', now()),
  unique (template_id, equipment_id, variant_id)
);

create index equipment_template_items_template_id_idx
  on public.equipment_template_items (template_id);

-- ──────── RLS ────────
alter table public.equipment_templates enable row level security;
alter table public.equipment_template_items enable row level security;

create policy "equipment_templates_select"
on public.equipment_templates for select to authenticated
using ((select public.is_member_of(organization_id)));

create policy "equipment_templates_insert"
on public.equipment_templates for insert to authenticated
with check ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role])));

create policy "equipment_templates_update"
on public.equipment_templates for update to authenticated
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role])));

create policy "equipment_templates_delete"
on public.equipment_templates for delete to authenticated
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role])));

create policy "equipment_template_items_select"
on public.equipment_template_items for select to authenticated
using (
  exists (
    select 1 from public.equipment_templates t
    where t.id = template_id and (select public.is_member_of(t.organization_id))
  )
);

create policy "equipment_template_items_insert"
on public.equipment_template_items for insert to authenticated
with check (
  exists (
    select 1 from public.equipment_templates t
    where t.id = template_id
      and (select public.has_org_role(t.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

create policy "equipment_template_items_delete"
on public.equipment_template_items for delete to authenticated
using (
  exists (
    select 1 from public.equipment_templates t
    where t.id = template_id
      and (select public.has_org_role(t.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);
