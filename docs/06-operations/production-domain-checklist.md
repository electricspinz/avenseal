# Production Domain Checklist

**Canonical public domain:** `https://www.avenseal.com`  
**Apex redirect:** `https://avenseal.com` → `https://www.avenseal.com`  
**Temporary fallback:** `https://avenseal.vercel.app` (retain only in external allowlists while needed)

This is an operator-run release checklist. It records required external configuration without storing credentials or asserting that a third-party dashboard has been configured.

## Source-controlled contract

| Setting | Required production value | Source-controlled behavior |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://www.avenseal.com` | Customer links, redirects, and Stripe Checkout return URLs derive from it. Production rejects local or non-HTTPS values. |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://www.avenseal.com/api/admin/integrations/google/callback` | Both Google authorization and token exchange use this same configured value. |
| Admin mutation origin | `https://www.avenseal.com` | Cookie-authorized mutations require the exact configured origin. The apex is not a trusted mutation origin because it redirects to `www`. |
| Public metadata | `https://www.avenseal.com` | Root metadata, sitemap, robots host, canonical, and Open Graph URL use the canonical domain. |

## Vercel

- [ ] Add and verify `www.avenseal.com` as the production domain.
- [ ] Add and verify `avenseal.com`; configure an apex-to-`www` redirect in the platform domain settings.
- [ ] Confirm HTTPS certificates are valid for both domains and that the redirect has no loop.
- [ ] Set production `NEXT_PUBLIC_SITE_URL=https://www.avenseal.com` and the production server-only variables from `.env.example`.
- [ ] Set the GitHub communications scheduler secret `AVENSEAL_APP_URL=https://www.avenseal.com` only after the production deployment is live.
- [ ] Redeploy after environment changes and test a preview deployment separately; do not point staging values at production.

## Supabase

- [ ] Set Site URL to `https://www.avenseal.com`.
- [ ] Allow redirect URLs: `https://www.avenseal.com/**`, `https://avenseal.com/**`, and, while retained, `https://avenseal.vercel.app/**`.
- [ ] Verify the production Supabase project has all required migrations and RLS policies applied.
- [ ] Verify backup and restore ownership, schedule, and a documented restore exercise.

## Google OAuth

- [ ] Use a production OAuth client, separate from staging.
- [ ] Add authorized JavaScript origin `https://www.avenseal.com`.
- [ ] Add redirect URI `https://www.avenseal.com/api/admin/integrations/google/callback`.
- [ ] Confirm consent-screen publishing and approved scopes before a production connection.

## Stripe

- [ ] Set live secret and publishable keys in the deployment platform; do not store either in source control.
- [ ] Register `https://www.avenseal.com/api/webhooks/stripe` as the live webhook endpoint and set its signing secret.
- [ ] Enable only the events consumed by the repository: `checkout.session.completed` and `payment_intent.succeeded`.
- [ ] Exercise success and cancellation returns, webhook signature validation, receipt configuration, and the documented refund process in live-mode release verification.

## BlueNotary

- [ ] Obtain production credentials and the official provider contract before any API connection.
- [ ] Validate any handoff or callback requirement against that contract; no BlueNotary callback URL is defined by the current scaffold.
- [ ] Confirm provider-session handoffs are staff-supplied or trusted server-side and retain audit evidence.

## Email and scheduled work

- [ ] Verify the sender identity and SMTP configuration.
- [ ] Publish and validate SPF, DKIM, and DMARC for the sending domain.
- [ ] Send a controlled production test and confirm appointment links use `https://www.avenseal.com`.
- [ ] Confirm the communications scheduler uses the canonical HTTPS URL and its processor secret.

## Document scanner

- [ ] Keep production scanning disabled until the documented Cloudmersive approval and staging acceptance gates pass.
- [ ] Do not use the staging scan scheduler or `AVENSEAL_STAGING_APP_URL` for production.
- [ ] Before enablement, separately configure the authenticated internal worker target, scanner credentials, monitoring, and incident ownership.

## SEO and public verification

- [ ] Confirm the rendered canonical, Open Graph URL, sitemap, and robots host use `https://www.avenseal.com`.
- [ ] Confirm `https://avenseal.com` redirects once to the canonical URL.
- [ ] Submit the canonical sitemap through the selected search-console account after legal copy is approved.
- [ ] Do not publish attorney-review legal drafts until approval is recorded.
