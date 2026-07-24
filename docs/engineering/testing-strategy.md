# Testing Strategy

## Layers

- **Unit tests:** deterministic domain logic, validation, provider adapters, and failure paths. External APIs are mocked.
- **Integration tests:** Supabase schema, RLS, repositories, and tenant/role boundaries. Live tests are staging-only and guarded.
- **E2E tests:** desktop and mobile browser flows, routes, and admin/customer behavior.
- **Live provider tests:** only when a safe staging target, synthetic fixtures, explicit flags, and cleanup are available.

Use synthetic fixtures only. Clean up rows owned by tests, do not print secrets or customer data, and never use production data for testing.

## Standard commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

`pnpm test:google-calendar` and `pnpm seed:staging` are guarded staging operations; see [staging safety](staging-and-production-safety.md).
