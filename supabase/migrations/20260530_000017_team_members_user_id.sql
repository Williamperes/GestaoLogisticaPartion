-- Liga ficha do técnico (team_members) à conta de login (auth.users).
-- Nullable: nem todo team_member precisa ter login (ex.: freelancer).
-- on delete set null: apagar auth.users não apaga a ficha do técnico.
alter table public.team_members
  add column user_id uuid references auth.users (id) on delete set null;

-- Garante 1:1 entre auth.users e team_member dentro de uma org.
create unique index team_members_user_id_uq
  on public.team_members (user_id)
  where user_id is not null;
