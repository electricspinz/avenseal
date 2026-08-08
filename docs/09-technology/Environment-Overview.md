# Environment Overview

## Purpose

Describe environment categories safely, without recording values or secrets.

**Status:** Current working reference
**Last Updated:** 2026-08-08

## Configuration categories

The repository expects server-side configuration for Supabase, payment processing, email delivery, Google Calendar, authenticated admin sessions, public site URLs, and internal operational jobs. Browser-visible configuration must be limited to values explicitly intended for browser use; privileged values remain server-only.

## Operating rules

Use separate credentials and data for non-production validation. Do not commit environment files, tokens, passwords, signing secrets, provider keys, or customer information. Treat missing configuration as an operational issue, not a reason to add insecure fallbacks to production behavior.

## To Be Finalized

Approved environment matrix, secret ownership and rotation schedule, staging policy, and production readiness evidence.

## Related

- [Deployment](./Deployment.md)
- [Integrations](./Integrations.md)
