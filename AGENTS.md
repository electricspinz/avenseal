# Avenseal Engineering Guide

This guide is for Codex agents and human developers modifying this repository. It describes the repository as it exists now and sets required practices for future changes.

## 1. Project Overview

Avenseal is a Next.js application for a Florida remote online notary appointment business. The current product lets customers request remote online notarization appointments, lets admins review and manage those requests, and provides foundations for Stripe payments, Gmail SMTP email, secure customer appointment portals, and future SaaS-style multi-tenant organization support.

Primary user types:

- Public customers requesting a remote online notary appointment.
- Admin users who review appointments, manage customers, create payment links, and update organization settings.
- Future organization members for SaaS-style independent notary organizations.

Major product surfaces:

- Public website routes including `/`, `/how-it-works`, `/pricing`, `/faq`, `/contact`, `/privacy`, and `/terms`.
- Conversational booking flow at `/book` and booking confirmation at `/booking/confirmation`.
- Secure customer appointment portal at `/appointments/access/[token]` and status-link request page at `/appointments/status`.
- Admin login and dashboard under `/admin`.
- API routes under `/api` for booking, availability, admin actions, status links, payment redirects, and Stripe webhooks.

Current development stage:

- Milestone 1 public booking/admin foundation exists.
- Sprint 2 organization configuration exists.
- Milestone 3 integration foundations exist for Stripe, Google Calendar data boundaries, and transactional email records.
- Gmail SMTP is implemented with Nodemailer.
- Multi-tenant organization normalization exists in `supabase/migrations/0007_multi_tenant_organization_normalization.sql`.

## 2. Technology Stack

- Framework/runtime: Next.js App Router, React 19, Node.js. CI uses Node `22.13.0` because `pnpm@11.13.1` requires Node 22.13 or newer.
- TypeScript: strict mode is enabled in `tsconfig.json`; module resolution is `bundler`; path alias `@/*` resolves from the repository root.
- Package manager: pnpm, pinned by `packageManager` as `pnpm@11.13.1`.
- Styling/UI: Tailwind CSS, shared components in `components/`, `clsx`, and `lucide-react` icons.
- Supabase: PostgreSQL, Auth, RLS, and future file-storage boundary. Server-side service-role access is centralized through `lib/supabase/server.ts`.
- Stripe: Checkout Session creation and webhook signature verification live under `lib/milestone3/stripe.ts` and `lib/server/repository.ts`.
- Email: Gmail SMTP via Nodemailer in `lib/server/email.ts`; email delivery can be `sent`, `failed`, or `skipped`.
- Validation: Zod schemas in `lib/validation.ts`.
- Tests: Vitest for unit/integration tests; Playwright for E2E tests.
- CI: `.github/workflows/ci.yml` runs checkout, pnpm setup, Node setup with pnpm cache, install, typecheck, lint, unit tests, and build on pushes to `main`, PRs targeting `main`, and manual dispatch. Permissions are limited to `contents: read`.

## 3. Repository Structure

- `app/`: Next.js App Router pages, layouts, route handlers, and API endpoints.
- `components/`: Shared React UI components. Client components are marked with `"use client"`.
- `lib/`: Domain logic, validation, availability logic, server services, Supabase helpers, types, and utilities.
- `lib/server/`: Server-only repository, auth, email, rate-limit, organization, and dev fallback code. Do not import these from browser components.
- `lib/milestone3/`: Stripe, pricing, calendar, email subject, and policy helpers for Milestone 3 integration boundaries.
- `supabase/migrations/`: SQL migrations. Treat deployed migrations as append-only.
- `supabase/seed/`: Seed data for Avenseal and integration foundations.
- `tests/unit/`: Unit tests run by `pnpm test`.
- `tests/integration/`: Live Supabase integration/RLS tests run by `pnpm test:integration`; these require configured Supabase credentials and skip or branch explicitly when live prerequisites are absent.
- `tests/e2e/`: Playwright browser tests run by `pnpm test:e2e`.
- `docs/`: Product architecture, page map, visual concept, database proposal, implementation plans, and milestone notes.
- `types/`: Ambient type declarations such as `types/nodemailer.d.ts`.

Architectural boundaries to preserve:

