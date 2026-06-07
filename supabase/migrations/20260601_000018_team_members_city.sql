-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 018: cidade do técnico em team_members
--
-- Campo opcional usado para saber a base/localização do profissional
-- (útil para alocação em eventos por região).
-- ──────────────────────────────────────────────────────────────────

alter table public.team_members
  add column if not exists city text;

comment on column public.team_members.city is 'Cidade base do técnico (opcional).';
