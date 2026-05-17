-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 009: Separação + Carregamento de Equipamento
--
-- A OS física tem duas conferências sequenciais para cada item:
--   1. SEPARADO  — almoxarifado tirou da prateleira (área de carga)
--   2. CARREGADO — equipe colocou no veículo (checkout)
--
-- Antes existia apenas `confirmed`, que representava o passo 2.
-- Agora:
--   - `confirmed` é renomeada para `loaded` (semântica clara)
--   - novas colunas `loaded_at`, `loaded_by` registram auditoria
--   - novas colunas `separated`, `separated_at`, `separated_by`
--     adicionam o passo anterior
--
-- Backfill: rows que já estavam `confirmed=true` ganham
-- `separated=true` implicitamente (não há como carregar sem separar).
-- ──────────────────────────────────────────────────────────────────

alter table public.event_equipment
  rename column confirmed to loaded;

alter table public.event_equipment
  add column loaded_at timestamptz,
  add column loaded_by uuid references auth.users (id) on delete set null,
  add column separated boolean not null default false,
  add column separated_at timestamptz,
  add column separated_by uuid references auth.users (id) on delete set null;

-- Backfill: tudo que já estava loaded também passa a ser separated.
update public.event_equipment
   set separated = true
 where loaded = true
   and separated = false;

create index event_equipment_separated_idx
  on public.event_equipment (separated);

create index event_equipment_loaded_idx
  on public.event_equipment (loaded);
