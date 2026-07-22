# Avenseal Product Architecture

## Repository Status

The workspace is currently empty and is not a Git repository. There is no existing application scaffold, package manager configuration, database migration history, design system, or deployment setup to preserve.

## Product Scope

Avenseal Milestone 1 launches Avenseal's own Florida remote online notary operating business. The application should optimize a first-time customer path from need to same-day appointment request in under three minutes.

Version 1 includes remote online notarization appointment requests only. It does not include mobile notary services, property-watch services, payments, email/SMS automation, Google Calendar availability, BlueNotary API integration, OpenAI integration, or SaaS tenant administration.

## Core Experience

- Public website communicates the immediate customer offer and drives booking.
- Conversational booking flow collects only administrative intake data.
- Confirmation state sets expectations and preparation guidance.
- Admin area lets Avenseal staff review, manage, and audit appointment requests.
- Supabase stores operational data with RLS enabled and a future-ready organization boundary.

## Technical Stack

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- Supabase PostgreSQL, authentication, and future storage
- Zod for server-side and client-side schema validation
- React Hook Form where form state warrants it
- Vitest for unit tests
- Playwright for end-to-end tests
- pnpm package management
- Vercel-compatible deployment

## Service Boundaries

Milestone 1 should define interfaces without integrating external providers:

- `AppointmentRepository`: create, read, update appointment requests and related records.
- `AvailabilityRepository`: read sample availability rules and exceptions.
- `AdminAuthService`: Supabase-backed admin sessions and role checks.
- `AuditService`: append-only administrative event records.
- `NotificationService`: no-op implementation for future email/SMS.
- `PaymentService`: no-op implementation for future Stripe.
- `NotaryPlatformService`: no-op implementation for future BlueNotary handoff.
- `CalendarService`: database-backed sample availability now, future Google Calendar adapter.

## Compliance Boundaries

The app must not:

- Provide legal advice.
- Interpret documents.
- Select notarial acts.
- Select or complete notarial certificates.
- Assess signer competency.
- Guarantee identity verification or successful notarization.
- Claim AI performs notarization.
- Claim Avenseal is a law firm.
- Collect Social Security numbers, full ID numbers, ID images, bank data, or document contents.

Use this language where context requires it:

> A commissioned notary will review your request and make all notarial determinations during the session.

## Security Model

- Public routes can submit validated appointment requests through server actions or route handlers.
- Public submission endpoints require rate limiting.
- Admin routes require Supabase authentication and membership in `organization_users`.
- Every business-owned table includes `organization_id`.
- RLS is enabled on all business-owned tables.
- Public inserts are limited to appointment request creation through controlled functions or policies.
- Admin mutations create audit records and status history entries.
- Secrets stay server-side.
- Free-text fields are trimmed, length-limited, and sanitized before storage.

