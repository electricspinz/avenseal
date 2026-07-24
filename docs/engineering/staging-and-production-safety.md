# Staging and Production Safety

Live Supabase tests and staging seeding require:

```text
LIVE_SUPABASE_ENVIRONMENT=staging
```

Use explicit live-test flags, safe recipient configuration, synthetic fixtures, provider sandbox/test modes, and cleanup. Verify migration alignment before and after staging changes. Test webhooks only against safe endpoints and credentials.

Production is not a development test environment. Production mutations require a separately authorized rollout. Store secrets in ignored local or deployment configuration; never log secrets, tokens, full secure links, or customer data. Verify staging behavior before promotion.

Detailed staging evidence and prerequisites are maintained in [Supabase staging validation](../supabase-staging-validation.md) and [Google OAuth live testing](../google-oauth-live-test.md).
