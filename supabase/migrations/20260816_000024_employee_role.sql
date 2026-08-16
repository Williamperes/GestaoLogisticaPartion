-- PARTION — Novo perfil de acesso Funcionário
-- O novo valor precisa ser confirmado antes de ser referenciado por políticas.

alter type public.app_role add value if not exists 'employee';
