-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 017: número de série opcional em equipment_units
--
-- Até aqui `serial` era NOT NULL. Passamos a permitir cadastrar várias
-- unidades de uma vez (por quantidade) sem exigir série em cada uma —
-- o identificador real de cada unidade continua sendo o `qr_code`
-- (único, gerado pelo sistema). A série vira metadado opcional.
-- ──────────────────────────────────────────────────────────────────

alter table public.equipment_units
  alter column serial drop not null;
