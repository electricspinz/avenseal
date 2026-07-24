# Staging and Production Safety

Live Supabase tests and staging seeding require:

```text
LIVE_SUPABASE_ENVIRONMENT=staging
```

Use explicit live-test flags, safe recipient configuration, synthetic fixtures, provider sandbox/test modes, and cleanup. Verify migration alignment before and after staging changes. Test webhooks only against safe endpoints and credentials.

For SMTP-backed communications in staging, set `COMMUNICATION_SAFE_RECIPIENTS` to a comma-separated allowlist. When `LIVE_SUPABASE_ENVIRONMENT=staging`, delivery to any other recipient is skipped and recorded without sending email.

Production is not a development test environment. Production mutations require a separately authorized rollout. Store secrets in ignored local or deployment configuration; never log secrets, tokens, full secure links, or customer data. Verify staging behavior before promotion.

Detailed staging evidence and prerequisites are maintained in [Supabase staging validation](../supabase-staging-validation.md) and [Google OAuth live testing](../google-oauth-live-test.md).
