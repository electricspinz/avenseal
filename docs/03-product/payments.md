# Payments Foundation and Center

**Status:** Provider-neutral read-only foundation. No payment action, provider integration, migration, or checkout flow is introduced here.

Payments are derived from existing tenant-scoped appointment payment records and displayed through the Payments Center. The staff-facing model contains an immutable payment identity, appointment/customer relationship, amount in integer minor units, USD currency, purpose, persisted status, safe lifecycle dates, and safe source context.

## Contracts

### Booking payment obligations

When an appointment is persisted, the repository creates one tenant-scoped payment obligation from the immutable appointment service snapshot. Amount and currency are server-derived integer minor units; browser input and Stripe availability do not influence obligation creation. The existing unique appointment/status boundary plus repository lookup make the operation idempotent and preserve paid or processor-linked records. Stripe Checkout is created later, only by the existing payment-request workflow.

Checkout creation updates that same obligation. A usable, unexpired stored Checkout link is reused; otherwise the repository replaces the processor references on the existing row rather than inserting another obligation. Paid and refund-terminal records are never reset. Older appointments receive the same obligation through the repository fallback. The legacy `payment_link_created` label currently represents both a pre-Checkout obligation and a Checkout-ready payment; its naming is deferred technical debt.

Amounts use integer minor units (`amountMinor`), never floating-point dollars. Current records support USD and the semantic `appointment_fee` purpose. Existing persisted statuses are retained: link created, processing, paid, failed, expired, refunded, partially refunded, and disputed. Provider IDs, checkout URLs, payment tokens, and raw errors are intentionally excluded.

Identity is deterministic from organization, customer, appointment, and purpose. The same logical appointment fee has a stable identity while different organizations, appointments, or purposes do not collide.

## Query and UI

The server-side payment query calls the existing repository appointment and payment read boundaries. It remains tenant scoped through those repository calls and supports status, customer, appointment, safe search, sort, and bounded limits. The Payments Center and detail page are strictly read-only, with customer and appointment links. Missing safe fields display `Not recorded`.

## Timeline and dashboard relationship

`timelineFromPayment` maps the supported payment record lifecycle to safe Customer Timeline drafts with payment ID, customer/appointment context, correlation when available, and constrained amount/currency metadata. It does not record provider data. Mission Control does not show a payment summary yet because the current dashboard read model has no reliable organization-wide payment aggregate; future work must add one before rendering counts.

## Deferred work

Provider adapters, card entry, hosted checkout, payment links, refund execution, tax/invoices, webhooks, persistence changes, workers, queues, and automation are out of scope.