- API routes validate request bodies before calling repository methods.
- `lib/server/repository.ts` is the main persistence/workflow boundary.
- `lib/server/organization.ts` owns default organization resolution and membership role checks.
- Supabase service-role credentials and Stripe/Gmail secrets stay server-side.
- Public pages and client components should not directly use privileged server clients.

## 4. Required Development Workflow

- Start from an updated branch. For substantive work, prefer a branch and pull request instead of direct work on `main`.
- Inspect the relevant route, component, server service, migration, and tests before editing.
- Keep changes focused; avoid unrelated formatting or opportunistic refactors.
- Run validation before committing.
- Do not conceal failing checks. Report the exact failing command and likely cause.
- Do not push secrets, `.env.local`, generated build output, `test-results`, `playwright-report`, `.next`, `node_modules`, Supabase temp files, or TypeScript build info.
- Preserve user data and tenant isolation. Do not run destructive database operations without explicit approval.

## 5. Required Validation Commands

Use the scripts exactly as defined in `package.json`:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Minimum local validation for most code changes:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Run `pnpm test:integration` for Supabase, RLS, auth, tenant isolation, repository, or live integration changes. Run `pnpm test:e2e` for user-flow, routing, browser, or responsive UI changes.

## 6. TypeScript and Coding Standards

- Avoid `any`. If it is unavoidable, keep it narrow and explain why.
- Prefer explicit domain types from `lib/types.ts` and validation-derived types from `lib/validation.ts`.
- Validate external input with Zod before using it.
- Sanitize free text through existing utilities such as `sanitizeText`.
- Handle errors intentionally and return customer-safe messages from public routes.
- Avoid duplicated business logic. Reuse availability, pricing, policy, organization, repository, and validation helpers.
- Follow existing imports using the `@/` alias.
- Do not weaken TypeScript, ESLint, or tests just to make checks pass.

## 7. Next.js and React Standards

- Follow the App Router structure already under `app/`.
- Keep server components server-side by default; use `"use client"` only for interactive components.
- Keep secrets, service-role Supabase clients, Stripe secret keys, SMTP credentials, and privileged workflows server-side.
- Avoid unnecessary client state. Use server data fetching where possible and client state only for interaction.
- Preserve accessibility: labeled form controls, semantic headings, keyboard navigation, focus states, and useful status/error messages.
- Reuse existing components such as `Button`, `ButtonLink`, `Brand`, `PublicShell`, `AdminShell`, `StatusBadge`, and existing form patterns before adding alternatives.
- Avoid hydration and serialization issues: pass only serializable props from server components to client components.

## 8. Supabase and Database Standards

- Treat migrations as append-only after deployment. Do not edit an applied migration to change production behavior; create a new migration.
- Include defaults, backfills, indexes, foreign keys, and RLS updates in schema changes.
- Preserve multi-tenant organization boundaries. Every tenant-owned table should include and enforce `organization_id`.
- Scope tenant-owned queries to the intended organization. Public Avenseal flows should resolve the default organization through `lib/server/organization.ts`.
- RLS is expected on business-owned tables. Reuse helper functions such as `user_org_ids()`, `can_manage_org()`, `is_organization_member()`, and `has_organization_role()` where applicable.
- Avoid destructive SQL and data deletion without explicit approval and a recovery plan.
- Never put `SUPABASE_SERVICE_ROLE_KEY` or service-role clients in browser code.

## 9. Multi-Tenancy Requirements

Current tenant model:

- `organizations` represents tenants.
- `organization_users` represents membership and role assignment.
- `organization_memberships` is a security-invoker compatibility view over `organization_users`.
- Roles currently include `owner`, `admin`, `notary`, and `staff`.
- Organization resolution for public Avenseal flows uses `DEFAULT_ORGANIZATION_SLUG`, defaulting to `avenseal`.

Requirements:

- Organization ownership and management permissions must be checked server-side.
- Owner/admin roles can manage organization-wide settings; lower-privilege roles must not be granted broad write access unless explicitly designed and tested.
- All tenant data access must be scoped by `organization_id`.
- Prevent cross-tenant reads and writes in application code and RLS.
- Add or update authorization and tenant-isolation tests for permission-sensitive changes.

## 10. Authentication and Authorization

