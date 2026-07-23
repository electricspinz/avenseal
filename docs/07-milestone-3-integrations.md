# Milestone 3 Integrations

Milestone 3 introduces the first production integration layer for Avenseal:

- Google Calendar availability and event synchronization.
- Stripe hosted payment collection.
- Transactional email records and provider boundary.

BlueNotary, live Ava AI, SMS, subscription billing, and Stripe Connect onboarding remain out of scope.

## Pricing

Avenseal charges `2500` cents for one active organization service:

- Internal name: `florida_remote_online_notarial_act`
- Customer-facing name: `Remote Online Notarial Act`
- Currency: `usd`
- Default duration: `30`

Avenseal does not charge a separate technology fee, coordination fee, same-day fee, after-hours fee, weekend fee, convenience fee, or tip.

Pricing is read from `organization_services`. Checkout code must not trust browser-supplied prices.

## Payment Lifecycle

1. Customer submits booking request.
2. Appointment is created as `awaiting_review`.
3. Admin reviews and creates a payment link.
4. Appointment becomes `approved_pending_payment`.
5. A slot reservation holds the requested time until payment expiration.
6. Stripe webhook confirms payment.
7. Payment status becomes `paid`.
8. Appointment becomes `confirmed`.
9. Calendar event mapping is created.
10. Confirmation email is recorded or queued.

Payment status is stored separately from appointment status in `appointment_payments`.

## Payment Windows

Organization-specific fields on `appointment_rule_settings` define:

- Same-day payment window: 30 minutes.
- Future appointment payment window: 12 hours.

Expired payment windows release the slot by expiring/releasing `slot_reservations`.

## Calendar Lifecycle

Availability follows this pipeline:

1. Resolve the active organization and active, remote, bookable service.
2. Load the organization timezone and primary weekly schedule.
3. Apply date-specific schedule exceptions.
4. Generate candidate starts from the configured scheduling increment.
5. Require the complete service duration and appointment buffers to fit in business hours.
6. Apply same-day, minimum-notice, maximum-horizon, and daily-cap rules.
7. Exclude overlapping active Avenseal appointments and active payment reservations.
8. Read the connected primary Google Calendar with `freeBusy`.
9. Return only final safe public slots.

Calendar events are created only after successful payment confirmation. Calendar records are stored in `calendar_event_mappings`.

### Calendar-aware availability service

`lib/server/appointment-availability.ts` is the server-only scheduling boundary. It accepts an organization UUID, service UUID, local calendar date, and optional internal diagnostics flag. The configured organization timezone is authoritative; public clients cannot override it.

The service uses the selected service's duration. Existing appointment rows do not yet store a service identifier, so their blocking duration uses the organization's default appointment duration. The scheduling increment comes from the active legacy `availability_rules.slot_minutes` row for the weekday when present. It safely defaults to 30 minutes when that compatibility setting is absent.

All date/time conversion uses IANA timezone data through `@date-fns/tz`. Slots are represented as ISO timestamps with the applicable UTC offset, including across daylight-saving transitions. Conflict checks use interval overlap rather than start-time equality.

When no active Google connection exists, local Avenseal availability remains available. When a connection is marked `connected`, token refresh and decryption use the existing organization-scoped OAuth helper. If token refresh or `freeBusy` fails, the service fails closed. Public callers receive a generic temporary-unavailability response; provider and database details are not exposed.

The public endpoint is:

```text
GET /api/booking/availability?organization=avenseal&service=<service-uuid>&date=2026-07-30
```

Successful response:

```json
{
  "date": "2026-07-30",
  "timezone": "America/New_York",
  "slots": [
    {
      "startAt": "2026-07-30T14:00:00-04:00",
      "endAt": "2026-07-30T14:30:00-04:00"
    }
  ]
}
```

The endpoint resolves the organization through its public slug, validates that the service belongs to that organization, applies the public rate limiter, and returns no calendar event metadata, customer data, connection details, or internal identifiers beyond the client-supplied service identifier.

Current limitations:

- Only the connected account's primary calendar is queried.
- The booking flow uses the organization's first active service until customer service selection is introduced.
- Existing appointment requests use the organization default duration for conflict checks because they do not store `service_id`.
- This milestone reads Google Calendar availability only. It does not add Google event create, update, delete, Meet-link, or booking synchronization behavior.

Run unit and staging integration coverage with:

```bash
pnpm test
pnpm test:integration
```

Normal unit tests mock Google requests. Staging integration tests use synthetic appointments, stub Google busy data for determinism, enforce the existing staging guard, and clean up their owned fixtures.

