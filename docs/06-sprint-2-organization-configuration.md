# Sprint 2 Organization Configuration

Sprint 2 moves Avenseal from hardcoded business assumptions to organization-owned configuration while preserving Milestone 1 booking and admin workflows.

## Business Modes

Avenseal is stored as a `solo` organization. The supported `business_mode` values are:

- `solo`: one primary notary, one primary schedule, organization-level pricing and communication settings.
- `team`: future multiple notaries, assignment, notary-level schedules, and richer permissions.
- `enterprise`: future locations, centralized policy, reporting, custom branding, and advanced roles.

The mode is persisted on `organizations.business_mode` and validated in application input. It is not a visual label only.

## Configuration Layers

Platform-level guardrails are not editable by organizations:

- No legal advice.
- No notarial certificate selection.
- No signer competency determination.
- No claim that Ava is a commissioned notary.
- No guarantee that a document can be notarized.

Organization-level configuration includes:

- Business profile and timezone.
- Business mode.
- Weekly availability intervals.
- Appointment rules.
- Services and pricing foundations.
- Communication preferences.
- AI concierge settings.

User-level preferences are intentionally deferred.

## Database Changes

Migration `supabase/migrations/0002_organization_configuration.sql` adds:

- Organization mode/profile columns on `organizations`.
- `organization_availability_schedules`.
- `organization_availability_intervals`.
- `appointment_rule_settings`.
- `organization_services`.
- `communication_settings`.
- `ai_concierge_settings`.
- Schedule exception columns on `availability_exceptions`.
- Owner/admin-oriented RLS helper `can_manage_org`.

Seed `supabase/seed/0002_avenseal_organization_configuration.sql` configures Avenseal:

- Solo mode.
- `America/New_York`.
- Remote Online Notarization.
- Monday-Friday, 9:30 AM-6:00 PM.
- Saturday and Sunday closed.
- 30-minute appointments.
- Same-day appointments enabled.
- Manual review required.

## Permissions

Owner and admin roles can update organization-wide settings. Staff and notary roles can read organization data where appropriate but cannot update organization settings through RLS.

Server-side admin routes use the service-role client, so admin login is restricted to `owner` and `admin` organization memberships.

## Availability Calculation

The local availability pipeline implemented in Sprint 2 is:

1. Organization timezone.
2. Weekly operating intervals.
3. Organization schedule exceptions.
4. Appointment duration and buffers.
5. Available booking slots.

Future calendar conflict and appointment-capacity checks can be added after these local steps without replacing the pipeline.

## Updating Avenseal Hours

Use `/admin/settings`, section `Hours and Availability`.

The current UI supports one interval per day. The database supports multiple intervals per weekday through `organization_availability_intervals`, so split shifts can be added later.

## Future Organizations

Future organizations receive their own rows in each organization-owned settings table. There are no platform-wide hours or pricing defaults applied to every tenant.

## Deferred Integrations

These are intentionally placeholders only:

- Stripe.
- Google Calendar.
- BlueNotary.
- Twilio/SMS.
- Transactional email.
- Live Ava model calls.

## Test Commands

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run test`
- `pnpm run test:integration`
- `pnpm run test:e2e`
- `pnpm run build`

## Rollback Considerations

Migration `0002` is forward-only. If rollback is required in development, restore from a Supabase backup or manually drop Sprint 2 tables/columns after confirming no production data depends on them.
