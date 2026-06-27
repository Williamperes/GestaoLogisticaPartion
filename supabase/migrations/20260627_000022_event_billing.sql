-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 022: Faturamento por evento
--
-- Valor e status de faturamento por OS, base do histórico financeiro
-- por cliente (Gerenciamento de Clientes → faturamentos).
-- ──────────────────────────────────────────────────────────────────

create type public.invoice_status as enum ('draft', 'sent', 'paid');

alter table public.events
  add column value_cents integer,
  add column invoice_status public.invoice_status not null default 'draft';
