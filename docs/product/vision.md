# Avenseal Product Vision

## Purpose

Avenseal is a multi-tenant appointment and business-operations platform for service businesses. It helps organizations publish services, manage availability, accept bookings and payments, synchronize calendars, communicate with customers, manage appointment changes, and automate repetitive administrative work.

## Direction

Avenseal will progress toward customer self-service, automated communications, business analytics, production-grade billing, configurable intake forms, AI-assisted customer support and booking, multi-provider calendar support, and multi-channel communications.

## Product principles

- Prefer booking reliability to unnecessary complexity.
- Isolate tenants by default.
- Preserve historical booking and transaction accuracy.
- Make integrations idempotent and retryable.
- Handle customer-facing failures safely and clearly.
- Use secure defaults and keep credentials server-side.
- Keep provider boundaries independent of any one vendor.
- Verify changes in staging before production rollout.
- Never invalidate a successful business transaction because a communication or integration fails.
- Deliver incremental PRs with independently testable milestones.

## Current verified capabilities

- Multi-tenant organizations, memberships, and role-aware administration.
- Configurable services and a public booking flow.
- Stripe Checkout and payment lifecycle foundations.
- Booking-time appointment service snapshots.
- Timezone-safe availability and Google Calendar FreeBusy checks.
- Organization-scoped Google OAuth, Calendar event synchronization, and Google Meet generation for remote services.
- A protected calendar-sync retry endpoint.
- Secure appointment access links.
- Staging seeding, guarded live integration testing, and desktop/mobile E2E coverage.

See [roadmap](roadmap.md) for planned capabilities and [architecture overview](../architecture/overview.md) for technical boundaries.
