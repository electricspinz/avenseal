## Summary

<!-- What changed and why? -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation
- [ ] Tests
- [ ] Infrastructure or CI
- [ ] Database migration
- [ ] Security-sensitive change

## Changes made

<!-- List important files, behavior changes, architectural changes, or notable tradeoffs. -->

## Validation

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm test:integration` when Supabase, RLS, auth, tenant isolation, repository, or live integration behavior changes
- [ ] `pnpm test:e2e` when user flows, routes, browser behavior, or responsive UI changes
- [ ] `pnpm build`

## Multi-tenancy and security

- [ ] Tenant-owned data remains scoped by `organization_id`
- [ ] Authorization is enforced server-side
- [ ] No secrets or privileged tokens are exposed
- [ ] RLS or service-role boundaries were reviewed when applicable
- [ ] Sensitive logs or customer information were not introduced

## Database changes

- [ ] Not applicable
- [ ] Migration added
- [ ] Existing-row backfill considered
- [ ] Indexes and foreign keys reviewed
- [ ] RLS policies reviewed
- [ ] Rollback or recovery considerations documented

## Screenshots or evidence

<!-- Add UI screenshots, test output, API output, migration evidence, or verification notes. -->

## Risks and follow-up

<!-- Disclose known limitations, warnings, deferred work, or follow-up tasks. -->

## Final checklist

- [ ] Change is focused
- [ ] Tests were added or updated when behavior changed
- [ ] Documentation was updated when needed
- [ ] No unrelated files are included
- [ ] Remaining failures or warnings are disclosed
- [ ] Branch is ready for CI and review
