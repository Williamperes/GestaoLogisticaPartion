-- ──────────────────────────────────────────────────────────────────
-- PARTION — Migration 011: Montagem/Desmontagem como hora-de-parede
--
-- Os campos `assembly_at` e `teardown_at` representam o horário NO
-- LOCAL do evento ("Montagem: 27/02 14:00 na hora do venue"), não um
-- instante absoluto no tempo. Como o input HTML `datetime-local` não
-- envia timezone, manter o tipo `timestamptz` causava interpretação
-- equivocada (UTC) e exibição deslocada (UTC-3 → -3h na tela).
--
-- A correção é trocar o tipo para `timestamp without time zone` e
-- extrair o wall-clock UTC do que já foi armazenado (que reflete
-- exatamente o que o usuário digitou, antes da conversão).
-- ──────────────────────────────────────────────────────────────────

alter table public.events
  alter column assembly_at type timestamp without time zone
    using assembly_at at time zone 'UTC',
  alter column teardown_at type timestamp without time zone
    using teardown_at at time zone 'UTC';
