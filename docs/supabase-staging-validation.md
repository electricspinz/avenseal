# Supabase Staging Validation

Date: 2026-07-23

## Scope

This document records the staging validation checkpoint for Avenseal's Supabase project after migrations `0001` through `0009` were pushed to the dedicated staging project.

No production database was used or modified.

## Safety Boundary

Live Supabase integration tests now require an explicit local staging marker:

```bash
LIVE_SUPABASE_ENVIRONMENT=staging
```

This variable is intentionally separate from Supabase credentials. Its purpose is to prevent integration tests from running against an ambiguous or production-like endpoint merely because Supabase keys are present in `.env.local`.

The variable is documented in `.env.example`; real values belong only in ignored local or deployment-specific environment configuration.

The staging seed command also requires the same marker and fails closed without it:

```bash
pnpm seed:staging
```

Required ignored environment variables for the seed:

- `LIVE_SUPABASE_ENVIRONMENT=staging`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_DEMO_EMAIL`
- `ADMIN_DEMO_PASSWORD`
- `STAGING_STAFF_DEMO_EMAIL`
- `STAGING_STAFF_DEMO_PASSWORD`

Do not store staging credential values in GitHub Actions, committed source files, or documentation.

## Confirmed Locally

- The repository is linked to a Supabase project whose local metadata classifies as staging.
- `.env.local` remains ignored by Git.
- `supabase/.temp/` remains ignored by Git.
- The local `.env.local` contains staging Supabase credentials by name, without exposing values.
- No raw project reference, URL, key, token, database password, or customer information is recorded here.

## Migration Alignment

`supabase migration list` was run after the staging push. The local and remote migration-history columns aligned for:

- `0001`
- `0002`
- `0003`
- `0004`
- `0005`
- `0006`
- `0007`
- `0008`
- `0009`

Migration `0009` was the only pending migration and was applied once to staging.

## Migration 0009 Appointment Snapshots

Migration `0009_appointment_service_snapshots.sql` adds the service reference plus immutable
booking-time name, duration, integer-cent price, and currency snapshots to
`appointment_requests`.

- Existing appointments are backfilled only for organizations with exactly one active service.
- Ambiguous historical rows remain nullable and retain the documented legacy duration fallback.
- The tenant-safe composite foreign key uses `ON DELETE RESTRICT`.
- Snapshot completeness, duration, price, and currency constraints are active.
- A write trigger derives snapshot values from an active, remote, bookable service and rejects
  direct snapshot edits while the assigned service is unchanged.
- Explicit service reassignment refreshes all snapshots in one appointment update.

## Migration 0008 Expected Schema

Migration `0008_google_oauth_connections.sql` creates the Google OAuth foundation:

- `google_oauth_states`
- `google_oauth_connections`
- `google_oauth_states_org_user_idx`
- `google_oauth_states_active_idx`
- `google_oauth_connections_org_status_idx`
- `touch_google_oauth_connections` trigger

Expected integrity rules:

- `google_oauth_states.organization_id` references `organizations(id)` with cascade delete.
- `google_oauth_states.user_id` references `user_profiles(id)` with cascade delete.
- `google_oauth_states.state_hash` is unique.
- `google_oauth_states.redirect_path` rejects unsafe redirect paths.
- `google_oauth_states.expires_at` and `used_at` support expiration and one-time state consumption.
- `google_oauth_connections.organization_id` references `organizations(id)` with cascade delete.
- `google_oauth_connections.provider` is constrained to `google`.
- `google_oauth_connections.status` is constrained to `connected`, `disconnected`, `reconnect_required`, or `error`.
- `google_oauth_connections` is unique by `(organization_id, provider)`.
- Refresh-token ciphertext, IV, and tag must be present or absent as a complete triplet.
- Access-token ciphertext, IV, and tag must be present or absent as a complete triplet.
- Connected, reconnect-required, and error rows require encrypted refresh-token material.

Expected RLS behavior:

- RLS is enabled on both OAuth tables.
- No permissive browser-readable policies are added.
- Public, anonymous, authenticated non-admin, and authenticated admin browser clients cannot directly read or write either OAuth table.
- Server routes use service-role access only after application-level organization authorization.

## Integration-Test Coverage Added

`tests/integration/live-supabase.test.ts` now checks the Google OAuth tables using synthetic, non-secret values:

- Service-role can create a synthetic OAuth state row.
- Service-role can create a synthetic OAuth connection row.
- Anonymous, authenticated non-admin, and authenticated admin browser clients see no OAuth rows.
- Anonymous, authenticated non-admin, and authenticated admin browser clients cannot write OAuth rows.
- Unsafe redirect paths are rejected.
- Duplicate state hashes are rejected.
- Incomplete token encryption triplets are rejected.
- Connected rows without refresh-token material are rejected.
- Invalid providers are rejected.
- Duplicate `(organization_id, provider)` connection rows are rejected.
- Synthetic organizations, users, OAuth states, and OAuth connections are removed in `finally` blocks.

The integration suite also requires seeded staging Auth fixtures:

- one active owner/admin-compatible user, configured through `ADMIN_DEMO_EMAIL` and `ADMIN_DEMO_PASSWORD`
- one active staff user, configured through `STAGING_STAFF_DEMO_EMAIL` and `STAGING_STAFF_DEMO_PASSWORD`

The users are created or updated through the Supabase Auth Admin API with deterministic email confirmation enabled. Matching `user_profiles` and `organization_users` rows are upserted idempotently.

## Staging Seed Fixtures

`pnpm seed:staging` creates or repairs these synthetic fixtures only:

- Avenseal staging organization with slug from `DEFAULT_ORGANIZATION_SLUG`, defaulting to `avenseal`
- active organization status
- business settings with staging-safe contact placeholders
- primary availability schedule
- Monday-Friday 9:30 AM-6:00 PM availability intervals
- appointment rule settings with 30-minute default duration and manual approval
- active remote online notarization service
- disconnected/test integration placeholders
- communication and AI concierge settings
- active owner membership for the configured staging admin Auth user
- active staff membership for the configured staging staff Auth user

The seed is idempotent and uses upsert operations. It does not copy production data and does not delete unrelated staging records.

## Root Cause

`supabase db push` applied migrations only. It did not run the repository's seed SQL files, and the SQL seed files cannot create Supabase Auth users safely.

The fresh staging project therefore had schema through `0008`, but it lacked expected public-table fixtures and Auth-backed organization memberships. The live integration suite failed until staging had:

- business settings
- weekday availability intervals
- appointment rule settings
- active owner/admin Auth user and organization membership
- active staff Auth user and organization membership

## Latest Validation Results

After running `pnpm seed:staging`, the live integration suite completed successfully against staging.

Latest command results:

- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm test`: passed, 90 unit tests
- `pnpm seed:staging`: passed
- `pnpm seed:staging` second run: passed, confirming idempotency
- `pnpm test:integration`: passed, 12 live staging tests
- `E2E_PORT=3100 pnpm test:e2e`: passed, 10 desktop/mobile tests
- `pnpm build`: passed

The first E2E attempt found that the admin appointment-list test depended on another parallel test creating an appointment first. The E2E test now creates its own synthetic booking through the public booking API before asserting the admin list state.

## Staging Data Review

A staging customer-data review still needs to be run from an environment that can reach the staging Supabase API or database. The review must not print customer rows. It should only report aggregate results, such as:

- number of `customers` rows
- number of `appointment_requests` rows
- whether any customer email or phone values look like real production/customer data
- whether all synthetic test rows use obvious staging markers such as `LIVE_`, `TEST_`, or `example.invalid`

Do not run this review against production.

## Google OAuth Readiness

Staging is structurally prepared for Google OAuth live testing once the staging data review confirms no recognizable production/customer data is present.

Before running Google OAuth:

1. Confirm the staging Supabase link still classifies as staging.
2. Confirm migration history still aligns through `0009`.
3. Confirm `LIVE_SUPABASE_ENVIRONMENT=staging`.
4. Configure the Google test OAuth client variables in ignored local or staging environment configuration.
5. Do not configure the deprecated static `GOOGLE_CALENDAR_ACCESS_TOKEN` for the OAuth live test.
