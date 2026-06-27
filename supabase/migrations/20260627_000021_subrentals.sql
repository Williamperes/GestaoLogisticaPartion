-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 021: Sublocações e Materiais de Terceiros
--
-- Controla equipamentos que entram/saem fora do inventário próprio:
--   - inbound  → item alugado DE terceiro (precisa devolver ao dono)
--   - outbound → item locado PARA um parceiro (parceiro devolve para nós)
-- Ciclo: pending → out → returned. Pode ser vinculado a uma OS (event_id).
-- ──────────────────────────────────────────────────────────────────

create type public.subrental_direction as enum ('inbound', 'outbound');

create type public.subrental_status as enum ('pending', 'out', 'returned');

create table public.subrentals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  direction        public.subrental_direction not null,
  partner_name     text not null,
  item_description text not null,
  qty              integer not null default 1 check (qty > 0),
  value_cents      integer,
  event_id         uuid references public.events (id) on delete set null,
  expected_start   date,
  expected_end     date,
  status           public.subrental_status not null default 'pending',
  out_at           timestamptz,
  returned_at      timestamptz,
  notes            text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now())
);

create index subrentals_organization_id_idx
  on public.subrentals (organization_id);

create index subrentals_status_idx
  on public.subrentals (status);

create index subrentals_event_id_idx
  on public.subrentals (event_id);

create trigger subrentals_set_updated_at
before update on public.subrentals
for each row
execute function public.set_updated_at();

-- ──────── RLS ────────
alter table public.subrentals enable row level security;

create policy "subrentals_select"
on public.subrentals for select to authenticated
using ((select public.is_member_of(organization_id)));

create policy "subrentals_insert"
on public.subrentals for insert to authenticated
with check ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'finance'::public.app_role])));

create policy "subrentals_update"
on public.subrentals for update to authenticated
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role, 'operations'::public.app_role, 'finance'::public.app_role])));

create policy "subrentals_delete"
on public.subrentals for delete to authenticated
using ((select public.has_org_role(organization_id, array['super_admin'::public.app_role, 'admin'::public.app_role])));
