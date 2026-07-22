# Contributing to Avenseal

This guide explains the day-to-day contribution workflow. `AGENTS.md` is the authoritative engineering standard for architecture, security, testing, and definition of done.

## Prerequisites

- Node.js 22.13 or newer. CI uses Node `22.13.0`.
- pnpm from `package.json`: `pnpm@11.13.1`.
- Git and the GitHub CLI for branch and pull-request workflow.
- Environment variables based on `.env.example`; keep real values in `.env.local`.

## Local Setup

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Configure environment variables safely:

```bash
cp .env.example .env.local
```

Do not commit `.env.local` or secret values. Start the app:

```bash
pnpm dev
```

Without Supabase service configuration, the app can use the development fallback store for local workflow checks.

## Branch Workflow

Start from an updated `main`:

```bash
git checkout main
git pull --ff-only origin main
```

Create a descriptive branch. Recommended prefixes:

- `feature/`
- `fix/`
- `refactor/`
- `docs/`
- `chore/`

Never develop directly on `main`.

## Development Expectations

- Inspect existing patterns before editing.
- Keep changes focused and avoid unrelated formatting.
- Preserve organization scoping and tenant isolation.
- Add or update tests for behavior changes.
- Never commit secrets, generated files, temporary files, or local build output.

## Validation

Use the scripts that exist in `package.json`:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Run `pnpm test:integration` for Supabase, RLS, auth, tenant isolation, repository, or live integration changes. Run `pnpm test:e2e` for user flows, routes, browser behavior, or responsive UI changes.

## Commits

- Use descriptive, imperative commit messages.
- Keep each commit focused.
- Avoid unrelated formatting changes.
- Do not commit `.next`, `node_modules`, `test-results`, `playwright-report`, `.env.local`, Supabase temp files, or `*.tsbuildinfo`.

## Pull Requests

Push the feature branch and open a pull request targeting `main`:

```bash
git push -u origin <branch-name>
gh pr create --base main --head <branch-name>
```

Complete the PR template, wait for the `Quality and Build` check, resolve review conversations, and merge through GitHub only after required conditions pass. Prefer squash merge for feature branches unless there is a specific reason to rebase.

## Database and Migration Changes

- Treat deployed migrations as append-only.
- Use safe defaults and backfills for existing rows.
- Review indexes, foreign keys, RLS policies, and organization scoping.
- Do not make destructive production database changes without explicit approval and a recovery plan.

## Security-Sensitive Changes

Flag changes involving authentication, authorization, Stripe, webhooks, service-role access, customer documents, customer private information, or logging of sensitive data. Keep privileged credentials server-side only.

## Ready to Merge

A pull request is ready to merge when checks pass, tests are appropriate for the change, documentation is current, risks are disclosed, no secrets are included, and no unintended files are present.
