# Google OAuth Live Validation Report

Date: 2026-07-22

## Scope

This report tracks the first controlled Google OAuth validation pass for the Avenseal integration foundation merged in PR #4.

The validation scope is intentionally limited to OAuth connection setup, encrypted token storage boundaries, callback handling, disconnect/reconnect behavior, and tenant/role isolation. Calendar availability, event creation, booking synchronization, Google Meet creation, and production data access are out of scope.

## Safety Result

Live database mutation and live OAuth execution were not performed in this pass.

Reason: the repository has Supabase linked-project metadata, but it classified as production-like. The current validation brief only authorizes local, staging, development, sandbox, or temporary test Supabase environments for the first live OAuth test. No safe local or staging Supabase target was confirmed before the mutation checkpoint.

## Repository Checkpoint

- PR #4 status: merged.
- Local `main`: synced with `origin/main` before this branch was created.
- Validation branch: `chore/google-oauth-live-validation`.
- Worktree before report creation: clean.
- Google OAuth implementation: present on `main`.
- Migration `supabase/migrations/0008_google_oauth_connections.sql`: present on `main`.

## Migration 0008 Static Verification

The migration defines:

- `google_oauth_states`
- `google_oauth_connections`
- `google_oauth_states_org_user_idx`
- `google_oauth_states_active_idx`
- `google_oauth_connections_org_status_idx`
- `touch_google_oauth_connections` trigger

Security and integrity properties verified statically:

- Both OAuth tables include `organization_id`.
- OAuth state records include `user_id`, `state_hash`, `expires_at`, and `used_at`.
- `state_hash` is unique.
- Active OAuth state lookup is indexed by `state_hash` and `expires_at` where `used_at is null`.
- OAuth connections are unique by `(organization_id, provider)`.
- Provider is constrained to `google`.
- Status is constrained to `connected`, `disconnected`, `reconnect_required`, or `error`.
- Refresh-token and access-token ciphertext/IV/tag values are constrained as complete triplets.
- Connected, reconnect-required, and error states require encrypted refresh-token material.
- RLS is enabled on both OAuth tables.
- No browser-readable RLS policies are created for credential-bearing OAuth tables.

Database checks not executed:

- Applying migration `0008`.
- Verifying live columns, constraints, indexes, triggers, and RLS flags through SQL.
- Verifying anonymous and authenticated client denial against live tables.
- Verifying invalid row rejection against live constraints.

## Environment Variables Checked

Confirmed by name only:

- `NEXT_PUBLIC_SUPABASE_URL`: set locally.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: set locally.
- `SUPABASE_SERVICE_ROLE_KEY`: set locally.
- `ADMIN_SESSION_SECRET`: set locally.
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: generated locally because it was missing.

Missing for live OAuth:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`

Deprecated variable status:

- `GOOGLE_CALENDAR_ACCESS_TOKEN`: not set locally.

Secret-safety checks:

- `.env.local` is ignored by Git.
- `supabase/.temp/` is ignored by Git.
- No secret values were printed in this report.
- No secrets were committed.

## Google Cloud Test Project Checklist

Before live OAuth can be executed, create or verify a Google Cloud OAuth client in a test project:

1. Configure OAuth consent for the controlled test account.
2. Add an OAuth client for the local or staging application.
3. Add authorized redirect URI:
   - `http://localhost:3000/api/admin/integrations/google/callback` for local testing, or
   - the staging equivalent ending in `/api/admin/integrations/google/callback`.
4. Configure `.env.local` with:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI`
   - `GOOGLE_TOKEN_ENCRYPTION_KEY`
5. Do not configure `GOOGLE_CALENDAR_ACCESS_TOKEN` for this OAuth validation.

Requested scopes in code:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/calendar.freebusy`

## Live Test Steps Deferred

Run these only against a confirmed local, staging, development, sandbox, or temporary test Supabase project:

1. Apply `supabase/migrations/0008_google_oauth_connections.sql`.
2. Verify the OAuth tables, indexes, constraints, trigger, and RLS status through SQL.
3. Sign in as an Avenseal owner or administrator.
4. Open `/admin/settings/integrations`.
5. Start Google OAuth through `/api/admin/integrations/google/connect`.
6. Complete Google consent in the test Google Cloud project.
7. Confirm redirect to `/admin/settings/integrations?google=connected`.
8. Confirm one organization-scoped `google_oauth_connections` row exists.
9. Confirm token columns contain encrypted material only.
10. Confirm no raw provider tokens, OAuth codes, token hashes, or client secrets are rendered or logged.
11. Confirm an `integration.google.connected` audit log exists.
12. Test denial flow from Google and confirm no connection row is created.
13. Test replayed state and expired state handling.
14. Test tenant and role isolation.
15. Disconnect the connection and confirm token material is cleared.
16. Reconnect and confirm the single organization/provider row is updated, not duplicated.
17. Force token refresh only in the safe test environment, then verify refresh timestamp and encrypted access-token rotation.

## Current Recommendation

Do not run first live Google OAuth validation against the currently linked Supabase project. Create or link a clearly named local/staging/test Supabase project, apply migration `0008` there, configure the Google test OAuth client, then repeat the live validation checklist.
