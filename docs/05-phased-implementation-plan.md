# Phased Implementation Plan

## Phase 0: Approval Gate

Status: blocked pending visual approval.

Tasks:

- Review generated visual concepts.
- Approve or revise public website direction.
- Approve or revise booking flow direction.
- Approve or revise admin dashboard direction.

No frontend implementation should begin before this gate is cleared.

## Phase 1: Project Scaffold

- Initialize Next.js App Router with TypeScript strict mode.
- Configure pnpm, Tailwind CSS, ESLint, Vitest, Playwright.
- Add environment variable example file.
- Add README with local development and deployment instructions.
- Add base app shell and shared design tokens from the approved concept.

## Phase 2: Database and Supabase

- Add Supabase migration files.
- Create enums, tables, indexes, triggers, seed data, and RLS policies.
- Add typed database helpers.
- Add local Supabase setup instructions.
- Add tests for validation schemas and security-sensitive helpers.

## Phase 3: Public Site

- Implement `/`, `/how-it-works`, `/pricing`, `/faq`, `/contact`, `/privacy`, `/terms`.
- Keep navigation limited to the required public links.
- Add legal-review placeholders for privacy and terms.
- Verify responsive desktop and mobile layouts.

## Phase 4: Booking Experience

- Implement `/book` progressive conversational flow.
- Add local draft persistence.
- Add Zod validation on client and server.
- Add rate-limited public submission endpoint.
- Create customer, appointment request, signer/document, consent, and initial status history records.
- Implement `/booking/confirmation`.

## Phase 5: Admin Authentication and Dashboard

- Implement Supabase admin login.
- Protect admin routes.
- Implement dashboard overview from stored data.
- Avoid fake metrics.

## Phase 6: Appointment and Customer Management

- Implement appointment list and detail.
- Implement customer list and detail.
- Add internal notes.
- Add status changes, date/time adjustment, and audit history.
- Ensure status changes create both status history and audit logs.

## Phase 7: Settings

- Implement availability rules and exceptions.
- Implement basic business settings.
- Audit setting changes.

## Phase 8: Verification

- Run linting.
- Run TypeScript checking.
- Run unit tests.
- Run Playwright end-to-end tests.
- Run production build.
- Fix material failures.
- Test browser implementation at desktop and mobile sizes.
- Compare implementation screenshots against approved visual concepts.
- Correct visual mismatches before completion.

## Definition of Done Checks

- Full booking workflow works locally.
- Booking creates real Supabase records.
- Admin can securely log in.
- Admin can review and update appointments.
- Status changes create audit-history records.
- Interface works on desktop and mobile.
- Public forms validate client-side and server-side.
- RLS is enabled and tested.
- Sensitive identification data is not collected.
- TypeScript, lint, unit tests, end-to-end tests, and production build all pass.
- Setup and deployment docs are complete.

