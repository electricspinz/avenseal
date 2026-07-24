# Avenseal

Milestone 1 application for Avenseal, a Florida remote online notary appointment business.

## Stack

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- Supabase PostgreSQL and Auth boundaries
- Zod validation
- Vitest
- Playwright
- pnpm

## Local Development

1. Install dependencies:

   ```bash
   pnpm install --frozen-lockfile
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Start the app:

   ```bash
   pnpm dev
   ```

Without Supabase environment variables, the app uses a development fallback store so the booking and admin workflows can be exercised locally. With `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` present, server routes use Supabase.

Environment requirements are defined in `lib/env.ts` and documented with placeholders in `.env.example`. Keep real values in `.env.local`; `.env.local` is ignored by Git and must not be committed.

Optional integrations fail closed or skip safely when unconfigured:

- Stripe Checkout is disabled unless `STRIPE_SECRET_KEY` is present.
- Stripe webhooks reject requests unless `STRIPE_WEBHOOK_SECRET` is configured and the signature verifies.
- Gmail SMTP sends only when the SMTP variables are complete and valid.
- Google Calendar availability/event creation is skipped unless the access token is configured.

CI runs without real external-service secrets. Live integration tests load `.env.local` when present and skip live Supabase checks when required test credentials are absent.

## Supabase

Apply migrations in `supabase/migrations` and seed data in `supabase/seed`.

The first organization is seeded as Avenseal with ID:

`00000000-0000-4000-8000-000000000001`

RLS is enabled on business-owned tables. Public appointment submissions should go through server routes using validated input and service-role insertion.

Sprint 2 organization configuration is added by:

- `supabase/migrations/0002_organization_configuration.sql`
- `supabase/seed/0002_avenseal_organization_configuration.sql`

After applying those files, `/admin/settings` manages business profile, business mode, hours, appointment rules, services/pricing, communications, AI concierge settings, and future integration placeholders. See `docs/06-sprint-2-organization-configuration.md`.

Milestone 3 integration foundations are added by:

- `supabase/migrations/0003_integrations_payments_email.sql`
- `supabase/seed/0003_avenseal_integrations_pricing.sql`

See `docs/07-milestone-3-integrations.md` for Google Calendar, Stripe, transactional email, payment lifecycle, refund policy, security model, and setup notes.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

## Documentation

- [Product vision](docs/product/vision.md), [roadmap](docs/product/roadmap.md), and [milestones](docs/product/milestones.md)
- [Architecture overview](docs/architecture/overview.md) and [architecture decisions](docs/architecture/decisions/README.md)
- [Development workflow](docs/engineering/development-workflow.md) and [testing strategy](docs/engineering/testing-strategy.md)
- [Technical debt backlog](docs/technical-debt/backlog.md) and [release notes](docs/product/release-notes.md)

## Deployment

Deploy to Vercel with the variables from `.env.example`. Set secrets in the hosting platform's environment-variable settings, not in source control. Supabase service-role keys, Stripe secrets, SMTP passwords, Google client secrets, webhook secrets, and access tokens must remain server-side. Only `NEXT_PUBLIC_*` variables are intentionally browser-visible.

## Legal Review

Privacy and terms pages are placeholders and must be reviewed before public launch.
