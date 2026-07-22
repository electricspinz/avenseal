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

1. Organization timezone.
2. Weekly operating hours.
3. Schedule exceptions.
4. Appointment rules.
5. Existing active Avenseal appointments.
6. Active payment reservations.
7. Google Calendar busy intervals.
8. Appointment duration and buffers.
9. Final safe public slots.

Calendar events are created only after successful payment confirmation. Calendar records are stored in `calendar_event_mappings`.

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
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_CALENDAR_ACCESS_TOKEN`
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