- Admin login uses Supabase Auth when Supabase config is present, then checks organization membership/role server-side.
- Without Supabase service config, the app can use development fallback credentials and store for local workflow verification.
- Authentication proves user identity; authorization determines what that user can access. Keep these concerns separate.
- Enforce permissions in route handlers, repository methods, Supabase policies, or server-only helpers. Never rely only on hidden UI elements.
- Admin session signing is implemented in `lib/server/admin-auth.ts` and middleware protects admin pages/API routes.

## 11. Security Standards

- Never commit secrets or real credentials.
- Never expose privileged tokens to client components, browser logs, rendered HTML, or public API responses.
- Validate and sanitize untrusted input.
- Verify Stripe webhook signatures before processing webhook payloads.
- Avoid logging credentials, access tokens, token hashes, private documents, government ID details, customer-sensitive notes, or payment identifiers unless explicitly safe and necessary.
- Use least-privilege access. Prefer anon clients for user-scoped Supabase checks and service-role clients only in server-only code.
- Flag security-sensitive changes for additional review.

## 12. Stripe and Billing Standards

- Preserve webhook idempotency. `payment_events.provider_event_id` is unique and should remain the duplicate-processing guard.
- Treat Stripe as the source of truth for successful payment events while keeping local payment and appointment state synchronized.
- Verify webhook signatures with `STRIPE_WEBHOOK_SECRET`.
- Do not trust client-submitted prices, currencies, payment status, or subscription status.
- Payment metadata should keep appointment and organization ownership explicit.
- Do not create duplicate active payment links for one appointment. Reuse existing unexpired payment links where current repository behavior does so.
- Keep Stripe secret keys server-side only.

## 13. Testing Requirements

- Add or update tests when behavior changes.
- Test tenant isolation, roles, and permission-sensitive behavior.
- Test important failure paths, not only happy paths.
- Avoid replacing meaningful assertions with broad snapshots.
- Do not delete or skip tests merely to make CI pass.
- Identify tests requiring external services. `pnpm test:integration` uses live Supabase when required environment variables are present. `pnpm test:e2e` starts a local Next server unless `E2E_SKIP_WEB_SERVER` is set.

## 14. Database Migration Checklist

For each migration, check:

- Backward compatibility with existing app code during rollout.
- Defaults and nullability for new columns.
- Existing-row backfills.
- Indexes for common lookup paths.
- Foreign keys and delete behavior.
- Tenant isolation through `organization_id`.
- RLS enabled and policies updated.
- Service-role versus user-role behavior.
- Idempotency concerns for seeds and repeated development application.
- Rollback or recovery considerations, especially for destructive or enum changes.

## 15. UI and Accessibility Standards

- Preserve keyboard navigation.
- Use semantic HTML, labels, headings, and ARIA only where helpful.
- Maintain readable color contrast within the current Avenseal visual system.
- Provide meaningful loading, empty, success, and error states.
- Reuse Tailwind tokens/classes and current design-system components.
- Ensure responsive behavior on desktop and mobile.
- Keep admin surfaces focused and operational; avoid unnecessary decorative layout changes.

## 16. Git and Pull-Request Standards

- Use descriptive commits.
- Avoid unrelated formatting changes.
- Keep generated and temporary files out of Git.
- Summarize files changed and validation performed in PRs or final reports.
- Clearly disclose remaining warnings or failures.
- Never force-push to `main`.
- Prefer pull requests for substantive features, database changes, auth changes, payment changes, and security-sensitive work.

## 17. Definition of Done

A task is complete only when:

- Requirements are implemented.
- Relevant tests are added or updated.
- `pnpm typecheck` passes.
- `pnpm lint` passes.
- Relevant tests pass.
- `pnpm build` passes.
- Documentation is updated when needed.
- No secrets or unintended files are included.
- Remaining risks, warnings, skipped live checks, or external-service limitations are disclosed.

## 18. Prohibited Shortcuts

Do not:

- Disable lint or TypeScript checks without explicit approval.
- Use broad authorization bypasses.
- Weaken RLS to fix access problems.
- Hardcode credentials, tokens, or secrets.
- Silently swallow errors that should be surfaced or audited.
- Delete tests to pass CI.
- Edit unrelated files.
- Introduce duplicate frameworks or libraries without clear justification.
- Make destructive production database changes without explicit approval.
