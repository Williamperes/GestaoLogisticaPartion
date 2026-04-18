# Supabase Schema

Base migration for auth and tenant isolation:

- `profiles`
- `organizations`
- `organization_members`
- `app_role`
- `organization_type`

Current migration:

- [`migrations/20260418_000001_auth_foundation.sql`](</Users/yurisilveira/Desktop/partion/supabase/migrations/20260418_000001_auth_foundation.sql>)

Design goals for v1:

- Multi-tenant by `organization_id`
- One primary organization per user via `is_primary`
- App-level roles kept simple
- Real isolation enforced by RLS, not only route guards

Recommended next migrations:

1. Business tables with mandatory `organization_id`
2. Event access for client users
3. Server-side auth/session helpers
4. Middleware and layout guards by dashboard area
