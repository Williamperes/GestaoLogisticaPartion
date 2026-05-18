-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 014: event_speakers + event_extras
--
-- Refactor F1a — duas das tabelas auxiliares do §6.2 item 7 do doc
-- de contexto. Hoje essas informações vivem no campo livre
-- `events.notes` (palestrantes, fornecedores extras) com perda
-- de rastreabilidade.
--
-- `event_speakers`: palestrantes/artistas da OS com suas demandas
-- técnicas (mic, notebook, adaptador, técnico dedicado).
--
-- `event_extras`: itens que NÃO estão no inventário próprio mas
-- são contratados pra OS — gerador, box truss, tv, projetor, palco,
-- etc. Inclui fornecedor e preço opcional para cobrança/custo.
-- ──────────────────────────────────────────────────────────────────

-- ── Enum de categorias de extras ──────────────────────────────────
create type public.event_extra_kind as enum (
  'generator',
  'box_truss',
  'tv',
  'projector',
  'stage',
  'other'
);

-- ── Tabela: event_speakers ────────────────────────────────────────
create table public.event_speakers (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events (id) on delete cascade,
  name                  text not null,
  organization          text,
  needs_mic             boolean not null default false,
  needs_notebook        boolean not null default false,
  needs_adapter         boolean not null default false,
  needs_dedicated_tech  boolean not null default false,
  notes                 text,
  position              smallint not null default 0,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now())
);

create index event_speakers_event_id_idx on public.event_speakers (event_id);

create trigger event_speakers_set_updated_at
before update on public.event_speakers
for each row
execute function public.set_updated_at();

-- ── Tabela: event_extras ──────────────────────────────────────────
create table public.event_extras (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  kind              public.event_extra_kind not null,
  description       text not null,
  qty               smallint not null default 1 check (qty > 0),
  supplier          text,
  unit_price_cents  bigint,
  notes             text,
  position          smallint not null default 0,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now())
);

create index event_extras_event_id_idx on public.event_extras (event_id);

create trigger event_extras_set_updated_at
before update on public.event_extras
for each row
execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────
alter table public.event_speakers enable row level security;
alter table public.event_extras enable row level security;

-- event_speakers
create policy "event_speakers_select"
on public.event_speakers for select to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.is_member_of(e.organization_id))
  )
);

create policy "event_speakers_insert"
on public.event_speakers for insert to authenticated
with check (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

create policy "event_speakers_update"
on public.event_speakers for update to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

create policy "event_speakers_delete"
on public.event_speakers for delete to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

-- event_extras
create policy "event_extras_select"
on public.event_extras for select to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.is_member_of(e.organization_id))
  )
);

create policy "event_extras_insert"
on public.event_extras for insert to authenticated
with check (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

create policy "event_extras_update"
on public.event_extras for update to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);

create policy "event_extras_delete"
on public.event_extras for delete to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (select public.has_org_role(e.organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role]))
  )
);
