-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 010: Campos operacionais e estratégicos na OS
--
-- A OS real impressa (Formatura Dom Manuel) carrega informações que
-- ainda não existiam no schema:
--   - VEÍCULO, COR DA ILUMINAÇÃO CÊNICA, MONTAGEM (data/hora), DESMONTAGEM
--   - AGÊNCIA envolvida (texto livre por ora; vira FK quando criarmos
--     a tabela `agencies`/partners)
--   - Flags de risco operacional do template estratégico:
--       CEO/diretoria presente, evento gravado, transmissão ao vivo,
--       cliente exigente, agência detalhista, montagem véspera,
--       credenciamento antecipado, horário rígido do venue.
--   - Campo de observação livre.
--
-- Todos os campos são opcionais — nenhuma migração de dados existentes
-- é necessária. Defaults para bools = false.
-- ──────────────────────────────────────────────────────────────────

alter table public.events
  add column vehicle                       text,
  add column lighting_color                text,
  add column assembly_at                   timestamptz,
  add column teardown_at                   timestamptz,
  add column agency_name                   text,
  add column notes                         text,
  add column executive_present             boolean not null default false,
  add column is_recorded                   boolean not null default false,
  add column is_livestreamed               boolean not null default false,
  add column client_demanding              boolean not null default false,
  add column agency_detailed               boolean not null default false,
  add column previous_day_assembly         boolean not null default false,
  add column requires_advance_credential   boolean not null default false,
  add column strict_venue_hours            boolean not null default false;
