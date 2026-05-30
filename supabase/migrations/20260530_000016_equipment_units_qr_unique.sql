-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 016: QR code único por unidade
--
-- equipment_units.qr_code existe desde a 006 mas sem constraint.
-- Para o scan funcionar, cada código precisa resolver a UMA unidade.
-- Índice único parcial: ignora rows com qr_code NULL.
-- ──────────────────────────────────────────────────────────────────

create unique index equipment_units_qr_code_uq
  on public.equipment_units (qr_code)
  where qr_code is not null;
