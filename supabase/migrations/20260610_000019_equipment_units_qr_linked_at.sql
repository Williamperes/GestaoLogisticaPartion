-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 019: marca quando um QR próprio foi vinculado
--
-- Toda unidade nasce com um qr_code auto-gerado (PTN-UN-...). Quando a
-- pessoa vincula o adesivo QR DELA a uma unidade, registramos a data em
-- qr_linked_at. NULL = ainda usando o token gerado pelo sistema.
-- Serve para sinalizar na UI que a unidade já tem QR próprio vinculado.
-- ──────────────────────────────────────────────────────────────────

alter table public.equipment_units
  add column if not exists qr_linked_at timestamptz;

comment on column public.equipment_units.qr_linked_at is
  'Quando um QR próprio foi vinculado à unidade. NULL = token auto-gerado.';
