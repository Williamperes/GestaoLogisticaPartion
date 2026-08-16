-- PARTION — Políticas do perfil Funcionário para Eventos/OS e Manutenção

-- Evento principal: funcionário cria e edita, mas events_delete permanece admin-only.
alter policy "events_insert" on public.events
with check ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role])));

alter policy "events_update" on public.events
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role])))
with check ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role])));

-- Checklist da OS.
alter policy "event_checklist_items_insert" on public.event_checklist_items
with check (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

alter policy "event_checklist_items_update" on public.event_checklist_items
using (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role, 'employee'::public.app_role]))
))
with check (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role, 'employee'::public.app_role]))
));

-- Equipamentos associados à OS.
alter policy "event_equipment_insert" on public.event_equipment
with check (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role, 'employee'::public.app_role]))
));

alter policy "event_equipment_update" on public.event_equipment
using (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role, 'employee'::public.app_role]))
))
with check (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role, 'employee'::public.app_role]))
));

alter policy "event_equipment_delete" on public.event_equipment
using (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

-- Datas da OS.
alter policy "event_dates_insert" on public.event_dates
with check (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

alter policy "event_dates_update" on public.event_dates
using (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
))
with check (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

alter policy "event_dates_delete" on public.event_dates
using (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

-- Escala por data.
alter policy "event_date_team_members_insert" on public.event_date_team_members
with check (exists (
  select 1 from public.event_dates ed
  join public.events e on e.id = ed.event_id
  where ed.id = event_date_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

alter policy "event_date_team_members_update" on public.event_date_team_members
using (exists (
  select 1 from public.event_dates ed
  join public.events e on e.id = ed.event_id
  where ed.id = event_date_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
))
with check (exists (
  select 1 from public.event_dates ed
  join public.events e on e.id = ed.event_id
  where ed.id = event_date_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

alter policy "event_date_team_members_delete" on public.event_date_team_members
using (exists (
  select 1 from public.event_dates ed
  join public.events e on e.id = ed.event_id
  where ed.id = event_date_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

-- Palestrantes.
alter policy "event_speakers_insert" on public.event_speakers
with check (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

alter policy "event_speakers_update" on public.event_speakers
using (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
))
with check (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

alter policy "event_speakers_delete" on public.event_speakers
using (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

-- Extras.
alter policy "event_extras_insert" on public.event_extras
with check (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

alter policy "event_extras_update" on public.event_extras
using (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
))
with check (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

alter policy "event_extras_delete" on public.event_extras
using (exists (
  select 1 from public.events e
  where e.id = event_id
    and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'employee'::public.app_role]))
));

-- Funcionário pode fechar ocorrências, sempre na própria organização.
alter policy "equipment_maintenance_update" on public.equipment_maintenance
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role, 'employee'::public.app_role])))
with check ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'warehouse'::public.app_role, 'employee'::public.app_role])));