## Google OAuth Foundation

Google Calendar OAuth is organization-scoped. Each connection belongs to exactly one `organization_id`; server routes derive that organization from the authenticated admin session and active membership, never from a browser-submitted organization id.

Configure a Google Cloud OAuth client with this authorized redirect URI:

- Local: `http://localhost:3000/api/admin/integrations/google/callback`
- Production: `https://YOUR_DOMAIN/api/admin/integrations/google/callback`

Requested scopes:

- `openid`, `email`, `profile`: verifies the connected Google account identity and email.
- `https://www.googleapis.com/auth/calendar.freebusy`: supports future availability lookups.
- `https://www.googleapis.com/auth/calendar.events`: supports future booking event creation, updates, cancellation, and Meet-link generation.

Set these server-side variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

Generate the encryption key with:

```bash
openssl rand -base64 32
```

`GOOGLE_TOKEN_ENCRYPTION_KEY` must be a base64-encoded 32-byte key. Refresh and access tokens are encrypted with AES-256-GCM before persistence in `google_oauth_connections`. Token ciphertext, IVs, tags, authorization codes, and raw provider errors must never be logged or rendered.

`GOOGLE_CALENDAR_ACCESS_TOKEN` is deprecated and should only be used as a temporary pre-OAuth development fallback for existing calendar availability behavior. New Google Calendar work should use the organization-scoped OAuth connection and token refresh service.

Disconnect marks the organization connection as disconnected, clears stored token material, and attempts provider revocation. Reconnect starts a fresh consent flow and preserves the existing refresh token only when Google omits a new one during a later consent response.

Standard unit tests mock Google network calls and do not require real Google credentials. To test with a real Google Cloud project, configure the OAuth variables in `.env.local`, sign in as an owner/admin, open `/admin/settings/integrations`, connect Google, and verify the callback returns to the integrations page with a non-sensitive status indicator.

After staging OAuth is connected, verify that the stored encrypted connection can call Google Calendar:

```bash
pnpm test:google-calendar
```

This command is staging-only. It refuses to run unless `LIVE_SUPABASE_ENVIRONMENT=staging` is configured in ignored local environment settings. It reuses the server-side Google OAuth token refresh/decryption path, performs a `freeBusy` request against the connected account's primary calendar for the next 24 hours, creates a temporary event titled `Avenseal Staging Calendar Test` approximately 48 hours in the future, verifies Google returns event metadata, and immediately deletes the temporary event. The command prints only safe stage summaries and must not log tokens, encrypted token fields, authorization headers, client secrets, or project credentials.

## Transactional Email

Email messages are recorded in `communication_messages`. Provider delivery events can be stored in `communication_delivery_events`.

Templates are intentionally concise and must not provide legal advice, expose sensitive document details, or claim Ava is a commissioned notary.

## Environment Variables

Server-only:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_CALENDAR_ACCESS_TOKEN` (deprecated fallback)
- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`

Browser-safe:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Do not expose service-role, Stripe, Google, or email-provider secrets to the browser.

Gmail SMTP uses the dedicated `appointments@avenseal.com` Google Workspace mailbox. Set `SMTP_PASSWORD` to a Google App Password; never use the mailbox's normal Google account password.

## Security Model

- Payment sessions are created server-side.
- Stripe webhook signatures are verified before processing.
- Provider event IDs are stored for idempotency.
- Integration records are organization-owned and protected by RLS.
- Owner/admin roles can manage integration and payment records.
- Staff/notary roles can read operational records but cannot mutate organization-wide integration settings.
- Public availability returns only booking-safe slot data.

## Refund and Cancellation Rules

Current policy foundation:

- More than two hours before appointment: full refund.
- Two hours or less: admin may retain $15 and refund the remainder for a $25 appointment.
- Avenseal-initiated cancellation: full refund or reschedule without additional payment.

Refunds must be server-side, tied to the original payment, recorded in `refund_records`, and audited.

## Stripe Connect Future Path

Milestone 3 uses organization-level Stripe configuration for Avenseal. Future NotaryOS organizations can migrate to Stripe Connect by adding connected-account identifiers to `organization_integrations.metadata` or a dedicated connected accounts table, then passing the account context during server-side payment and refund calls.

## Rollback Notes

Migration `0003` is forward-only. In development, rollback should use a database backup or manual cleanup of Milestone 3 tables after confirming dependent data can be removed. Seed `0003` can update service pricing and integration placeholder rows, so rerunning it can overwrite admin-edited pricing/integration labels.
